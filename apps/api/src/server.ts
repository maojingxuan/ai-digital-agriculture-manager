import "./config/env.js";
import cors from "cors";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import express from "express";
import multer from "multer";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  getAnomalies,
  getDashboard,
  getGreenhouses,
  getHistory,
  getRealtimeSnapshot,
  getSensors
} from "./services/sensorSimulator.js";
import { prisma } from "./db/client.js";
import { KnowledgeService } from "./services/knowledgeService.js";
import { RetrievalService } from "./services/retrievalService.js";
import { AgentToolRegistry } from "./services/agentTools.js";
import { AgentAuthorizationError, ZhinongAgentService } from "./services/zhinongAgentService.js";
import { llmService } from "./services/llmService.js";
import { YoloDiagnosisService } from "./services/yoloDiagnosisService.js";
import { resolveApiPath } from "./config/paths.js";
import { PersistenceService } from "./services/persistenceService.js";
import { AuthenticationError, AuthService, verifyPassword } from "./services/authService.js";
import { createAuthenticate, requireAdmin } from "./middleware/auth.js";
import { verifyMediaRequest } from "./services/mediaAuth.js";
import { DeviceControlService } from "./services/deviceControlService.js";
import { PatrolDemoService } from "./services/patrolDemoService.js";
import { registerPatrolDemoRoutes } from "./routes/patrolDemoRoutes.js";
import { ttsService } from "./services/ttsService.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

const uploadDir = resolveApiPath(process.env.UPLOAD_DIR, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ---- 上传安全限制（防资源耗尽）：按接口限制文件大小与类型 ----
type UploadPolicy = {
  maxSize: number;
  allowedMime: string[];
  allowedExt: string[];
  allowUnknownMime: boolean;
};

const IMAGE_UPLOAD_POLICY: UploadPolicy = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedMime: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"],
  allowedExt: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"],
  allowUnknownMime: false
};
const VIDEO_UPLOAD_POLICY: UploadPolicy = {
  maxSize: 50 * 1024 * 1024, // 50MB
  allowedMime: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/mpeg"],
  allowedExt: [".mp4", ".webm", ".mov", ".avi", ".mpeg", ".mpg"],
  allowUnknownMime: false
};
const DOC_UPLOAD_POLICY: UploadPolicy = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedMime: ["text/plain", "text/markdown", "text/csv"],
  allowedExt: [".txt", ".md", ".markdown", ".csv"],
  allowUnknownMime: true // 文本类常被客户端标为 application/octet-stream 或空，按扩展名兜底
};

function makeUploader(policy: UploadPolicy) {
  return multer({
    dest: uploadDir,
    limits: { fileSize: policy.maxSize, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = (file.mimetype ?? "").toLowerCase();
      const extOk = policy.allowedExt.includes(ext);
      if (!extOk) {
        cb(new Error(`不支持的文件类型：${file.originalname || "未知文件"}（仅允许 ${policy.allowedExt.join(" / ")} 文件）`));
        return;
      }
      if (policy.allowedMime.includes(mime) || mime === "" || policy.allowUnknownMime) {
        cb(null, true);
        return;
      }
      cb(new Error(`文件内容与扩展名不匹配：${file.originalname || "未知文件"}`));
    }
  });
}

function uploadErrorHandler(err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: "文件超过大小限制，请压缩后重试。" });
      return;
    }
    res.status(400).json({ message: `上传失败：${err.code}` });
    return;
  }
  res.status(400).json({ message: err instanceof Error ? err.message : "上传失败。" });
}

const uploadImage = makeUploader(IMAGE_UPLOAD_POLICY);
const uploadVideo = makeUploader(VIDEO_UPLOAD_POLICY);
const uploadDoc = makeUploader(DOC_UPLOAD_POLICY);
const knowledgeService = new KnowledgeService(prisma);
const retrievalService = new RetrievalService(prisma, undefined, llmService);
const yoloDiagnosisService = new YoloDiagnosisService(retrievalService, llmService);
const persistenceService = new PersistenceService(prisma);
const patrolDemoService = new PatrolDemoService(prisma);
const authService = new AuthService(prisma);
const deviceControlService = new DeviceControlService(prisma);
const agentTools = new AgentToolRegistry(prisma, retrievalService);
const zhinongAgent = new ZhinongAgentService(prisma, agentTools);
const loginAttempts = new Map<string, { failures: number; blockedUntil: number }>();

