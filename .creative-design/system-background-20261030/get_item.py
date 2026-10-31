import subprocess
from pathlib import Path

workdir = Path(__file__).resolve().parent
argv = ["design-cli", "design-workspace", "+get",
        "--canvas-workspace-id", "cws_60215457831778050",
        "--item-ids", "JTVtRRK2-4Rmj4ddhQI-0201"]
result = subprocess.run(argv, shell=False, cwd=workdir, capture_output=True, timeout=60)
(workdir / "get.stdout.bin").write_bytes(result.stdout)
(workdir / "get.stderr.bin").write_bytes(result.stderr)
print("EXIT", result.returncode)
print("STDOUT", result.stdout.decode("utf-8", errors="strict"))
print("STDERR", result.stderr.decode("utf-8", errors="strict"))
