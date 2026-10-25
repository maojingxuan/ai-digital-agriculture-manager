import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isolatedStore } from "./stage2-test-support.mjs";
import { PatrolDemoService } from "../apps/api/dist/services/patrolDemoService.js";
import { PersistenceService } from "../apps/api/dist/services/persistenceService.js";
import { demoKnowledge } from "../apps/api/dist/services/patrolDemoKnowledge.js";

const { prisma, users, databasePath } = await isolatedStore();
const [admin, user] = users;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("External APIs disabled for Stage 2 verification");
};
const service = new PatrolDemoService(prisma, {
  autoSchedule: false,
  presentationMs: 0,
});
const input = (
  scenarioId = "high-humidity",
  humidity = 91,
  threshold = 85,
) => ({ scenarioId, humidity, threshold, requestKey: randomUUID() });
async function finish(run, instance = service) {
  for (let i = 0; i < 6 && run.status === "running"; i++)
    run = await instance.advance(run.id);
  assert.equal(run.status, "complete");
  return run;
}
try {
  const payload = input();
  const starts = await Promise.all([
    service.start(payload, user),
    service.start(payload, user),
  ]);
  assert.equal(starts[0].id, starts[1].id, "same request key creates one job");
  await assert.rejects(service.start(input(), user), /已有未结束/);
  await assert.rejects(service.get(starts[0].id, admin), /其他账号/);
  await assert.rejects(
    service.command(starts[0].id, "cancel", admin),
    /其他账号/,
  );
  let run = await service.advance(starts[0].id);
  run = await service.command(run.id, "pause", user);
  assert.equal((await service.advance(run.id)).currentStep, 0);
  await assert.rejects(service.command(run.id, "retry", user), /不支持/);
  run = await service.command(run.id, "resume", user);
  run = await finish(run);
  assert.equal(run.environment.risk, true);
  assert.equal(run.visual.mode, "illustrative-preset");
  assert.equal("confidence" in run.visual, false);
  assert.ok(run.sources.every((source) => source.url.startsWith("https://")));
  assert.ok(run.steps.every((step) => step.status === "completed"));
  assert.equal(await prisma.patrolRecord.count(), 1);
  assert.equal(await prisma.warning.count(), 1);
  await Promise.all([service.advance(run.id), service.advance(run.id)]);
  assert.equal((await service.start(payload, user)).reportId, run.reportId);
  assert.equal(
    await prisma.patrolRecord.count(),
    1,
    "save and start retries never duplicate report",
  );
  await assert.rejects(service.resolveReview(run.id, admin), /其他账号/);
  run = await service.resolveReview(run.id, user);
  await service.resolveReview(run.id, user);
  assert.equal(run.review.status, "resolved");
  assert.equal(
    (await prisma.warning.findUnique({ where: { id: run.review.id } })).status,
    "resolved",
  );
  const persistence = new PersistenceService(prisma);
  assert.equal((await persistence.listPatrols(admin.id, false)).length, 0);
  const reports = await service.enrichReports(
    await persistence.listPatrols(user.id, false),
  );
  assert.equal(reports[0].demo.environment.humidity, 91);
  assert.equal(reports[0].demo.review.status, "resolved");

  for (const [scenario, humidity, threshold, risk] of [
    ["normal", 68, 85, false],
    ["high-humidity", 91, 95, false],
    ["normal", 91, 85, true],
    ["normal", 85, 85, true],
  ]) {
    const completed = await finish(
      await service.start(input(scenario, humidity, threshold), user),
    );
    assert.equal(
      completed.environment.risk,
      risk,
      "environment logic follows inputs, not script outcome",
    );
    assert.equal(
      completed.visual.imageUrl.includes("spots"),
      scenario === "high-humidity",
      "visual preset remains independent of environment risk",
    );
  }
  const reportCount = await prisma.patrolRecord.count();
  const cancelled = await service.start(input(), user);
  await service.advance(cancelled.id);
  await service.command(cancelled.id, "cancel", user);
  assert.equal((await service.advance(cancelled.id)).status, "cancelled");
  assert.equal(await prisma.patrolRecord.count(), reportCount);

  // Restart recovery preserves evidence and never automatically resumes writes.
  let recovery = await service.start(input(), user);
  recovery = await service.advance(recovery.id);
  const restarted = new PatrolDemoService(prisma, {
    autoSchedule: false,
    presentationMs: 0,
  });
  await restarted.recover();
  recovery = await restarted.get(recovery.id, user);
  assert.equal(recovery.status, "paused");
  assert.equal(recovery.steps[0].status, "completed");
  recovery = await restarted.command(recovery.id, "resume", user);
  await finish(recovery, restarted);
  restarted.close();

  const documents = [];
  const empty = new PatrolDemoService(prisma, {
    autoSchedule: false,
    presentationMs: 0,
    knowledge: documents,
  });
  let missing = await empty.start(input(), user);
  for (let i = 0; i < 4; i++) missing = await empty.advance(missing.id);
  assert.equal(missing.status, "failed");
  assert.equal(missing.steps[3].status, "failed");
  documents.push(...demoKnowledge);
  missing = await empty.command(missing.id, "retry", user);
  await finish(missing, empty);
  empty.close();

  // A transaction failure must leave no orphan report/review; retry succeeds once.
  let rollback = await service.start(input(), user);
  for (let i = 0; i < 5; i++) rollback = await service.advance(rollback.id);
  const before = await prisma.patrolRecord.count();
  const realTransaction = prisma.$transaction.bind(prisma);
  prisma.$transaction = async (...args) => {
    if (typeof args[0] !== "function") return realTransaction(...args);
    return realTransaction(async (tx) => {
      await args[0](tx);
      throw new Error("Injected commit failure");
    });
  };
  rollback = await service.advance(rollback.id);
  prisma.$transaction = realTransaction;
  assert.equal(rollback.status, "failed");
  assert.equal(await prisma.patrolRecord.count(), before);
  assert.equal(
    await prisma.warning.findUnique({ where: { id: `${rollback.id}-review` } }),
    null,
  );
  rollback = await service.command(rollback.id, "retry", user);
  rollback = await finish(rollback);
  assert.equal(await prisma.patrolRecord.count(), before + 1);

  // Five additional complete runs verify repeatability without clearing saved reports.
  for (let i = 0; i < 5; i++)
    await finish(
      await service.start(
        input(i % 2 ? "normal" : "high-humidity", i % 2 ? 68 : 91),
        user,
      ),
    );
  console.log(
    "PASS Stage 2: deduplication, pause/resume/cancel, thresholds, independent visual presets, sourced offline retrieval, ownership, history, review, restart recovery, missing knowledge retry, atomic save retry, five repeated runs.",
  );
  console.log(`Isolated test database only: ${databasePath}`);
} finally {
  service.close();
  globalThis.fetch = originalFetch;
  await prisma.$disconnect();
}
