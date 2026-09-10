import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

interface Counter {
  count: number;
  resetsAt: number;
}

/** 小型單機版速率限制器；若未來改成多 instance，請改用共享儲存。 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}): RequestHandler {
  const counters = new Map<string, Counter>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, counter] of counters) if (counter.resetsAt <= now) counters.delete(key);
  }, Math.max(options.windowMs, 60_000));
  timer.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = options.key?.(req) ?? req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const current = counters.get(key);
    const counter = !current || current.resetsAt <= now
      ? { count: 0, resetsAt: now + options.windowMs }
      : current;
    counter.count++;
    counters.set(key, counter);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - counter.count)));
    if (counter.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((counter.resetsAt - now) / 1000)));
      res.status(429).json({ ok: false, error: '操作太頻繁，請稍後再試' });
      return;
    }
    next();
  };
}

function safeEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

/** 以環境變數 ADMIN_PASSWORD 保護題庫管理 API。 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    res.status(503).json({ ok: false, error: '題庫管理功能尚未設定管理密碼' });
    return;
  }
  const supplied = req.header('x-admin-password') ?? '';
  if (!safeEqual(supplied, expected)) {
    res.status(401).json({ ok: false, error: '管理密碼不正確' });
    return;
  }
  next();
}

/** 不改變版面的基本瀏覽器安全標頭。 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; img-src 'self' data:; " +
      "script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:"
  );
  next();
};
