/**
 * 本地麦克风录音 → 16kHz 单声道 WAV。
 *
 * 为什么不用 Web Speech API：
 *   浏览器的 SpeechRecognition 走云端识别（Chrome 依赖 Google 服务），
 *   国内网络经常连不上，表现就是"点了麦克风却识别不到任何语音"。
 *   这里改成纯本地采集：getUserMedia 拿原始音频 → 拼 WAV → 交给后端的
 *   sherpa-onnx 离线模型识别，完全不依赖外网。
 */

export interface MicRecorderOptions {
  /** 检测到说话后又静止多久自动结束（毫秒） */
  silenceToStopMs?: number;
  /** 最长录制时长（毫秒） */
  maxDurationMs?: number;
  /** 一直没检测到说话时多久放弃（毫秒） */
  noSpeechTimeoutMs?: number;
  /** 每帧音量回调，用于 UI 显示 */
  onLevel?: (level: number) => void;
  /** 触发自动结束（说完/超时） */
  onAutoStop?: (reason: "silence" | "max-duration" | "no-speech") => void;
}

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SIZE = 4096; // ScriptProcessor 缓冲区
const SPEECH_RMS = 0.02; // 判定为"有人在说话"的阈值
const SILENCE_RMS = 0.012; // 判定为"静音"的阈值

/** 线性插值重采样到 16kHz */
export function resampleTo16k(input: Float32Array, srcRate: number): Float32Array {
  if (srcRate === TARGET_SAMPLE_RATE || input.length === 0) return input;
  const ratio = TARGET_SAMPLE_RATE / srcRate;
  const outLength = Math.floor(input.length * ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const pos = i / ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = pos - left;
    out[i] = input[left] * (1 - frac) + input[right] * frac;
  }
  return out;
}

/** Float32 采样 → 16bit PCM WAV 的 Blob */
export function encodeWav(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): Blob {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM 块大小
  view.setUint16(20, 1, true); // 格式：PCM
  view.setUint16(22, 1, true); // 声道数
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // 每秒字节
  view.setUint16(32, bytesPerSample, true); // 块对齐
  view.setUint16(34, 16, true); // 位深
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export class LocalMicRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 48000;
  private startedAt = 0;
  private lastTick = 0;
  private speechStarted = false;
  private silenceMs = 0;
  private options: MicRecorderOptions = {};
  private active = false;

  isActive() {
    return this.active;
  }

  async start(options: MicRecorderOptions = {}): Promise<void> {
    if (this.active) return;
    this.options = options;
    this.chunks = [];
    this.speechStarted = false;
    this.silenceMs = 0;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.stream = stream;

    const AudioCtx: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    this.ctx = ctx;
    this.sampleRate = ctx.sampleRate;

    const source = ctx.createMediaStreamSource(stream);
    this.source = source;
    const processor = ctx.createScriptProcessor(FRAME_SIZE, 1, 1);
    this.processor = processor;

    processor.onaudioprocess = (event) => {
      if (!this.active) return;
      const data = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
      this.inspect(data, event.timeStamp || performance.now());
    };

    source.connect(processor);
    // 需要接到 destination 才会持续触发，但音量置 0，避免把麦克风声音放出来
    const mute = ctx.createGain();
    mute.gain.value = 0;
    processor.connect(mute);
    mute.connect(ctx.destination);

    this.active = true;
    this.startedAt = performance.now();
    this.lastTick = this.startedAt;
  }

  private inspect(frame: Float32Array, now: number) {
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) {
      sum += frame[i] * frame[i];
    }
    const rms = Math.sqrt(sum / frame.length);
    this.options.onLevel?.(rms);

    const deltaMs = Math.max(0, now - this.lastTick);
    this.lastTick = now;

    if (rms >= SPEECH_RMS) {
      this.speechStarted = true;
      this.silenceMs = 0;
    } else if (rms < SILENCE_RMS) {
      if (this.speechStarted) this.silenceMs += deltaMs || 80;
    }

    const elapsed = now - this.startedAt;
    if (this.speechStarted && this.silenceMs >= (this.options.silenceToStopMs ?? 1500)) {
      this.options.onAutoStop?.("silence");
      return;
    }
    if (elapsed >= (this.options.maxDurationMs ?? 60000)) {
      this.options.onAutoStop?.("max-duration");
      return;
    }
    if (!this.speechStarted && elapsed >= (this.options.noSpeechTimeoutMs ?? 8000)) {
      this.options.onAutoStop?.("no-speech");
    }
  }

  /** 停止并返回 WAV；没检测到任何语音时返回 null */
  async stop(): Promise<{ blob: Blob | null; hadSpeech: boolean }> {
    if (!this.active) return { blob: null, hadSpeech: false };
    this.active = false;

    if (this.processor) {
      this.processor.onaudioprocess = null;
      try {
        this.processor.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.ctx && this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* ignore */
      }
    }

    const hadSpeech = this.speechStarted;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;

    if (!hadSpeech || merged.length < this.sampleRate * 0.2) {
      return { blob: null, hadSpeech };
    }
    const resampled = resampleTo16k(merged, this.sampleRate);
    return { blob: encodeWav(resampled, TARGET_SAMPLE_RATE), hadSpeech };
  }

  /** 主动释放（组件卸载时调用） */
  abort() {
    this.active = false;
    this.chunks = [];
    try {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.processor?.disconnect();
      this.source?.disconnect();
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;
  }
}
