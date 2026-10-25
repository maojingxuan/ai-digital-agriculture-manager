import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env");
const envExamplePath = path.join(projectRoot, ".env.example");

if (!existsSync(envPath)) {
  writeFileSync(envPath, readFileSync(envExamplePath, "utf8"), "utf8");
}

const source = readFileSync(envPath, "utf8");
const existingSecret = source.match(/^AUTH_SECRET=(.+)$/m)?.[1]?.trim();
if (existingSecret && existingSecret.length >= 32) {
  console.log("[auth] 已保留现有登录签名密钥。");
  process.exit(0);
}

const secret = randomBytes(48).toString("base64url");
const next = /^AUTH_SECRET=.*$/m.test(source)
  ? source.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${secret}`)
  : `${source.trimEnd()}\n\nAUTH_SECRET=${secret}\n`;

writeFileSync(envPath, next, "utf8");
console.log("[auth] 已生成本机登录签名密钥并写入 .env。");
