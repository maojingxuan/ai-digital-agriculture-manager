// Local UI-only fixture. It never loads .env, opens a database or calls an AI API.
// Run with: node scripts/stage1-ui-fixture.mjs
// Preview the built frontend at http://localhost:4173. All data is test data.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../apps/web/dist",
);
let user = {
  id: "stage1-admin",
  name: "界面测试管理员",
  role: "admin",
  email: "farmer@example.com",
};
let failures = 0;
let modelFailures = process.argv.includes("--model-failure-once") ? 1 : 0;
const port = Number(process.env.STAGE1_UI_PORT ?? 4173);
const snapshot = {
  greenhouseId: "demo-gh-1",
  farmName: "界面验证番茄棚",
  updatedAt: new Date().toISOString(),
  metrics: [],
  summary: "仅用于第一阶段界面测试的仿真数据",
  status: "optimal",
};
const greenhouse = {
  id: "demo-gh-1",
  name: "界面验证番茄棚",
  location: "本地测试",
  area: 100,
  status: "optimal",
};
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".glb": "model/gltf-binary",
  ".svg": "image/svg+xml",
};
const json = (res, data, code = 200) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.endsWith("nongxiaobei-v2.glb") && modelFailures > 0) {
      modelFailures--;
      res.writeHead(503);
      return res.end("UI test: model unavailable");
    }
    if (url.pathname.startsWith("/api/")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = body ? JSON.parse(body) : {};
      if (url.pathname === "/api/auth/login") {
        user =
          input.identifier === "user@example.com"
            ? {
                id: "stage1-user",
                name: "界面测试普通用户",
                role: "user",
                email: input.identifier,
              }
            : {
                id: "stage1-admin",
                name: "界面测试管理员",
                role: "admin",
                email: input.identifier,
              };
        return json(res, { token: "stage1-ui-only", user });
      }
      if (url.pathname === "/api/auth/me") return json(res, user);
      if (url.pathname === "/api/llm/status")
        return json(res, { configured: false, provider: "本地界面测试" });
      if (url.pathname === "/api/agriculture-data/current")
        return json(res, snapshot);
      if (url.pathname === "/api/greenhouses") return json(res, [greenhouse]);
      if (url.pathname === "/api/dashboard/environment")
        return json(res, {
          greenhouse,
          realtime: snapshot,
          history: [],
          anomalies: [],
          recommendations: ["界面测试数据"],
        });
      if (url.pathname === "/api/agent/chat") {
        if (input.message === "测试失败" && failures++ === 0)
          return json(res, { message: "测试服务暂时不可用" }, 503);
        const delay = input.message.includes("超时")
          ? 65000
          : input.message.includes("慢速")
            ? 8000
            : 300;
        return setTimeout(
          () =>
            json(res, {
              id: `test-${Date.now()}`,
              role: "assistant",
              content: `已完成界面验证：${input.message}。这是测试回复。`,
              createdAt: new Date().toISOString(),
            }),
          delay,
        );
      }
      return json(res, []);
    }
    const relative = decodeURIComponent(url.pathname);
    let file = path.resolve(root, `.${relative}`);
    if (!file.startsWith(`${root}${path.sep}`) && file !== root) {
      res.writeHead(403);
      return res.end();
    }
    if (!path.extname(file)) file = path.join(root, "index.html");
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Stage 1 UI fixture: http://localhost:${port} (test data only, no database/API calls)`,
  ),
);
