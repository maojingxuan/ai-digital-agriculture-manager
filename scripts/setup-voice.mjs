import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { candidateWorks, configuredPythonCandidates, describePython } from "./python-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = configuredPythonCandidates();
const python = candidates.find(candidateWorks);
if (!python) {
  console.error("[setup:voice] 请先在根目录 .env 配置可用的 PYTHON_EXEC 或 PYTHON_ENV_PATH。");
  process.exit(1);
}
console.log(`[setup:voice] 使用 Python：${describePython(python)}`);
const pip = spawnSync(python.executable, [...python.prefixArgs, "-m", "pip", "install", "sherpa-onnx"], {
  cwd: root, stdio: "inherit", windowsHide: true,
});
if (pip.error || pip.status !== 0) {
  console.error(`[setup:voice] sherpa-onnx 安装失败：${pip.error?.message ?? pip.status}`);
  process.exit(pip.status || 1);
}
const models = spawnSync(process.execPath, [path.join(root, "scripts", "setup-models.mjs")], {
  cwd: root, stdio: "inherit", windowsHide: true,
});
if (models.error || models.status !== 0) process.exit(models.status || 1);
console.log("[setup:voice] 语音识别与合成依赖已就绪。");
