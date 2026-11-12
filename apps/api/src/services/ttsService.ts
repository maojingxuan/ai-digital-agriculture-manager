import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { projectRootDir } from "../config/paths.js";

interface PendingReq {
  resolve: (wav: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface QueueItem {
  text: string;
  resolve: (wav: Buffer) => void;
  reject: (err: Error) => void;
}

/**
 * sherpa-onnx 离线 TTS 常驻进程。
 * 请求串行排队，避免并发导致协议错乱。
 */
export class SherpaTtsService {
  private static readonly MAX_QUEUE_LENGTH = 20;
  private pythonExec: string;
  private scriptPath: string;
  private proc: ChildProcess | null = null;
  private starting: Promise<void> | null = null;
  private pending: PendingReq | null = null;
  private queue: QueueItem[] = [];
  private recvBuf: Buffer = Buffer.alloc(0);
  private warmingUp = false;

  constructor() {
    this.pythonExec =
      process.env.PYTHON_EXEC?.trim() ||
      "E:\\Conda\\miniconda3\\envs\\work\\python.exe";
    this.scriptPath = path.join(
      projectRootDir,
      "apps",
      "api",
      "scripts",
      "sherpa_tts_server.py",
    );
  }

  private spawnProcess(): Promise<void> {
    if (this.proc && !this.proc.killed) return Promise.resolve();
    if (this.starting) return this.starting;

    console.log("[TTS] starting Python process...");
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
        console.error("[TTS py]", s.trim());
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
            console.log("[TTS] model ready");
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
        reject(new Error(`TTS 模型加载超时: ${stderrBuf.slice(-500)}`));
      }, 30000);

      proc.on("error", (err) => {
        clearTimeout(timer);
        this.starting = null;
        console.error("[TTS] spawn error:", err.message);
        reject(new Error(`TTS 进程启动失败: ${err.message}`));
      });

      proc.on("exit", (code, signal) => {
        console.log(`[TTS] process exited code=${code} signal=${signal}`);
        this.starting = null;
        if (this.pending) {
          this.pending.reject(
            new Error(`TTS 进程退出 code=${code}: ${stderrBuf.slice(-300)}`),
          );
          this.pending = null;
        }
        // 队列里的请求全部失败
        for (const item of this.queue) {
          item.reject(new Error("TTS 进程退出"));
        }
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
      const wavLen = this.recvBuf.readUInt32LE(0);
      if (this.recvBuf.length < 4 + wavLen) break;
      const wav = this.recvBuf.slice(4, 4 + wavLen);
      this.recvBuf = this.recvBuf.slice(4 + wavLen);
      const req = this.pending;
      clearTimeout(req.timer);
      this.pending = null;
      if (wavLen === 0) {
        req.reject(new Error("TTS 合成失败"));
      } else {
        req.resolve(wav);
      }
    }
    // 处理下一个队列请求
    this.processQueue();
  }

  private processQueue() {
    if (this.pending || !this.proc || !this.proc.stdin) return;
    const item = this.queue.shift();
    if (!item) return;

    const textBuf = Buffer.from(item.text, "utf-8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(textBuf.length, 0);

    const timer = setTimeout(() => {
      if (this.pending) {
        this.pending = null;
        item.reject(new Error("TTS 合成超时"));
      }
    }, 60000);

    this.pending = { resolve: item.resolve, reject: item.reject, timer };
    this.proc.stdin.write(header);
    this.proc.stdin.write(textBuf);
  }

  async warmup() {
    if (this.warmingUp) return;
    this.warmingUp = true;
    try {
      await this.spawnProcess();
      // warmup 直接走队列，和用户请求串行
      await this.synthesize("你好").catch((e) =>
        console.error("[TTS] warmup failed:", e.message),
      );
    } catch (e: any) {
      console.error("[TTS] warmup error:", e.message);
    }
  }

  async synthesize(text: string): Promise<Buffer> {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) throw new Error("合成文本为空");

    await this.spawnProcess();

    return new Promise<Buffer>((resolve, reject) => {
      if (this.queue.length >= SherpaTtsService.MAX_QUEUE_LENGTH) {
        reject(new Error("TTS 请求队列已满，请稍后重试"));
        return;
      }
      this.queue.push({ text: trimmed, resolve, reject });
      this.processQueue();
    });
  }
}

export const ttsService = new SherpaTtsService();
