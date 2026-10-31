"""sherpa-onnx 离线 TTS（一次性）。
用法: python sherpa_tts_once.py <文本文件路径> <输出wav路径>
文本从 UTF-8 文件读取，避开 Windows 命令行中文编码问题。
"""
import sys
import wave
import struct
import sherpa_onnx

MODEL_DIR = r"D:\新数字人系统\apps\api\models\tts-zh-ll\sherpa-onnx-vits-zh-ll"

def main():
    if len(sys.argv) < 3:
        sys.stderr.write("usage: sherpa_tts_once.py <text_file> <out.wav>\n")
        sys.exit(1)
    text_file = sys.argv[1]
    out_path = sys.argv[2]

    with open(text_file, "r", encoding="utf-8") as f:
        text = f.read().strip()
    sys.stderr.write(f"[TTS] text={text!r} len={len(text)}\n")
    sys.stderr.flush()

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
    audio = tts.generate(text, sid=0, speed=1.0)
    int_samples = [
        max(-32768, min(32767, int(s * 32767))) for s in audio.samples
    ]
    pcm = struct.pack(f"<{len(int_samples)}h", *int_samples)
    with wave.open(out_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(audio.sample_rate)
        wf.writeframes(pcm)

if __name__ == "__main__":
    main()
