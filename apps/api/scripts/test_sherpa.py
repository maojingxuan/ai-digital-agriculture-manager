import sherpa_onnx
import wave
import struct

MODEL_DIR = r"D:\新数字人系统\apps\api\models\tts-zh-ll\sherpa-onnx-vits-zh-ll"

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
print("Loading model...")
tts = sherpa_onnx.OfflineTts(tts_config)
print("Generating...")
audio = tts.generate("你好，我是小墨，你的农业数字助手。", sid=0, speed=1.0)
print(f"Sample rate: {audio.sample_rate}, samples: {len(audio.samples)}, type: {type(audio.samples[0])}")

# float -> int16
int_samples = [max(-32768, min(32767, int(s * 32767))) for s in audio.samples]
samples = struct.pack(f"<{len(int_samples)}h", *int_samples)
with wave.open(r"D:\新数字人系统\apps\api\test_tts.wav", "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(audio.sample_rate)
    wf.writeframes(samples)
print("Done!")
