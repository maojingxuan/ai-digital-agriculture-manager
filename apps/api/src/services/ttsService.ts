/**
 * 豆包语音合成（火山引擎 TTS v3 unidirectional，新版控制台）
 * 接收文本，返回 mp3 Buffer。
 */
const TTS_ENDPOINT =
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class TtsService {
  private readonly apiKey = process.env.TTS_ACCESS_TOKEN ?? "";
  private readonly speaker =
    process.env.TTS_SPEAKER ?? "zh_female_vv_uranus_bigtts";
  private readonly resourceId = process.env.TTS_RESOURCE_ID ?? "seed-tts-2.0";

  get configured() {
    return Boolean(this.apiKey);
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.configured) {
      throw new Error("TTS 未配置：缺少 TTS_ACCESS_TOKEN");
    }
    const trimmed = text.trim();
    if (!trimmed) return Buffer.alloc(0);

    const body = {
      req_params: {
        text: trimmed,
        speaker: this.speaker,
        audio_params: {
          format: "mp3",
          sample_rate: 24000,
        },
      },
    };

    const res = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
        "X-Api-Resource-Id": this.resourceId,
        "X-Api-Request-Id": uuid(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "");
      throw new Error(`TTS 服务返回 ${res.status}: ${errText.slice(0, 300)}`);
    }

    // v3 unidirectional 返回 NDJSON，每行一个 JSON 片段，data 字段是 base64 mp3
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const chunks: Buffer[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const json = JSON.parse(line);
          // code=0 是音频包；code=20000000 是流式结束的成功信号；
          // 其他非 0 code 才是真错误
          if (json.code && json.code !== 0 && json.code !== 20000000) {
            throw new Error(
              `TTS 错误 code=${json.code}: ${json.message ?? ""}`,
            );
          }
          if (json.data) {
            chunks.push(Buffer.from(json.data, "base64"));
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("TTS 错误")) throw e;
        }
      }
    }
    if (chunks.length === 0) {
      throw new Error("TTS 未返回音频数据");
    }
    return Buffer.concat(chunks);
  }
}

export const ttsService = new TtsService();
