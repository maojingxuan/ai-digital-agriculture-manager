"""sherpa-onnx 离线 TTS 常驻服务。
协议：从 stdin 逐行读 UTF-8 文本（按换行分隔），每行合成后向 stdout 写：
  [4字节小端 uint32 长度][wav 二进制]
启动时加载模型，加载完成后向 stdout.buffer 写 "READY"。
"""
import sys
import wave
import struct
import io
import sherpa_onnx

MODEL_DIR = r"D:\新数字人系统\apps\api\models\tts-zh-ll\sherpa-onnx-vits-zh-ll"


def main():
    tts_config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=f"{MODEL_DIR}\\model.onnx",
                tokens=f"{MODEL_DIR}\\tokens.txt",
                lexicon=f"{MODEL_DIR}\\lexicon.txt",
                dict_dir=MODEL_DIR,
            )
        ),
        max_num_sentences=1,
    )
    tts = sherpa_onnx.OfflineTts(tts_config)

    out = sys.stdout.buffer
    stdin_buffer = sys.stdin.buffer

    # 通知 Node 端模型已就绪
    out.write(b"READY")
    out.flush()

    # 手动按行读原始 bytes，UTF-8 解码
    buf = b""
    while True:
        chunk = stdin_buffer.read(4096)
        if not chunk:
            break
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            try:
                audio = tts.generate(text, sid=0, speed=1.0)
                int_samples = [
                    max(-32768, min(32767, int(s * 32767))) for s in audio.samples
                ]
                pcm = struct.pack(f"<{len(int_samples)}h", *int_samples)

                wav_buf = io.BytesIO()
                with wave.open(wav_buf, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(audio.sample_rate)
                    wf.writeframes(pcm)
                wav_bytes = wav_buf.getvalue()

                out.write(struct.pack("<I", len(wav_bytes)))
                out.write(wav_bytes)
                out.flush()
            except Exception as e:
                sys.stderr.write(f"TTS error: {e}\n")
                sys.stderr.flush()
                out.write(struct.pack("<I", 0))
                out.flush()


if __name__ == "__main__":
    main()
