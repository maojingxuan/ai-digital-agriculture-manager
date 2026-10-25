import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readRootEnvValue(key) {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((item) => new RegExp(`^\\s*${key}=`).test(item));
  return line?.replace(new RegExp(`^\\s*${key}=`), "").trim().replace(/^['"]|['"]$/g, "") || "";
}

export function resolveEnvironmentPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(projectRoot, value);
}

export function pythonInEnvironment(environmentPath) {
  const root = resolveEnvironmentPath(environmentPath);
  return process.platform === "win32"
    ? path.join(root, "Scripts", "python.exe")
    : path.join(root, "bin", "python");
}

export function environmentPythonCandidates(environmentPath, source) {
  const root = resolveEnvironmentPath(environmentPath);
  return process.platform === "win32"
    ? [
        { executable: path.join(root, "Scripts", "python.exe"), prefixArgs: [], source },
        { executable: path.join(root, "python.exe"), prefixArgs: [], source },
      ]
    : [{ executable: path.join(root, "bin", "python"), prefixArgs: [], source }];
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.executable}\0${candidate.prefixArgs.join("\0")}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Python 环境只从 .env 显式指定，不再自动探测系统或虚拟环境。
// 支持三种指定方式，详见 README「YOLO 图片识别」一节：
//   1. .venv 虚拟环境：PYTHON_ENV_PATH=.venv
//   2. 全局 Python：   PYTHON_EXEC=python（或完整路径）
//   3. Conda 环境：    PYTHON_EXEC=C:\...\envs\<名称>\python.exe
export function configuredPythonCandidates() {
  const candidates = [];
  const executable = readRootEnvValue("PYTHON_EXEC");
  const environmentPath = readRootEnvValue("PYTHON_ENV_PATH");
  if (executable) candidates.push({ executable, prefixArgs: [], source: "PYTHON_EXEC" });
  if (environmentPath) {
    candidates.push(...environmentPythonCandidates(environmentPath, "PYTHON_ENV_PATH"));
  }
  return uniqueCandidates(candidates);
}

export function pythonCandidates() {
  return configuredPythonCandidates();
}

export function commandWorks(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    stdio: "ignore",
    windowsHide: true,
    ...options,
  });
  return !result.error && result.status === 0;
}

export function candidateWorks(candidate) {
  return commandWorks(candidate.executable, [...candidate.prefixArgs, "--version"]);
}

export function findWorkingPython() {
  return pythonCandidates().find(candidateWorks);
}

export function describePython(candidate) {
  return `${candidate.executable}${candidate.prefixArgs.length ? ` ${candidate.prefixArgs.join(" ")}` : ""}（${candidate.source}）`;
}