// CORS 白名单：仅允许前端开发服务器（Vite 5173）及通过 CORS_ALLOWED_ORIGINS 环境变量追加的来源
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
]);

app.use(
  cors({
    origin(origin, callback) {
      // 无 Origin：同源请求、curl/脚本等非浏览器客户端不受 CORS 约束 → 放行
      if (!origin) return callback(null, true);
      // 白名单内 → 附加 Access-Control-Allow-Origin
      if (allowedOrigins.has(origin)) return callback(null, true);
      // 白名单外 → 不附加 ACAO 头，由浏览器拦截；服务端正常处理
      return callback(null, false);
    }
  })
);
app.use(express.json());
// uploads 静态托管需要媒体签名（见 services/mediaAuth.ts），防止诊断图片/视频匿名访问
const mediaGate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const file = (req.path ?? "").replace(/^\/+/, "");
  if (!verifyMediaRequest(file, String(req.query.sig ?? ""), String(req.query.exp ?? ""))) {
    res.status(403).json({ message: "媒体链接无效或已过期，请刷新页面后重试。" });
    return;
  }
  next();
};
app.use("/uploads", mediaGate, express.static(uploadDir));
app.use("/api/uploads", mediaGate, express.static(uploadDir));

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

// 安全审计：登录/注册/改密等认证事件落库（90 天保留，管理员可查）
async function logSecurityEvent(event: {
  eventType: string;
  identifier: string;
  userId?: string | null;
  ip?: string;
  success: boolean;
  detail?: string;
}) {
  try {
    await prisma.securityEvent.create({
      data: {
        eventType: event.eventType,
        identifier: event.identifier.slice(0, 200),
        userId: event.userId ?? null,
        ipAddress: event.ip ?? null,
        success: event.success,
        detail: event.detail ? event.detail.slice(0, 500) : null
      }
    });
  } catch (error) {
    console.error("[SecurityEvent] 审计写入失败:", error);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "AI数字农业管家 API", time: now() });
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = z.object({
    identifier: z.string().trim().min(1),
    password: z.string().min(8)
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "请输入账号和至少8位密码。" });
    return;
  }
  const attemptKey = `${req.ip}:${parsed.data.identifier.toLowerCase()}`;
  const attempt = loginAttempts.get(attemptKey);
  if (attempt && attempt.blockedUntil > Date.now()) {
    void logSecurityEvent({
      eventType: "login_blocked",
      identifier: parsed.data.identifier,
      ip: req.ip,
      success: false,
      detail: "登录失败次数过多，15分钟锁定"
    });
    res.status(429).json({ message: "登录失败次数过多，请15分钟后再试。" });
    return;
  }
  try {
    const result = await authService.login(parsed.data.identifier, parsed.data.password);
    loginAttempts.delete(attemptKey);
    void logSecurityEvent({
      eventType: "login",
      identifier: parsed.data.identifier,
      userId: result.user.id,
      ip: req.ip,
      success: true
    });
    res.json(result);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      const failures = (attempt?.failures ?? 0) + 1;
      loginAttempts.set(attemptKey, {
        failures,
        blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0
      });
      void logSecurityEvent({
        eventType: "login_failure",
        identifier: parsed.data.identifier,
        ip: req.ip,
        success: false,
        detail: error.message
      });
    }
    res.status(error instanceof AuthenticationError ? 401 : 500).json({
      message: error instanceof Error ? error.message : "登录失败。"
    });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1, "请输入姓名或昵称").max(50),
    identifier: z.string().trim().min(1, "请输入邮箱或手机号"),
    password: z.string().min(8, "密码长度至少为8位").max(128),
    role: z.enum(["admin", "user"]).optional(),
    adminCode: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数格式不正确。" });
    return;
  }

  try {
    const result = await authService.register(parsed.data);
    void logSecurityEvent({
      eventType: "register",
      identifier: parsed.data.identifier,
      userId: result.user.id,
      ip: req.ip,
      success: true
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      void logSecurityEvent({
        eventType: "register_failure",
        identifier: parsed.data.identifier,
        ip: req.ip,
        success: false,
        detail: error.message
      });
    }
    res.status(error instanceof AuthenticationError ? 400 : 500).json({
      message: error instanceof Error ? error.message : "注册失败。"
    });
  }
});

