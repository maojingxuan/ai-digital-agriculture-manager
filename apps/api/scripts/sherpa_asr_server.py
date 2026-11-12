"""sherpa-onnx 离线语音识别（ASR）常驻服务。

协议（原始 buffer，避免 Windows 编码问题）：
  - 启动加载完模型后向 stdout.buffer 写 b"READY"
  - 请求：stdin 上 4 字节小端 uint32 = WAV 字节长度，随后是 WAV 二进制
  - 响应：stdout 上 4 字节小端 uint32 = UTF-8 文本字节长度，随后是文本
          长度 0 表示识别失败或空结果

前端传上来的是 16kHz / 单声道 / 16bit 的 WAV（浏览器端直接拼好的）。
这里再做一次重采样兜底，保证任何采样率都能吃进去。
"""
import sys
import os
import io
import wave
import struct
import array
import sherpa_onnx

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "asr-sense-voice")

# sense-voice 要求的输入采样率
TARGET_SAMPLE_RATE = 16000


def resample(samples, src_rate, dst_rate):
    """线性插值重采样，够用且无第三方依赖。"""
    if src_rate == dst_rate or not samples:
        return samples
    ratio = dst_rate / src_rate
    out_len = int(len(samples) * ratio)
    out = array.array("f", [0.0]) * out_len
    for i in range(out_len):
        pos = i / ratio
        left = int(pos)
        right = min(left + 1, len(samples) - 1)
        frac = pos - left
        out[i] = samples[left] * (1 - frac) + samples[right] * frac
    return out


def wav_bytes_to_samples(wav_bytes: bytes):
    """把 WAV 解析成 float32 单声道采样，统一到 16kHz。"""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())

    if sampwidth == 2:
        raw = array.array("h", frames)
        if sys.byteorder == "big":
            raw.byteswap()
        scale = 32768.0
    elif sampwidth == 4:
        raw = array.array("i", frames)
        if sys.byteorder == "big":
            raw.byteswap()
        scale = 2147483648.0
    elif sampwidth == 1:
        raw = array.array("B", frames)
        scale = 128.0
        # 8bit WAV 是无符号的，中心在 128
        samples = array.array("f", [(v - 128) / scale for v in raw])
        return samples if rate == TARGET_SAMPLE_RATE else resample(samples, rate, TARGET_SAMPLE_RATE)
    else:
        raise ValueError(f"不支持的采样位宽: {sampwidth}")

    samples = array.array("f", [v / scale for v in raw])

    # 多声道混成单声道
    if channels > 1:
        mono = array.array("f", [0.0]) * (len(samples) // channels)
        for i in range(len(mono)):
            total = 0.0
            for c in range(channels):
                total += samples[i * channels + c]
            mono[i] = total / channels
        samples = mono

    if rate != TARGET_SAMPLE_RATE:
        samples = resample(samples, rate, TARGET_SAMPLE_RATE)
    return samples


def main():
    model = os.path.join(MODEL_DIR, "model.int8.onnx")
    if not os.path.exists(model):
        model = os.path.join(MODEL_DIR, "model.onnx")
    tokens = os.path.join(MODEL_DIR, "tokens.txt")

    recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=model,
        tokens=tokens,
        num_threads=4,
        use_itn=True,
        language="zh",
        debug=False,
    )

    out = sys.stdout.buffer
    inp = sys.stdin.buffer
    out.write(b"READY")
    out.flush()

    def read_exact(n: int) -> bytes:
        buf = b""
        while len(buf) < n:
            chunk = inp.read(n - len(buf))
            if not chunk:
                raise EOFError("stdin closed")
            buf += chunk
        return buf

    def write_text(text: str):
        data = text.encode("utf-8")
        out.write(struct.pack("<I", len(data)))
        out.write(data)
        out.flush()

    while True:
        len_bytes = read_exact(4)
        wav_len = struct.unpack("<I", len_bytes)[0]
        if wav_len == 0:
            write_text("")
            continue
        wav_bytes = read_exact(wav_len)

        try:
            samples = wav_bytes_to_samples(wav_bytes)
            if len(samples) < TARGET_SAMPLE_RATE * 0.2:
                write_text("")
                continue
            stream = recognizer.create_stream()
            stream.accept_waveform(TARGET_SAMPLE_RATE, samples)
            recognizer.decode_stream(stream)
            text = (stream.result.text or "").strip()
            write_text(text)
        except Exception as e:
            sys.stderr.write(f"ASR error: {e}\n")
            sys.stderr.flush()
            write_text("")


if __name__ == "__main__":
    main()
