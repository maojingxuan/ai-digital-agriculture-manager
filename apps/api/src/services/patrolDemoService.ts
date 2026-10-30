import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  demoStepTitles,
  type AuthUser,
  type DemoCommand,
  type DemoKnowledgeSource,
  type DemoReportEvidence,
  type DemoRun,
  type DemoScenario,
  type DemoStepId,
  type PatrolReport,
  type StartDemoInput,
} from "@agri/shared";
import {
  demoKnowledge,
  searchDemoKnowledge,
} from "./patrolDemoKnowledge.js";
import {
  getGreenhouses,
  getRealtimeSnapshot,
} from "./sensorSimulator.js";

const stepIds: DemoStepId[] = [
  "observe",
  "environment",
  "vision",
  "knowledge",
  "advice",
  "save",
];
// 从所选大棚名称推断作物，用于巡田报告归档；无法识别时使用通用名称。
function inferCrop(greenhouseName: string): string {
  const keywords: Array<[string, string]> = [
    ["玉米", "玉米"],
    ["制种", "玉米"],
  ];
  for (const [keyword, crop] of keywords)
    if (greenhouseName.includes(keyword)) return crop;
  return "玉米";
}
const terminal = (run: DemoRun) =>
  run.status === "complete" || run.status === "cancelled";
const json = (run: DemoRun) =>
  JSON.parse(JSON.stringify(run)) as Prisma.InputJsonValue;
const decode = (payload: Prisma.JsonValue) =>
  structuredClone(payload) as unknown as DemoRun;
export class DemoError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message);
  }
}

export class PatrolDemoService {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private locks = new Map<string, Promise<unknown>>();
  private readonly presentationMs: number;
  private readonly autoSchedule: boolean;
  private readonly knowledge: DemoKnowledgeSource[];
  constructor(
    private readonly prisma: PrismaClient,
    options: {
      presentationMs?: number;
      autoSchedule?: boolean;
      knowledge?: DemoKnowledgeSource[];
    } = {},
  ) {
    this.presentationMs = options.presentationMs ?? 12000;
    this.autoSchedule = options.autoSchedule ?? true;
    this.knowledge = options.knowledge ?? demoKnowledge;
  }

