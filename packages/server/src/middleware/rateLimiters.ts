import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

function userOrIp(req: Request): string {
  if (req.user?.id) return `u:${req.user.id}`;
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests', retryAfter: 900 });
  },
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIp,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests', retryAfter: 900 });
  },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIp,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests', retryAfter: 3600 });
  },
});
