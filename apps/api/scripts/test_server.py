import subprocess, sys, struct, time, os

PY = r"E:\Conda\miniconda3\envs\work\python.exe"
SCRIPT = r"D:\新数字人系统\apps\api\scripts\sherpa_tts_server.py"

proc = subprocess.Popen(
    [PY, SCRIPT],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env={**os.environ, "PYTHONIOENCODING": "utf-8"},
)

# 等 READY（最多30秒）
buf = b""
start = time.time()
while b"READY" not in buf:
    chunk = proc.stdout.read(1)
    if not chunk:
        print("Process exited. stderr:", proc.stderr.read().decode())
        sys.exit(1)
    buf += chunk
    if time.time() - start > 30:
        print("Timeout READY. stderr:", proc.stderr.read().decode())
        sys.exit(1)
print("READY in", round(time.time()-start,1), "s, leftover:", buf)

# 发文本
text = "你好主人，我是小墨".encode("utf-8") + b"\n"
proc.stdin.write(text)
proc.stdin.flush()

# 读4字节长度
len_bytes = b""
while len(len_bytes) < 4:
    len_bytes += proc.stdout.read(4 - len(len_bytes))
wav_len = struct.unpack("<I", len_bytes)[0]
print("wav_len:", wav_len)

wav = b""
while len(wav) < wav_len:
    wav += proc.stdout.read(wav_len - len(wav))
with open(r"D:\新数字人系统\apps\api\test_py.wav", "wb") as f:
    f.write(wav)
print("saved, size:", len(wav))

proc.terminate()
