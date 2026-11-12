import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export const apiRootDir = path.resolve(configDir, "../..");
export const projectRootDir = path.resolve(apiRootDir, "../..");
export const rootEnvPath = path.join(projectRootDir, ".env");
export const apiEnvPath = path.join(apiRootDir, ".env");
export const yoloModelPath = path.join(apiRootDir, "models", "corn_disease_best.pt");
export const yoloScriptPath = path.join(apiRootDir, "scripts", "yolo_inference.py");
export const yoloVideoScriptPath = path.join(apiRootDir, "scripts", "yolo_video_diagnosis.py");

export function voicePythonExecutable(): string {
  const configured = process.env.PYTHON_EXEC?.trim();
  if (configured) return configured;
  const environment = process.env.PYTHON_ENV_PATH?.trim();
  if (environment) {
    const root = path.isAbsolute(environment)
      ? environment
      : path.resolve(projectRootDir, environment);
    return path.join(root, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  }
  return "python";
}

export function resolveApiPath(configuredPath: string | undefined, fallbackRelativePath: string): string {
  const value = configuredPath?.trim();
  if (!value) {
    return path.join(apiRootDir, fallbackRelativePath);
  }

  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(apiRootDir, value);
}
