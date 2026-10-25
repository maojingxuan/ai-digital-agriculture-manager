import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;

function run(args, label) {
  console.log(`\n[setup] ${label}`);
  const executable = npmExecPath ? process.execPath : npmCommand;
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
    shell: !npmExecPath && process.platform === "win32"
  });
  if (result.error || result.status !== 0) {
    console.error(`[setup] 失败：${label}`);
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}

const envPath = path.join(projectRoot, ".env");
const envExamplePath = path.join(projectRoot, ".env.example");
if (!existsSync(envPath)) {
  copyFileSync(envExamplePath, envPath);
  console.log("[setup] 已从 .env.example 创建 .env，请按需填写 LLM_API_KEY。");
} else {
  console.log("[setup] 保留现有 .env，不覆盖本机配置。");
}

run(["ci"], "安装可复现的 Node.js 依赖并重建 Workspace 链接");
run(["run", "auth:init"], "初始化本机登录签名密钥");
run(["run", "db:generate"], "生成当前电脑适用的 Prisma Client");
run(["run", "db:migrate"], "创建或升级本地 SQLite 数据库");
run(["run", "db:seed"], "为空数据库写入基础演示数据");

console.log("\n[setup] 基础环境初始化完成。");
console.log("[setup] 如需图片识别，请再运行：npm run setup:yolo");
console.log("[setup] 检查环境：npm run doctor");
console.log("[setup] 启动项目：npm run dev");