app.use("/api", createAuthenticate(authService));

app.get("/api/auth/me", (req, res) => {
  res.json(req.auth);
});

registerPatrolDemoRoutes(app, patrolDemoService);

app.post("/api/auth/change-password", async (req, res) => {
  const parsed = z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8).max(128)
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "新密码必须为8至128位。" });
    return;
  }
  try {
    await authService.changePassword(req.auth!.id, parsed.data.currentPassword, parsed.data.newPassword);
    const identity = req.auth!.email ?? req.auth!.phone ?? req.auth!.id;
    void logSecurityEvent({
      eventType: "password_change",
      identifier: identity,
      userId: req.auth!.id,
      ip: req.ip,
      success: true
    });
    res.json({ success: true, message: "密码已更新，请使用新密码登录。" });
  } catch (error) {
    const identity = req.auth!.email ?? req.auth!.phone ?? req.auth!.id;
    void logSecurityEvent({
      eventType: "password_change_failure",
      identifier: identity,
      userId: req.auth!.id,
      ip: req.ip,
      success: false,
      detail: error instanceof Error ? error.message : undefined
    });
    res.status(error instanceof AuthenticationError ? 400 : 500).json({
      message: error instanceof Error ? error.message : "密码修改失败。"
    });
  }
});

app.get("/api/llm/status", (_req, res) => {
  res.json(llmService.getStatus());
});

app.get("/api/greenhouses", async (_req, res) => {
  const demo = getGreenhouses();
  const custom = await persistenceService.listGreenhouses();
  res.json([...demo, ...custom]);
});

async function verifyAdminPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true }
  });
  if (!user?.passwordHash) return false;
  return verifyPassword(password, user.passwordHash);
}

const createGreenhouseSchema = z.object({
  name: z.string().min(1, "大棚名称不能为空"),
  location: z.string().optional(),
  area: z.number().optional(),
  adminPassword: z.string().min(1, "请输入管理员密码")
});

app.post("/api/greenhouses", requireAdmin, async (req, res) => {
  const { adminPassword, ...data } = createGreenhouseSchema.parse(req.body);
  if (!(await verifyAdminPassword(req.auth!.id, adminPassword))) {
    res.status(403).json({ message: "管理员密码错误，操作已取消。" });
    return;
  }
  const greenhouse = await persistenceService.createGreenhouse(data, req.auth!.id);
  res.status(201).json(greenhouse);
});

app.delete("/api/greenhouses/:id", requireAdmin, async (req, res) => {
  const { adminPassword } = z
    .object({ adminPassword: z.string().min(1, "请输入管理员密码") })
    .parse(req.body ?? {});
  if (!(await verifyAdminPassword(req.auth!.id, adminPassword))) {
    res.status(403).json({ message: "管理员密码错误，操作已取消。" });
    return;
  }
  const deleted = await persistenceService.deleteGreenhouse(String(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: "大棚不存在或为系统内置大棚，无法删除。" });
    return;
  }
  res.json({ success: true });
});

// 解析 sensor-data 的 hours 参数：合法范围 1~720 小时（30 天），非有限数字回退默认 24
function parseHours(raw: unknown, fallback = 24, min = 1, max = 720): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

app.get("/api/sensors", (req, res) => {
  res.json(getSensors(String(req.query.greenhouseId ?? "")));
});

