import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  candidateWorks,
  configuredPythonCandidates,
  describePython,
  projectRoot,
} from "./python-env.mjs";

const requirementsPath = path.join(projectRoot, "requirements-yolo.txt");

function run(executable, args, label) {
  console.log(`\n[setup:yolo] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}

// 不再自动探测或创建环境：Python 环境必须由用户在 .env 中显式指定。
const configuredCandidates = configuredPythonCandidates();
const python = configuredCandidates.find(candidateWorks);

if (!configuredCandidates.length) {
  console.error(
    "\n[setup:yolo] .env 中未配置 Python 环境。\n" +
      "请在 .env 中用 PYTHON_EXEC 或 PYTHON_ENV_PATH 指定（支持 .venv、全局 Python、Conda 环境），" +
      "详见 README「YOLO 图片识别」一节。\n",
  );
  process.exit(1);
}

if (!python) {
  console.error("\n[setup:yolo] .env 中指定的 Python 环境在当前电脑不可用：");
  for (const candidate of configuredCandidates) {
    console.error(`  - ${describePython(candidate)}`);
  }
  console.error(
    "请检查路径是否正确。Windows 下虚拟环境解释器位于 <环境目录>\\Scripts\\python.exe，Conda 环境解释器位于 <envs目录>\\<环境名>\\python.exe。\n",
  );
  process.exit(1);
}

console.log(`[setup:yolo] 使用 Python：${describePython(python)}`);
run(
  python.executable,
  [...python.prefixArgs, "-m", "pip", "install", "-r", requirementsPath],
  "使用 pip 安装 YOLO 依赖",
);

console.log("\nYOLO Python 依赖安装完成。");
console.log("运行 npm run doctor 可确认网站将使用同一个 Python 环境。");