  private async locked<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }
  private clearTimer(id: string) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }
  private schedule(id: string, delay = 0) {
    if (!this.autoSchedule) return;
    this.clearTimer(id);
    const timer = setTimeout(
      () => {
        this.timers.delete(id);
        void this.advance(id).catch((error) =>
          console.error("[Patrol demo scheduler]", error),
        );
      },
      Math.max(0, delay),
    );
    timer.unref();
    this.timers.set(id, timer);
  }
  close() {
    for (const id of this.timers.keys()) this.clearTimer(id);
  }
  private async store(run: DemoRun) {
    run.updatedAt = new Date().toISOString();
    await this.prisma.patrolDemoRun.update({
      where: { id: run.id },
      data: { payload: json(run) },
    });
  }
  private async find(id: string) {
    const row = await this.prisma.patrolDemoRun.findUnique({ where: { id } });
    if (!row) throw new DemoError("未找到巡田任务。", 404);
    return decode(row.payload);
  }
  async get(id: string, user: AuthUser) {
    const run = await this.find(id);
    if (run.userId !== user.id)
      throw new DemoError("不能访问其他账号的巡田任务。", 403);
    return run;
  }
  async current(user: AuthUser) {
    const rows = await this.prisma.patrolDemoRun.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const runs = rows.map((row) => decode(row.payload));
    return runs.find((run) => !terminal(run)) ?? runs[0] ?? null;
  }
  async recover() {
    const rows = await this.prisma.patrolDemoRun.findMany();
    for (const row of rows) {
      const run = decode(row.payload);
      if (run.status !== "running") continue;
      run.status = "paused";
      run.caption = "服务已重启，任务安全暂停。点击继续从已完成步骤恢复。";
      run.presentationRemainingMs = 0;
      delete run.nextAdvanceAt;
      for (const step of run.steps)
        if (step.status === "running") step.status = "pending";
      await this.store(run);
    }
  }
  async start(input: StartDemoInput, user: AuthUser) {
    return this.locked(`user:${user.id}`, async () => {
      const existing = await this.prisma.patrolDemoRun.findUnique({
        where: {
          userId_requestKey: { userId: user.id, requestKey: input.requestKey },
        },
      });
      if (existing) return decode(existing.payload);
      const active = await this.current(user);
      if (active && !terminal(active))
        throw new DemoError("已有未结束巡田，请继续、重试或取消后再开始。 ");
      const greenhouse = getGreenhouses().find(
        (item) => item.id === input.greenhouseId,
      );
      if (!greenhouse)
        throw new DemoError("所选大棚不存在，请重新选择后开始巡田。", 400);
      // 读取农业数据模块（农业环境数据中心）中该大棚的实时监测数据。
      const snapshot = getRealtimeSnapshot(greenhouse.id);
      const humidity =
        snapshot.metrics.find((metric) => metric.key === "humidity")?.value ?? 0;
      const temperature =
        snapshot.metrics.find((metric) => metric.key === "temperature")?.value ??
        0;
      const soilMoisture =
        snapshot.metrics.find((metric) => metric.key === "soil_moisture")
          ?.value ?? 0;
      const risk = humidity >= input.threshold;
      const scenario: DemoScenario = {
        id: risk ? "high-humidity" : "normal",
        name: risk
          ? `高湿关注 · ${greenhouse.name}`
          : `常规巡田 · ${greenhouse.name}`,
        plotName: greenhouse.name,
        humidity,
        temperature,
        soilMoisture,
        imageUrl: risk ? "/demo/tomato-spots.svg" : "/demo/tomato-normal.svg",
        imageSource: `来自农业环境数据中心「${greenhouse.name}」实时监测的演示示意；不是实拍照片。`,
        visualFinding: risk
          ? `演示设定：${greenhouse.name}当前湿度 ${humidity}% 已达预警阈值 ${input.threshold}%，以黄斑叶片示意环境风险，需人工复核；不是病害确诊。`
          : `演示设定：${greenhouse.name}当前环境平稳，未标出明显叶部异常；不等于真实植株健康。`,
      };
      const time = new Date().toISOString();
      const run: DemoRun = {
        id: `demo-${randomUUID()}`,
        userId: user.id,
        greenhouseId: greenhouse.id,
        scenario: structuredClone(scenario),
        humidity,
        threshold: input.threshold,
        status: "running",
        currentStep: 0,
        caption: `农小贝准备读取「${greenhouse.name}」实时监测数据，不连接真实设备。`,
        createdAt: time,
        updatedAt: time,
        steps: stepIds.map((id) => ({
          id,
          title: demoStepTitles[id],
          status: "pending",
          detail: "等待执行",
        })),
      };
      await this.prisma.patrolDemoRun.create({
        data: {
          id: run.id,
          userId: user.id,
          requestKey: input.requestKey,
          payload: json(run),
        },
      });
      this.schedule(run.id);
      return run;
    });
  }
  async command(id: string, command: DemoCommand, user: AuthUser) {
    return this.locked(id, async () => {
      const run = await this.get(id, user);
      if (terminal(run)) {
        if (command === "cancel" && run.status === "cancelled") return run;
        throw new DemoError(
          "该任务已结束；复位后可开始新巡田，已保存报告不会删除。",
        );
      }
      if (command === "cancel") {
        this.clearTimer(id);
        run.status = "cancelled";
        run.caption = "巡田已取消，未保存报告；已有证据仅保留在该任务记录中。";
        delete run.nextAdvanceAt;
      } else if (command === "pause") {
        if (run.status !== "running")
          throw new DemoError("只有运行中的巡田可以暂停。");
        this.clearTimer(id);
        run.presentationRemainingMs = run.nextAdvanceAt
          ? Math.max(0, Date.parse(run.nextAdvanceAt) - Date.now())
          : 0;
        delete run.nextAdvanceAt;
        run.status = "paused";
        run.caption =
          "巡田已暂停，证据已保留。继续后接着执行，不重复生成报告。";
      } else {
        if (
          (command === "resume" && run.status !== "paused") ||
          (command === "retry" && run.status !== "failed")
        )
          throw new DemoError("当前任务状态不支持该操作。");
        this.clearTimer(id);
        const step = run.steps[run.currentStep];
        if (step.status === "failed") {
          step.status = "pending";
          step.detail = "等待重新执行";
        }
        run.status = "running";
        delete run.error;
        const delay =
          step.status === "completed" ? (run.presentationRemainingMs ?? 0) : 0;
        run.nextAdvanceAt = new Date(Date.now() + delay).toISOString();
        run.caption = "农小贝继续巡田，已完成证据不会丢失。";
        await this.store(run);
        this.schedule(id, delay);
        return run;
      }
      await this.store(run);
      return run;
    });
  }

  // Each step executes real local work. The subsequent dwell is presentation time,
  // never labelled as model inference or a running tool call.
  async advance(id: string) {
    return this.locked(id, async () => {
      const run = await this.find(id);
      if (run.status !== "running") return run;
      if (run.steps[run.currentStep].status === "completed") run.currentStep++;
      const step = run.steps[run.currentStep];
      if (!step) throw new DemoError("巡田步骤状态异常。", 500);
      step.status = "running";
      step.startedAt = new Date().toISOString();
      step.detail = "正在执行本地步骤";
      delete run.nextAdvanceAt;
      await this.store(run);
      const begin = performance.now();
      try {
        switch (step.id) {
          case "observe":
            run.caption = `已读取所选大棚「${run.scenario.plotName}」实时监测数据：湿度 ${run.humidity}%、温度 ${run.scenario.temperature}℃、土壤湿度 ${run.scenario.soilMoisture}%。数据来自农业环境数据中心。`;
            break;
          case "environment": {
            const risk = run.humidity >= run.threshold;
            run.environment = {
              humidity: run.humidity,
              threshold: run.threshold,
              temperature: run.scenario.temperature,
              soilMoisture: run.scenario.soilMoisture,
              risk,
              source: "agriculture",
              explanation: risk
                ? `所选大棚「${run.scenario.plotName}」实时湿度 ${run.humidity}% ≥ 预警阈值 ${run.threshold}%，触发环境风险提醒；这不是病害诊断。`
                : `所选大棚「${run.scenario.plotName}」实时湿度 ${run.humidity}% < 预警阈值 ${run.threshold}%，本轮未触发高湿提醒；低于阈值不代表无病害。`,
            };
            run.caption = run.environment.explanation;
            break;
          }
          case "vision":
            run.visual = {
              mode: "illustrative-preset",
              imageUrl: run.scenario.imageUrl,
              source: run.scenario.imageSource,
              finding: run.scenario.visualFinding,
              notice:
                "演示视觉结果：使用农业数据中心监测状态对应的预设叶片示意，没有执行图像模型推理，没有置信度；不能用于真实诊断。",
            };
            run.caption = run.visual.finding;
            break;
          case "knowledge":
            run.sources = searchDemoKnowledge(
              run.environment?.risk
                ? "玉米高湿湿度通风叶片叶斑病复核"
                : "玉米叶片叶面灌溉巡查复核",
              this.knowledge,
            );
            if (!run.sources.length)
              throw new Error(
                "未找到可追溯的本地资料，停止生成建议。请检查内置知识资料后重试。",
              );
            run.caption = `本地关键词检索命中 ${run.sources.length} 条资料，来源和摘要已展示。没有调用外部大模型。`;
            break;
          case "advice": {
            const flagged = run.scenario.id === "high-humidity";
            run.recommendations = [
              run.environment?.risk
                ? `[1,2] 「${run.scenario.plotName}」触发高湿提醒：人工检查通风与空气流动条件，记录连续湿度和叶面结露情况；本系统不会自动控制设备。`
                : `[3] 「${run.scenario.plotName}」本轮未触发高湿预警，保持常规环境记录和巡查；仍需关注叶面水分。`,
              "[1,3] 浇水尽量避开叶面，补拍清晰的叶片正反面照片，记录异常范围与变化。",
              flagged
                ? "[1] 演示黄斑仅提示需要复核，不能据此确诊大斑病、小斑病或其他病害。"
                : "演示未标注异常不等于真实健康，仍需现场确认。",
              "未经现场复核不生成农药品种、剂量或施用指令；监测数据与视觉演示不得替代植保人员判断。",
            ];
            // Reference numbers refer to canonical documents, not variable rank order.
            run.sources = this.knowledge.map((source) => ({
              ...source,
              score: run.sources?.find((hit) => hit.id === source.id)?.score,
            }));
            run.review = {
              id: `${run.id}-review`,
              title:
                flagged || run.environment?.risk
                  ? "【仿真】复核叶片与环境风险"
                  : "【仿真】完成例行现场确认",
              status: "open",
              checklist: [
                "记录连续湿度与通风情况",
                "补拍叶片正反面照片，记录异常位置",
                "由人员核实，不用模拟结果指导用药",
              ],
            };
            run.caption =
              "建议与人工复核清单已整理；环境风险和叶片演示结论分别保留。";
            break;
          }
          case "save":
            await this.saveReport(run);
            return run;
        }
        step.status = "completed";
        step.finishedAt = new Date().toISOString();
        step.durationMs = Math.round(performance.now() - begin);
        step.detail = run.caption;
        run.nextAdvanceAt = new Date(
          Date.now() + this.presentationMs,
        ).toISOString();
        run.presentationRemainingMs = this.presentationMs;
        await this.store(run);
        this.schedule(id, this.presentationMs);
      } catch (error) {
        run.status = "failed";
        run.error =
          error instanceof Error ? error.message : "巡田步骤执行失败。";
        run.caption = `${step.title}未完成：${run.error}`;
        step.status = "failed";
        step.detail = run.error;
        step.durationMs = Math.round(performance.now() - begin);
        delete run.nextAdvanceAt;
        await this.store(run);
      }
      return run;
    });
  }

  private async saveReport(run: DemoRun) {
    if (
      !run.environment ||
      !run.visual ||
      !run.sources?.length ||
      !run.recommendations ||
      !run.review
    )
      throw new Error("巡田证据不完整，不能保存报告。");
    const reportId = `${run.id}-report`;
    const step = run.steps[run.currentStep];
    const begin = performance.now();
    const finished = structuredClone(run);
    finished.status = "complete";
    finished.reportId = reportId;
    finished.caption =
      "巡田报告与人工复核任务已保存。可从历史记录查看；环境数据来自农业环境数据中心，视觉为演示预设，不是真实诊断。";
    delete finished.nextAdvanceAt;
    finished.steps[finished.currentStep].status = "completed";
    finished.steps[finished.currentStep].finishedAt = new Date().toISOString();
    finished.steps[finished.currentStep].detail = finished.caption;
    finished.updatedAt = new Date().toISOString();
    await this.prisma.$transaction(async (tx) => {
      // 内置演示大棚使用仿真标识避免污染真实大棚数据；自定义大棚直接关联原记录。
      const builtIn = run.greenhouseId.startsWith("demo-");
      const greenhouseId = builtIn
        ? `simulation-${run.greenhouseId}`
        : run.greenhouseId;
      await tx.greenhouse.upsert({
        where: { id: greenhouseId },
        update: {},
        create: {
          id: greenhouseId,
          name: run.scenario.plotName,
          location: builtIn ? "本地仿真场景，非真实硬件" : undefined,
          ownerId: run.userId,
        },
      });
      await tx.patrolRecord.upsert({
        where: { id: reportId },
        update: {},
        create: {
          id: reportId,
          userId: run.userId,
          greenhouseId,
          plotName: run.scenario.plotName,
          cropName: inferCrop(run.scenario.plotName),
          imageUrl: run.visual!.imageUrl,
          growthStatus: "长势待现场确认 · 数据来源：农业环境数据中心监测",
          anomalies:
            run.scenario.id === "high-humidity"
              ? ["监测提示：实时湿度达预警阈值，叶面黄斑待人工复核"]
              : [],
          environmentRisk: run.environment!.explanation,
          suggestion: run.recommendations!.join("\n"),
          conclusion: `【巡田报告】${run.environment!.risk ? "本轮触发环境高湿风险" : "本轮未触发环境高湿风险"}；环境数据来自农业环境数据中心监测，视觉结果为演示预设，未执行真实模型诊断。需要完成现场复核。`,
          createdAt: new Date(),
        },
      });
      await tx.warning.upsert({
        where: { id: run.review!.id },
        update: {},
        create: {
          id: run.review!.id,
          userId: run.userId,
          greenhouseId,
          patrolRecordId: reportId,
          warningType: "patrol_demo_review",
          level: run.environment!.risk ? "medium" : "low",
          title: run.review!.title,
          content: run.review!.checklist.join("\n"),
          status: "open",
        },
      });
      finished.steps[finished.currentStep].durationMs = Math.round(
        performance.now() - begin,
      );
      await tx.patrolDemoRun.update({
        where: { id: run.id },
        data: { payload: json(finished) },
      });
    });
    Object.assign(run, finished);
    step.durationMs = Math.round(performance.now() - begin);
  }

  evidence(run: DemoRun): DemoReportEvidence | undefined {
    if (
      !run.reportId ||
      !run.environment ||
      !run.visual ||
      !run.sources ||
      !run.recommendations ||
      !run.review
    )
      return;
    return {
      version: "patrol-demo-v1",
      runId: run.id,
      scenarioName: run.scenario.name,
      environment: run.environment,
      visual: run.visual,
      sources: run.sources,
      recommendations: run.recommendations,
      review: run.review,
      notice:
        "农业数据中心监测数据 + 自绘示意图 + 预设视觉结果 + 本地关键词检索；不是图像模型推理或真实农场诊断。",
    };
  }
  async enrichReports(reports: PatrolReport[]) {
    const rows = await this.prisma.patrolDemoRun.findMany({
      where: {
        id: {
          in: reports
            .filter((item) => item.id.startsWith("demo-"))
            .map((item) => item.id.replace(/-report$/, "")),
        },
      },
    });
    const byReport = new Map(
      rows.map((row) => {
        const run = decode(row.payload);
        return [run.reportId, this.evidence(run)];
      }),
    );
    return reports.map((report) => ({
      ...report,
      ...(byReport.get(report.id) ? { demo: byReport.get(report.id) } : {}),
    }));
  }
  async resolveReview(id: string, user: AuthUser) {
    return this.locked(id, async () => {
      const run = await this.get(id, user);
      if (run.status !== "complete" || !run.review)
        throw new DemoError("该任务尚未生成可复核报告。");
      if (run.review.status === "resolved") return run;
      run.review.status = "resolved";
      run.review.resolvedAt = new Date().toISOString();
      run.updatedAt = run.review.resolvedAt;
      await this.prisma.$transaction([
        this.prisma.warning.update({
          where: { id: run.review.id },
          data: {
            status: "resolved",
            resolvedAt: new Date(run.review.resolvedAt),
          },
        }),
        this.prisma.patrolDemoRun.update({
          where: { id },
          data: { payload: json(run) },
        }),
      ]);
      return run;
    });
  }
}
