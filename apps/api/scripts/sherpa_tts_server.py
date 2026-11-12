"""sherpa-onnx 离线 TTS 常驻服务。
协议（全部走原始 buffer，避免 Windows 编码问题）：
  - 启动加载完模型后，向 stdout.buffer 写 b"READY"
  - 循环从 stdin.buffer 读：4 字节小端 uint32 = UTF-8 文本字节长度，然后是文本内容
  - 合成后向 stdout.buffer 写：4 字节小端 uint32 = wav 字节长度，然后是 wav 二进制

文本预处理说明：
  这个模型是注音（ㄅㄆㄇ）模型，tokens.txt 只有几十个符号，汉字靠 lexicon.txt 映射。
  两类字符会触发 sherpa-onnx 的 "Ignore OOV" 警告：
    1) 数字和英文字母（不在词表里）→ 先转成中文读法
    2) 各种标点（中文弯引号 “ ”、斜杠、破折号等）→ 按模型词表白名单过滤
  早期用"手工列举标点"的做法漏掉了中文弯引号（U+201C/U+201D），
  这里改成从 tokens.txt + lexicon.txt 反推合法字符集，词表外的字符统一替换成逗号。
"""
import sys
import os
import re
import wave
import struct
import io
import sherpa_onnx

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "tts-zh-ll", "sherpa-onnx-vits-zh-ll")

# 常见英文缩写/单词转中文（长的写在前面，避免被短词截断替换）
EN_MAP = {
    "mS/cm": "毫西门子每厘米",
    "dS/m": "毫西门子每厘米",
    "CO₂": "二氧化碳",
    "CO2": "二氧化碳",
    "co2": "二氧化碳",
    "NORMAL": "正常",
    "Normal": "正常",
    "normal": "正常",
    "HIGH": "偏高",
    "High": "偏高",
    "high": "偏高",
    "LOW": "偏低",
    "Low": "偏低",
    "low": "偏低",
    "ppm": "百万分之一",
    "PPM": "百万分之一",
    "lux": "勒克斯",
    "LUX": "勒克斯",
    "WIFI": "无线网络",
    "WiFi": "无线网络",
    "wifi": "无线网络",
    "PH": "酸碱度",
    "pH": "酸碱度",
    "EC": "电导率",
    "℃": "摄氏度",
    "mL": "毫升",
    "kg": "公斤",
    "cm": "厘米",
    "mm": "毫米",
}

DIGITS = "零一二三四五六七八九"


def _four_to_cn(n: int) -> str:
    """把 0 < n < 10000 转成中文读法（内部的四位处理）。"""
    units = ["", "十", "百", "千"]
    s = ""
    zero = False
    pos = 0
    while n > 0:
        d = n % 10
        if d == 0:
            if s and not zero:
                zero = True
        else:
            if zero:
                s = "零" + s
                zero = False
            s = DIGITS[d] + units[pos] + s
        n //= 10
        pos += 1
    return s


def _digits_cn(s: str) -> str:
    """逐位读，适合带前导零的编号（如 007）。"""
    return "".join(DIGITS[int(ch)] if ch.isdigit() else ch for ch in s)


def int_to_cn(num_str: str) -> str:
    """整数按中文习惯读：85→八十五，1599→一千五百九十九。

    - 带前导零（编号）逐位读：007→零零七
    - 超过 8 位（纯编号）逐位读，避免生成"万""亿"堆叠
    """
    if not num_str:
        return ""
    if len(num_str) > 1 and num_str[0] == "0":
        return _digits_cn(num_str)
    n = int(num_str)
    if n == 0:
        return "零"
    if len(num_str) > 8:
        return _digits_cn(num_str)

    wan = n // 10000
    rem = n % 10000
    parts = []
    if wan > 0:
        parts.append(_four_to_cn(wan) + "万")
    if rem > 0:
        if wan > 0 and rem < 1000:
            parts.append("零")
        parts.append(_four_to_cn(rem))
    out = "".join(parts)
    # 「一十」→「十」，符合口语（十、十五、十八）
    if out.startswith("一十"):
        out = out[1:]
    return out


def num_to_cn(num_str: str) -> str:
    """数字（可带小数）转中文：20.7→二十点七，85→八十五。"""
    if "." in num_str:
        int_part, dec_part = num_str.split(".", 1)
        return int_to_cn(int_part) + "点" + _digits_cn(dec_part)
    return int_to_cn(num_str)


def load_allowed_chars(model_dir: str) -> set:
    """从模型词表反推合法字符集。

    tokens.txt 里的 token 一定合法；
    lexicon.txt 的 key 是汉字/词条，它包含的所有字符也视为合法。
    宁可放过、不可误杀：多留一个不合法字符只会打印一条警告并被跳过，
    而误删一个合法汉字会直接丢失内容。
    """
    allowed = set()

    tokens_path = os.path.join(model_dir, "tokens.txt")
    with io.open(tokens_path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            # 最后一段是 id，前面整段是 token（空格 token 形如 "  49"）
            idx = line.rfind(" ")
            token = line[:idx] if idx >= 0 else line
            if token:
                allowed.update(token)

    lexicon_path = os.path.join(model_dir, "lexicon.txt")
    with io.open(lexicon_path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            word = line.split(" ", 1)[0]
            if word:
                allowed.update(word)

    allowed.add(" ")  # 空格用于停顿
    return allowed


def normalize_text(text: str, allowed: set) -> str:
    # 1) 英文/缩写替换成中文
    for en, cn in EN_MAP.items():
        text = text.replace(en, cn)
    # 2) 百分号先处理，避免出现「八五百分之」这种倒装
    text = re.sub(
        r"(\d+\.?\d*)\s*%",
        lambda m: "百分之" + num_to_cn(m.group(1)),
        text,
    )
    # 3) 其余数字转中文
    text = re.sub(r"\d+\.?\d*", lambda m: num_to_cn(m.group(0)), text)
    # 4) 按词表白名单过滤：词表外字符统一变逗号，避免 sherpa-onnx 打印 OOV 警告
    buf = []
    for ch in text:
        buf.append(ch if ch in allowed else "，")
    text = "".join(buf)
    # 5) 清理标点：合并连续逗号、去掉句末标点前的逗号
    text = re.sub(r"，+", "，", text)
    text = re.sub(r"，(?=[。！？])", "", text)
    text = text.strip("， ")
    return text


def main():
    tts_config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=os.path.join(MODEL_DIR, "model.onnx"),
                tokens=os.path.join(MODEL_DIR, "tokens.txt"),
                lexicon=os.path.join(MODEL_DIR, "lexicon.txt"),
                dict_dir=MODEL_DIR,
            )
        ),
        max_num_sentences=1,
    )
    tts = sherpa_onnx.OfflineTts(tts_config)
    allowed = load_allowed_chars(MODEL_DIR)

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

    while True:
        len_bytes = read_exact(4)
        text_len = struct.unpack("<I", len_bytes)[0]
        text_bytes = read_exact(text_len)
        raw_text = text_bytes.decode("utf-8", errors="replace").strip()
        if not raw_text:
            out.write(struct.pack("<I", 0))
            out.flush()
            continue

        text = normalize_text(raw_text, allowed)
        if not text:
            sys.stderr.write("TTS skipped: text empty after normalize\n")
            sys.stderr.flush()
            out.write(struct.pack("<I", 0))
            out.flush()
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