app.get("/api/sensor-data/realtime", (req, res) => {
  res.json(getRealtimeSnapshot(String(req.query.greenhouseId ?? "")));
});

app.get("/api/sensor-data/history", (req, res) => {
  res.json(getHistory(String(req.query.greenhouseId ?? ""), parseHours(req.query.hours)));
});

app.get("/api/sensor-data/anomalies", (req, res) => {
  res.json(getAnomalies(String(req.query.greenhouseId ?? ""), parseHours(req.query.hours)));
});

app.get("/api/dashboard/environment", (req, res) => {
  res.json(getDashboard(String(req.query.greenhouseId ?? "")));
});

app.get("/api/agriculture-data/current", (_req, res) => {
  res.json(getRealtimeSnapshot());
});

app.get("/api/knowledge/documents", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 20);
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  // 高级检索参数：入库时间范围、来源类型、来源机构、排序
  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
  const sourceType = typeof req.query.sourceType === "string" ? req.query.sourceType : undefined;
  const source = typeof req.query.source === "string" ? req.query.source : undefined;
  const sortBy = req.query.sortBy === "oldest" ? ("oldest" as const) : ("newest" as const);

  const result = await knowledgeService.listDocuments({
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    pageSize: Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.floor(pageSize))) : 20,
    category: category || undefined,
    search: search || undefined,
    dateFrom,
    dateTo,
    sourceType,
    source,
    sortBy
  });
  res.json(result);
});

app.get("/api/knowledge/documents/:id", async (req, res) => {
  const document = await knowledgeService.getDocument(req.params.id);
  if (!document) {
    res.status(404).json({ message: "未找到该知识文档。" });
    return;
  }
  res.json(document);
});

app.delete("/api/knowledge/documents/:id", requireAdmin, async (req, res) => {
  try {
    await knowledgeService.deleteDocument(String(req.params.id));
    res.json({ success: true, message: "文档已删除。" });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "删除失败。" });
  }
});

app.post("/api/knowledge/documents", requireAdmin, async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    category: z.string().min(1),
    content: z.string().min(1),
    sourceType: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "知识标题、分类和内容不能为空。" });
    return;
  }

  try {
    const document = await knowledgeService.createKnowledge({
      ...parsed.data,
      metadata: parsed.data.metadata as Prisma.InputJsonObject | undefined
    });
    res.status(201).json(document);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "知识创建失败。" });
  }
});

app.post("/api/knowledge/upload", requireAdmin, uploadDoc.single("file"), async (req: express.Request, res: express.Response) => {
  if (!req.file) {
    res.status(400).json({ message: "请上传知识文档。" });
    return;
  }

  const category = String(req.body.category ?? "未分类知识");
  const title = req.body.title ? String(req.body.title) : undefined;

  try {
    const document = await knowledgeService.createKnowledgeFromUpload(req.file, category, title);
    res.status(201).json(document);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "文档解析失败。" });
  }
}, uploadErrorHandler);

app.get("/api/knowledge/search", async (req, res) => {
  const query = String(req.query.query ?? "");
  if (!query.trim()) {
    res.status(400).json({ message: "请输入检索问题。" });
    return;
  }

  const topK = Number(req.query.topK ?? 5);
  const minScore = Number(req.query.minScore ?? 0.18);
  res.json(await retrievalService.search(query, { topK, minScore }));
});

app.post("/api/knowledge/answer", async (req, res) => {
  const schema = z.object({
    query: z.string().min(1),
    topK: z.number().int().positive().optional(),
    minScore: z.number().min(0).max(1).optional()
  });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "请输入有效问题。" });
    return;
  }

  res.json(await retrievalService.answer(parsed.data.query, parsed.data));
});

app.get("/api/knowledge/retrieval-logs", requireAdmin, async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  // limit 钳制在 1~500，防止一次拉取全量日志
  res.json(await retrievalService.listLogs(Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.floor(limit))) : 20));
});

