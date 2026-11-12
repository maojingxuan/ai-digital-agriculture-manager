import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelsRoot = path.join(root, "apps", "api", "models");
const models = [
  {
    name: "SenseVoice 语音识别",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2",
    archiveDir: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
    destination: path.join(modelsRoot, "asr-sense-voice"),
    required: ["model.int8.onnx", "tokens.txt"],
    modelFile: "model.int8.onnx",
    sha256: "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51",
  },
  {
    name: "VITS 中文语音合成",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-vits-zh-ll.tar.bz2",
    archiveDir: "sherpa-onnx-vits-zh-ll",
    destination: path.join(modelsRoot, "tts-zh-ll", "sherpa-onnx-vits-zh-ll"),
    required: ["model.onnx", "tokens.txt", "lexicon.txt", "dict"],
    modelFile: "model.onnx",
    sha256: "6c349bdd73dc928234dd7bc86929748bba32cd5264d32d915bf7b7aa0595965b",
  },
];

function sha256(file) {
  const hash = createHash("sha256");
  const fd = fs.openSync(file, "r");
  try {
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    for (let count; (count = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0;) {
      hash.update(chunk.subarray(0, count));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function ready(model, dir = model.destination) {
  return model.required.every((name) => fs.existsSync(path.join(dir, name))) &&
    sha256(path.join(dir, model.modelFile)) === model.sha256;
}

async function install(model) {
  if (ready(model)) {
    console.log(`[models] ${model.name} 已就绪`);
    return;
  }
  if (fs.existsSync(model.destination)) {
    throw new Error(`${model.name} 目录已存在但文件不完整或校验失败：${model.destination}。请先检查或备份该目录。`);
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agri-model-"));
  try {
    console.log(`[models] 正在下载 ${model.name}：${model.url}`);
    const response = await fetch(model.url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`);
    const archive = path.join(temp, "model.tar.bz2");
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(archive));
    const extracted = path.join(temp, "extracted");
    fs.mkdirSync(extracted);
    const tar = spawnSync("tar", ["-xjf", archive, "-C", extracted], { stdio: "inherit", windowsHide: true });
    if (tar.error || tar.status !== 0) throw new Error(`解压失败：${tar.error?.message ?? tar.status}`);
    const source = path.join(extracted, model.archiveDir);
    if (!ready(model, source)) throw new Error(`${model.name} 的文件或 SHA-256 与预期不符`);
    fs.mkdirSync(path.dirname(model.destination), { recursive: true });
    fs.renameSync(source, model.destination);
    console.log(`[models] ${model.name} 安装完成：${model.destination}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

for (const model of models) await install(model);
console.log("[models] YOLO 权重已随源码仓库提供；语音模型已从上游官方发行版安装。");
