import { createHmac, timingSafeEqual } from "node:crypto";

// 媒体静态资源签名认证：uploads 目录不再匿名公开，
// 所有图片/视频 URL 由后端签发短期签名（默认 15 分钟），过期或伪造即 403。
const MEDIA_TTL_SEC = 15 * 60;

function mediaKey(): Buffer {
  // 派生独立密钥，避免直接复用 AUTH_SECRET 原始值
  return createHmac("sha256", `media-v1:${process.env.AUTH_SECRET ?? ""}`).digest();
}

function signFile(file: string, exp: number): string {
  return createHmac("sha256", mediaKey()).update(`${file}:${exp}`).digest("base64url");
}

/**
 * 将数据库/响应中的媒体 URL 改写为带签名的 URL。
 * 仅处理本地上传的 /uploads/ 资源；非本地或空值原样返回。
 */
export function signMediaUrl(url: string | undefined | null): string | undefined {
  if (!url || !url.startsWith("/uploads/")) return url ?? undefined;
  const file = url.replace(/^\/uploads\//, "");
  const exp = Math.floor(Date.now() / 1000) + MEDIA_TTL_SEC;
  return `${url}?sig=${signFile(file, exp)}&exp=${exp}`;
}

/**
 * 校验静态资源请求：签名与过期时间缺一不可，签名使用 timingSafeEqual 比对。
 * file 为相对 uploads 目录的文件名（不含前缀与 query）。
 */
export function verifyMediaRequest(
  file: string,
  sig: string | undefined,
  exp: string | undefined,
): boolean {
  if (!file || !sig || !exp) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = signFile(file, expNum);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
