import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { projectRootDir } from "../config/paths.js";

const execFileAsync = promisify(execFile);

/**
 * sherpa-onnx 离线 TTS。
 * 每次请求写一个临时 UTF-8 文本文件，spawn Python 合成 wav，读完即删。
 * 模型每次加载约 2-3 秒，完全离线、无外部依赖。
 */
export class SherpaTtsService {
  private pythonExec: string;
  private scriptPath: string;
  private tmpDir: string;

  constructor() {
    this.pythonExec =
      process.env.PYTHON_EXEC?.trim() ||
      "E:\\Conda\\miniconda3\\envs\\work\\python.exe";
    this.scriptPath = path.join(
      projectRootDir,
      "apps",
      "api",
      "scripts",
      "sherpa_tts_once.py",
    );
    this.tmpDir = path.join(projectRootDir, "apps", "api", "tmp");
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  async synthesize(text: string): Promise<Buffer> {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) throw new Error("合成文本为空");

    const id = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const txtFile = path.join(this.tmpDir, `tts_${id}.txt`);
    const wavFile = path.join(this.tmpDir, `tts_${id}.wav`);
    fs.writeFileSync(txtFile, trimmed, "utf-8");

    try {
      const { stdout, stderr } = await execFileAsync(
        this.pythonExec,
        [this.scriptPath, txtFile, wavFile],
        {
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
          timeout: 30000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );
      if (stderr) console.error("[TTS py stderr]", stderr);
      return fs.readFileSync(wavFile);
    } finally {
      fs.promises.unlink(txtFile).catch(() => undefined);
      fs.promises.unlink(wavFile).catch(() => undefined);
    }
  }
}

export const ttsService = new SherpaTtsService();
