import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LlmService } from "../dist/services/llmService.js";

const directory = fs.mkdtempSync(path.join(process.cwd(), ".llm-test-"));
const selectionFile = path.join(directory, "provider.json");
const originalFetch = globalThis.fetch;
const originalKey = process.env.DEEPSEEK_API_KEY;
const originalDeepSeekUrl = process.env.DEEPSEEK_BASE_URL;
const originalOllamaUrl = process.env.OLLAMA_BASE_URL;
const calls = [];

try {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek.test/v1";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: "测试回答" } }] }) };
  };

  const service = new LlmService(selectionFile);
  service.setProvider("ollama");
  assert.equal(await service.chat([{ role: "user", content: "你好" }]), "测试回答");
  assert.equal(calls[0].url, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(calls[0].body.model, "qwen2.5:7b");
  assert.equal(calls[0].headers.Authorization, undefined);

  service.setProvider("deepseek");
  assert.equal(await service.chat([{ role: "user", content: "你好" }]), "测试回答");
  assert.equal(calls[1].url, "https://deepseek.test/v1/chat/completions");
  assert.equal(calls[1].body.model, "deepseek-chat");
  assert.equal(calls[1].headers.Authorization, "Bearer test-key");
  assert.equal(new LlmService(selectionFile).getStatus().activeProvider, "deepseek");
  console.log("LLM provider routing and persistence passed");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
  if (originalDeepSeekUrl === undefined) delete process.env.DEEPSEEK_BASE_URL; else process.env.DEEPSEEK_BASE_URL = originalDeepSeekUrl;
  if (originalOllamaUrl === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = originalOllamaUrl;
  assert.ok(directory.startsWith(`${process.cwd()}${path.sep}.llm-test-`));
  fs.rmSync(directory, { recursive: true, force: true });
}
