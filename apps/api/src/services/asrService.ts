import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { projectRootDir, voicePythonExecutable } from "../config/paths.js";

interface QueueItem {
  wav: Buffer;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
}

interface PendingReq {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/** 模型文件是否已就位（用于给出「模型未下载」的明确提示，而不是笼统 500） */
export function asrModelReady(): boolean {
  const dir = path.join(projectRootDir, "apps", "api", "models", "asr-sense-voice");
  return (
    fs.existsSync(path.join(dir, "model.int8.onnx")) ||
    fs.existsSync(path.join(dir, "model.onnx"))
  ) && fs.existsSync(path.join(dir, "tokens.txt"));
}

/**
 * sherpa-onnx 离线语音识别常驻进程。
 * 与 TTS 同样的设计：模型只加载一次，请求串行排队，避免并发把二进制流搅乱。
 */
export class SherpaAsrService {
  private pythonExec: string;
  private scriptPath: string;
  private proc: ChildProcess | null = null;
  private starting: Promise<void> | null = null;
  private pending: PendingReq | null = null;
  private queue: QueueItem[] = [];
  private recvBuf: Buffer = Buffer.alloc(0);
  private warmingUp = false;
  private lastError = "";

  constructor() {
    this.pythonExec = voicePythonExecutable();
    this.scriptPath = path.join(
      projectRootDir,
      "apps",
      "api",
      "scripts",
      "sherpa_asr_server.py",
    );
  }

  private spawnProcess(): Promise<void> {
    if (this.proc && !this.proc.killed) return Promise.resolve();
    if (this.starting) return this.starting;

    console.log("[ASR] starting Python process...");
    this.starting = new Promise<void>((resolve, reject) => {
      const proc = spawn(this.pythonExec, [this.scriptPath], {
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
        windowsHide: true,
      });
      this.proc = proc;
      this.recvBuf = Buffer.alloc(0);

      let stderrBuf = "";
      proc.stderr.on("data", (d: Buffer) => {
        const s = d.toString("utf-8");
        stderrBuf += s;
        this.lastError = s.trim();
        // 模型推理时会刷一些无关 warning，这里只保留错误级别
        if (s.includes("error") || s.includes("Error")) {
          console.error("[ASR py]", s.trim());
        }
      });

      let readySeen = false;
      const onStdout = (chunk: Buffer) => {
        this.recvBuf = Buffer.concat([this.recvBuf, chunk]);
        if (!readySeen) {
          const idx = this.recvBuf.indexOf("READY");
          if (idx >= 0) {
            readySeen = true;
            this.recvBuf = this.recvBuf.slice(idx + 5);
            proc.stdout.off("data", onStdout);
            proc.stdout.on("data", (c: Buffer) => this.onData(c));
            clearTimeout(timer);
            console.log("[ASR] model ready");
            this.starting = null;
            resolve();
          }
        } else {
          this.tryParseResponse();
        }
      };
      proc.stdout.on("data", onStdout);

      const timer = setTimeout(() => {
        proc.kill();
        this.starting = null;
        reject(new Error(`ASR 模型加载超时: ${stderrBuf.slice(-500)}`));
      }, 30000);

      proc.on("error", (err) => {
        clearTimeout(timer);
        this.starting = null;
        console.error("[ASR] spawn error:", err.message);
        reject(new Error(`ASR 进程启动失败: ${err.message}`));
      });

      proc.on("exit", (code, signal) => {
        console.log(`[ASR] process exited code=${code} signal=${signal}`);
        this.starting = null;
        if (this.pending) {
          this.pending.reject(new Error(`ASR 进程退出 code=${code}`));
          this.pending = null;
        }
        for (const item of this.queue) item.reject(new Error("ASR 进程退出"));
        this.queue = [];
        this.proc = null;
      });
    });

    return this.starting;
  }

  private onData(chunk: Buffer) {
    this.recvBuf = Buffer.concat([this.recvBuf, chunk]);
    this.tryParseResponse();
  }

  private tryParseResponse() {
    while (this.pending && this.recvBuf.length >= 4) {
      const textLen = this.recvBuf.readUInt32LE(0);
      if (this.recvBuf.length < 4 + textLen) break;
      const text = textLen > 0
        ? this.recvBuf.slice(4, 4 + textLen).toString("utf-8")
        : "";
      this.recvBuf = this.recvBuf.slice(4 + textLen);
      const req = this.pending;
      clearTimeout(req.timer);
      this.pending = null;
      req.resolve(text);
    }
    this.processQueue();
  }

  private processQueue() {
    if (this.pending || !this.proc || !this.proc.stdin) return;
    const item = this.queue.shift();
    if (!item) return;

    const header = Buffer.alloc(4);
    header.writeUInt32LE(item.wav.length, 0);

    const timer = setTimeout(() => {
      if (this.pending) {
        this.pending = null;
        item.reject(new Error("ASR 识别超时"));
      }
    }, 60000);

    this.pending = { resolve: item.resolve, reject: item.reject, timer };
    this.proc.stdin.write(header);
    this.proc.stdin.write(item.wav);
  }

  async warmup() {
    if (this.warmingUp || !asrModelReady()) return;
    this.warmingUp = true;
    try {
      await this.spawnProcess();
      console.log("[ASR] warmup done");
    } catch (e) {
      console.error("[ASR] warmup error:", e instanceof Error ? e.message : e);
    }
  }

  getLastError() {
    return this.lastError;
  }

  async recognize(wav: Buffer): Promise<string> {
    if (!asrModelReady()) {
      throw new Error("ASR_MODEL_MISSING");
    }
    await this.spawnProcess();
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ wav, resolve, reject });
      this.processQueue();
    });
  }
}

export const asrService = new SherpaAsrService();
