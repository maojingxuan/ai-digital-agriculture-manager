import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { describePython, findWorkingPython } from "./python-env.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let failures = 0;

function report(level, name, detail) {
  const icon = level === "ok" ? "✓" : level === "warn" ? "!" : "✗";
  console.log(`${icon} ${name}${detail ? `：${detail}` : ""}`);
  if (level === "error") failures += 1;
}

function commandWorks(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
  return !result.error && result.status === 0;
}

function readEnvValue(key) {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((item) => new RegExp(`^\\s*${key}=`).test(item));
  return line?.replace(new RegExp(`^\\s*${key}=`), "").trim().replace(/^['"]|['"]$/g, "") || "";
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve(true)));
  });
}

const nodeVersion = process.versions.node;
const [major, minor] = nodeVersion.split(".").map(Number);
if (major > 20 && major < 25 || major === 20 && minor >= 19) {
  report("ok", "Node.js", `v${nodeVersion}`);
} else {
  report("error", "Node.js", `当前 v${nodeVersion}，需要 20.19—24.x，推荐 22 LTS`);
}

const npmInvocation = process.env.npm_execpath
  ? { executable: process.execPath, args: [process.env.npm_execpath, "--version"] }
  : { executable: process.platform === "win32" ? "npm.cmd" : "npm", args: ["--version"] };
const npmResult = spawnSync(npmInvocation.executable, npmInvocation.args, {
  cwd: projectRoot,
  encoding: "utf8",
  windowsHide: true,
  shell: !process.env.npm_execpath && process.platform === "win32"
});
const npmVersion = npmResult.status === 0 ? npmResult.stdout.trim() : "";
report(Number(npmVersion.split(".")[0]) >= 10 ? "ok" : "error", "npm", npmVersion ? `v${npmVersion}` : "未找到，需要 10 或更高版本");

try {
  const sharedPackage = require.resolve("@agri/shared/package.json", { paths: [projectRoot] });
  report("ok", "Workspace 链接", sharedPackage);
} catch {
  report("error", "Workspace 链接", "缺失或损坏，请运行 npm run setup");
}

const requiredFiles = [
  ["共享类型产物", "packages/shared/dist/index.js"],
  ["Prisma Schema", "apps/api/prisma/schema.prisma"],
  ["YOLO 推理脚本", "apps/api/scripts/yolo_inference.py"],
  ["YOLO 模型", "apps/api/models/crop_disease_yolo11.pt"]
];
for (const [name, relativePath] of requiredFiles) {
  report(fs.existsSync(path.join(projectRoot, relativePath)) ? "ok" : "error", name, relativePath);
}

report(fs.existsSync(path.join(projectRoot, ".env")) ? "ok" : "warn", ".env", fs.existsSync(path.join(projectRoot, ".env")) ? "已配置" : "缺失，运行 npm run setup 可自动创建");
const authSecret = readEnvValue("AUTH_SECRET");
report(authSecret.length >= 32 ? "ok" : "error", "登录签名密钥", authSecret.length >= 32 ? "已安全配置" : "缺失或过短，请运行 npm run auth:init");

const uploadDir = path.join(projectRoot, "apps", "api", "uploads");
try {
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.accessSync(uploadDir, fs.constants.W_OK);
  report("ok", "上传目录", uploadDir);
} catch (error) {
  report("error", "上传目录", error instanceof Error ? error.message : String(error));
}

const apiRoot = path.join(projectRoot, "apps", "api");
const configuredYoloConfigDir = readEnvValue("YOLO_CONFIG_DIR");
const yoloConfigDir = configuredYoloConfigDir
  ? path.isAbsolute(configuredYoloConfigDir)
    ? path.normalize(configuredYoloConfigDir)
    : path.resolve(apiRoot, configuredYoloConfigDir)
  : path.join(apiRoot, ".ultralytics");
try {
  fs.mkdirSync(yoloConfigDir, { recursive: true });
  fs.accessSync(yoloConfigDir, fs.constants.W_OK);
  report("ok", "Ultralytics 配置目录", yoloConfigDir);
} catch (error) {
  report("error", "Ultralytics 配置目录", error instanceof Error ? error.message : String(error));
}

for (const port of [3001, 5173]) {
  const available = await portIsAvailable(port);
  report(available ? "ok" : "warn", `端口 ${port}`, available ? "可用" : "已被其他程序占用，启动时可能需要更换端口");
}

const python = findWorkingPython();
if (!python) {
  const configured = readEnvValue("PYTHON_EXEC") || readEnvValue("PYTHON_ENV_PATH");
  report(
    "warn",
    "Python/YOLO",
    configured
      ? "指定的 PYTHON_EXEC/PYTHON_ENV_PATH 在当前电脑不可用；系统仍可启动，但图片识别会降级。请检查 .env 路径，详见 README「YOLO 图片识别」"
      : "未在 .env 中配置 Python 环境；系统仍可启动，但图片识别会降级。请在 .env 配置 PYTHON_EXEC/PYTHON_ENV_PATH，详见 README「YOLO 图片识别」",
  );
} else {
  const depsReady = commandWorks(
    python.executable,
    [...python.prefixArgs, "-c", "import ultralytics, cv2, PIL"],
    { env: { ...process.env, YOLO_CONFIG_DIR: yoloConfigDir } }
  );
  const description = describePython(python);
  report(depsReady ? "ok" : "warn", "Python/YOLO", depsReady ? `${description}，依赖完整` : `${description} 可用，但缺少依赖；运行 npm run setup:yolo`);
}

console.log(failures ? `\n环境检查发现 ${failures} 个必须修复的问题。` : "\n基础运行环境检查通过。");
process.exitCode = failures ? 1 : 0;