// 安全事件审计查询：仅管理员；支持按事件类型过滤；limit 钳制 1~500；顺带清理 90 天前过期事件
app.get("/api/security-events", requireAdmin, async (req, res) => {
  try {
    await prisma.securityEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } }
    });
    const rawLimit = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.floor(rawLimit))) : 100;
    const type = typeof req.query.type === "string" && req.query.type ? req.query.type : undefined;
    const events = await prisma.securityEvent.findMany({
      where: type ? { eventType: type } : {},
      orderBy: { createdAt: "desc" },
      take: limit
    });
    res.json({ total: events.length, items: events });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "安全事件读取失败。" });
  }
});

app.get("/api/agent/tools", (_req, res) => {
  res.json({
    agentName: "智农 Agent",
    tools: agentTools.listTools().filter((tool) => tool !== "control_device" || _req.auth?.role === "admin")
  });
});

app.post("/api/agent/chat", async (req, res) => {
  const schema = z.object({
    message: z.string().min(1),
    conversationId: z.string().optional(),
    confirmExecution: z.boolean().optional(),
    imageUrl: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "请输入有效问题。" });
    return;
  }

  try {
    const agentResponse = await zhinongAgent.handle({
      ...parsed.data,
      userId: req.auth!.id,
      userRole: req.auth!.role
    });
    res.json({
      id: id("msg"),
      role: "assistant",
      content: agentResponse.finalReply,
      createdAt: now(),
      agent: agentResponse
    });
  } catch (error) {
    res.status(error instanceof AgentAuthorizationError ? 403 : 500).json({
      message: error instanceof Error ? error.message : "智农 Agent 执行失败。"
    });
  }
});

app.get("/api/devices", async (_req, res) => {
  res.json(await deviceControlService.listDevices());
});

app.get("/api/device-commands", requireAdmin, async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json(await deviceControlService.listCommands(Number.isFinite(limit) ? limit : 50));
});

app.post("/api/devices/:id/commands", requireAdmin, async (req, res) => {
  const parsed = z.object({
    command: z.string().min(1),
    parameters: z.record(z.string(), z.unknown()).optional(),
    confirmExecution: z.literal(true)
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "设备命令无效或尚未明确确认。" });
    return;
  }
  try {
    const command = await deviceControlService.execute({
      deviceId: String(req.params.id),
      command: parsed.data.command,
      parameters: parsed.data.parameters as Prisma.InputJsonObject | undefined,
      confirmExecution: parsed.data.confirmExecution,
      operator: req.auth!
    });
    res.status(201).json(command);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "设备控制失败。" });
  }
});

app.post("/api/diagnosis", uploadImage.single("image"), async (req: express.Request, res: express.Response) => {
  const cropType = String(req.body.cropType ?? "未知作物");
  const symptomDescription = req.body.symptomDescription ? String(req.body.symptomDescription) : undefined;

  try {
    const record = await yoloDiagnosisService.diagnose({
      imageFile: req.file,
      cropType,
      symptomDescription
    });

    res.json(await persistenceService.saveDiagnosis(record, req.auth!.id));
  } catch (error) {
    console.error("[Diagnosis Error]", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "农业问诊诊断失败，请检查模型与服务状态。"
    });
  }
}, uploadErrorHandler);

app.get("/api/diagnosis", async (req, res) => {
  res.json(await persistenceService.listDiagnoses(req.auth!.id, req.auth!.role === "admin"));
});

app.post("/api/diagnosis/video", uploadVideo.single("video"), async (req: express.Request, res: express.Response) => {
  const cropType = String(req.body.cropType ?? "未知作物");
  const symptomDescription = req.body.symptomDescription ? String(req.body.symptomDescription) : undefined;

  try {
    // multer 默认存为无扩展名文件，补回原始扩展名，保证原始视频可在线播放
    if (req.file) {
      const originalExt = (req.file.originalname.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "").toLowerCase();
      if (originalExt) {
        const target = `${req.file.path}.${originalExt}`;
        fs.renameSync(req.file.path, target);
        req.file.path = target;
        req.file.filename = `${req.file.filename}.${originalExt}`;
      }
    }

    const record = await yoloDiagnosisService.diagnoseVideo({
      videoFile: req.file,
      cropType,
      symptomDescription
    });

    res.json(await persistenceService.saveDiagnosis(record, req.auth!.id));
  } catch (error) {
    console.error("[Video Diagnosis Error]", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "视频诊断失败，请检查模型与服务状态。"
    });
  }
}, uploadErrorHandler);

