// Uses the actual Stage 2 coordinator/routes/persistence/auth with a fresh test DB.
// No .env, business DB, external model APIs or hardware are accessed.
import express from "express";
import path from "node:path";
import { isolatedStore, projectRoot } from "./stage2-test-support.mjs";
import { AuthService } from "../apps/api/dist/services/authService.js";
import { createAuthenticate } from "../apps/api/dist/middleware/auth.js";
import { PatrolDemoService } from "../apps/api/dist/services/patrolDemoService.js";
import { PersistenceService } from "../apps/api/dist/services/persistenceService.js";
import { registerPatrolDemoRoutes } from "../apps/api/dist/routes/patrolDemoRoutes.js";

process.env.AUTH_SECRET = "stage2-local-test-only-not-a-production-secret-2026";
const { prisma, databasePath } = await isolatedStore();
const auth = new AuthService(prisma);
const persistence = new PersistenceService(prisma);
const demo = new PatrolDemoService(prisma);
const app = express();
app.use(express.json());
app.post("/api/auth/login", async (req, res) => {
  try {
    res.json(await auth.login(req.body.identifier, req.body.password));
  } catch {
    res.status(401).json({ message: "隔离测试账号或密码错误" });
  }
});
app.use("/api", createAuthenticate(auth));
app.get("/api/auth/me", (req, res) => res.json(req.auth));
registerPatrolDemoRoutes(app, demo);
app.get("/api/patrols", async (req, res) =>
  res.json(
    await demo.enrichReports(
      await persistence.listPatrols(req.auth.id, req.auth.role === "admin"),
    ),
  ),
);
app.get("/api/llm/status", (_req, res) =>
  res.json({
    configured: false,
    provider: "隔离测试：本地规则",
    model: "none",
    baseUrl: "",
  }),
);
app.get("/api/agriculture-data/current", (_req, res) =>
  res.json({
    greenhouseId: "demo",
    farmName: "界面验证",
    updatedAt: new Date().toISOString(),
    metrics: [],
    summary: "隔离验证数据",
    status: "optimal",
  }),
);
app.post("/api/agent/chat", (_req, res) =>
  res.json({
    id: `chat-${Date.now()}`,
    role: "assistant",
    content: "隔离测试回复。正式项目继续使用原有 Agent。",
    createdAt: new Date().toISOString(),
  }),
);
app.get(/^\/api\//, (_req, res) => res.json([]));
const dist = path.join(projectRoot, "apps/web/dist");
app.use(express.static(dist, { maxAge: 0 }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
const server = app.listen(4175, "127.0.0.1", () => {
  console.log(
    "Stage 2 isolated UI: http://localhost:4175 — real coordinator, test data only",
  );
  console.log(`Test database: ${databasePath}`);
});
async function shutdown() {
  demo.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
