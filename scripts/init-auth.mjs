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

let next = readFileSync(envPath, "utf8");
const generated = [];

function readValue(key) {
  return next.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";
}

function writeValue(key, value) {
  const matcher = new RegExp(`^${key}=.*$`, "m");
  next = matcher.test(next)
    ? next.replace(matcher, `${key}=${value}`)
    : `${next.trimEnd()}\n${key}=${value}\n`;
  generated.push(key);
}

const authSecret = readValue("AUTH_SECRET");
if (authSecret.length < 32) {
  writeValue("AUTH_SECRET", randomBytes(48).toString("base64url"));
}

const adminInvite = readValue("ADMIN_INVITE_CODE");
if (!adminInvite || adminInvite === "admin888" || adminInvite.length < 20) {
  writeValue("ADMIN_INVITE_CODE", randomBytes(24).toString("base64url"));
}

const unsafeSeedPasswords = new Set(["", "Admin@123456", "User@123456"]);
for (const key of ["SEED_ADMIN_PASSWORD", "SEED_USER_PASSWORD"]) {
  if (unsafeSeedPasswords.has(readValue(key))) {
    writeValue(key, `${randomBytes(20).toString("base64url")}!9a`);
  }
}

writeFileSync(envPath, next, "utf8");
if (generated.length > 0) {
  console.log(`[auth] 已安全生成并写入 .env：${generated.join("、")}。具体值不会输出到终端。`);
} else {
  console.log("[auth] 已保留现有安全认证配置。");
}