app.post("/api/patrols", uploadImage.single("image"), async (req: express.Request, res: express.Response) => {
  try {
    const report = await persistenceService.createPatrol({
      id: id("patrol"),
      plotName: String(req.body.plotName ?? "未命名地块"),
      cropName: String(req.body.cropName ?? "未知作物"),
      imageUrl: req.file ? `/uploads/${req.file.filename}` : undefined,
      growthStatus: "整体长势较稳定",
      anomalies: ["局部叶色偏浅", "需持续观察湿度变化"],
      environmentRisk: "湿度偏高时可能增加病害风险。",
      suggestion: "建议今日完成一次通风巡检，并记录异常区域位置。",
      conclusion: "MVP阶段已生成模拟巡田报告，后续可接入视觉模型进行真实识别。",
      createdAt: now()
    }, req.auth!.id);
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "巡田报告保存失败。" });
  }
}, uploadErrorHandler);

app.get("/api/patrols", async (req, res) => {
  try {
    const reports = await persistenceService.listPatrols(req.auth!.id, req.auth!.role === "admin");
    res.json(await patrolDemoService.enrichReports(reports));
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "巡田记录读取失败。" });
  }
});

app.get("/api/products", async (req, res) => {
  res.json(await persistenceService.listProducts(req.auth!.id, req.auth!.role === "admin"));
});

app.post("/api/products", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    category: z.string().min(1),
    origin: z.string().min(1),
    harvestTime: z.string().optional(),
    cultivationMethod: z.string().optional(),
    traceabilityInfo: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "农产品名称、品类和产地不能为空。" });
    return;
  }

  try {
    res.status(201).json(await persistenceService.createProduct(parsed.data, req.auth!.id));
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "农产品保存失败。" });
  }
});

app.delete("/api/products", async (req, res) => {
  const schema = z.object({ ids: z.array(z.string().min(1)).min(1) });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "请至少选择一个商品。" });
    return;
  }

  try {
    const deleted = await persistenceService.deleteProducts(
      parsed.data.ids,
      req.auth!.id,
      req.auth!.role === "admin"
    );
    res.json({ deleted });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "商品删除失败。" });
  }
});

app.post("/api/tts", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(400).json({ message: "请提供要合成的文本。" });
    return;
  }
  try {
    const wav = await ttsService.synthesize(text.slice(0, 500));
    res.setHeader("Content-Type", "audio/wav");
    res.send(wav);
  } catch (error) {
    console.error("[TTS Error]", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "离线语音合成失败。"
    });
  }
});

// 传输层：默认 HTTP（本地开发）；设置 HTTPS_ENABLED=true 并配置 TLS_CERT_PATH/TLS_KEY_PATH 启用 HTTPS
const httpsEnabled = process.env.HTTPS_ENABLED?.trim().toLowerCase() === "true";
if (httpsEnabled) {
  const certPath = process.env.TLS_CERT_PATH?.trim();
  const keyPath = process.env.TLS_KEY_PATH?.trim();
  if (!certPath || !keyPath || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error("[TLS] HTTPS_ENABLED=true 但 TLS_CERT_PATH/TLS_KEY_PATH 缺失或文件不存在。生产环境请配置真实证书（或用 Nginx/Caddy 反向代理终止 TLS）。");
    process.exit(1);
  }
  https
    .createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, app)
    .listen(port, () => {
      console.log(`AI数字农业管家 API running at https://localhost:${port}`);
    });
} else {
  app.listen(port, () => {
    console.log(`AI数字农业管家 API running at http://localhost:${port}`);
  });
}
