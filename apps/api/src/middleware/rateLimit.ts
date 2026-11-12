import type { NextFunction, Request, Response } from "express";

type RateLimitOptions = {
  name: string;
  maxRequests: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let checks = 0;

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size > 20_000) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

/**
 * 单进程固定窗口限流。用于本地/单实例部署的纵深防护；多实例部署时应替换为网关或 Redis 限流。
 */
export function createRateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    checks += 1;
    if (checks % 256 === 0 || buckets.size > 20_000) pruneExpired(now);

    const principal = req.auth?.id ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = `${options.name}:${principal}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(options.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, options.maxRequests - bucket.count)));
    if (bucket.count > options.maxRequests) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ message: "请求过于频繁，请稍后重试。" });
      return;
    }

    next();
  };
}
