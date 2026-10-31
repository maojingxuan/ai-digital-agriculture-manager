"""sherpa-onnx 离线 TTS 服务脚本。
用法: echo "文本" | python sherpa_tts.py > out.wav
模型在启动时加载一次，从 stdin 读一行文本，合成后输出 wav 到 stdout。
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

    text = sys.stdin.read().strip()
    if not text:
        sys.exit(1)

    audio = tts.generate(text, sid=0, speed=1.0)
    int_samples = [max(-32768, min(32767, int(s * 32767))) for s in audio.samples]
    pcm = struct.pack(f"<{len(int_samples)}h", *int_samples)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(audio.sample_rate)
        wf.writeframes(pcm)
    sys.stdout.buffer.write(buf.getvalue())

if __name__ == "__main__":
    main()
