import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { findValidSession } from '../auth/sessions.js';
import type { AuthedUser } from '../auth/schema.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function createRequireAuth(db: Database.Database) {
  return function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const sid = req.signedCookies?.sid;
    if (typeof sid !== 'string' || sid.length === 0) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const resolved = findValidSession(db, sid);
    if (!resolved) {
      res.clearCookie('sid');
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    req.user = resolved.user;
    next();
  };
}
