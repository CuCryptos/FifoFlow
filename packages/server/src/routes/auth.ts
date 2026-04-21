import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { verifyPassword } from '../auth/passwords.js';
import {
  createSession,
  deleteSession,
  findUserByEmail,
  findValidSession,
  touchLastLogin,
} from '../auth/sessions.js';

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
    secure: process.env.COOKIE_SECURE === 'true',
    signed: true,
  };
}

export function createAuthRoutes(db: Database.Database): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const user = findUserByEmail(db, email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const sid = createSession(db, user.id);
    touchLastLogin(db, user.id);
    res.cookie('sid', sid, cookieOptions());
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  router.post('/logout', (req: Request, res: Response) => {
    const sid = req.signedCookies?.sid;
    if (typeof sid === 'string') deleteSession(db, sid);
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', (req: Request, res: Response) => {
    const sid = req.signedCookies?.sid;
    if (typeof sid !== 'string' || sid.length === 0) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const resolved = findValidSession(db, sid, new Date());
    if (!resolved) {
      res.clearCookie('sid');
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user: resolved.user });
  });

  return router;
}
