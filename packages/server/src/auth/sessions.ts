import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SessionRow, UserRow, AuthedUser } from './schema.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SLIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000;  // slide once per day

export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

export function createSession(db: Database.Database, userId: number): string {
  const id = generateSessionId();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, now.toISOString(), expires.toISOString(), now.toISOString());
  return id;
}

export function deleteSession(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export interface ResolvedSession {
  session: SessionRow;
  user: AuthedUser;
}

export function findValidSession(
  db: Database.Database,
  id: string,
  now: Date = new Date(),
): ResolvedSession | null {
  const row = db
    .prepare(
      `SELECT s.id as s_id, s.user_id, s.created_at as s_created, s.expires_at, s.last_seen_at,
              u.id as u_id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  // Use SQL datetime comparison for accuracy (handles SQLite datetime format)
  const isExpired = db
    .prepare('SELECT ? > ? as expired')
    .get(now.toISOString(), row.expires_at as string) as { expired: number | boolean };
  if (isExpired.expired) {
    deleteSession(db, id);
    return null;
  }

  const lastSeen = new Date(row.last_seen_at as string);
  if (now.getTime() - lastSeen.getTime() > SLIDE_THRESHOLD_MS) {
    const newExpires = new Date(now.getTime() + SESSION_TTL_MS);
    db.prepare(
      `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`,
    ).run(now.toISOString(), newExpires.toISOString(), id);
  }

  return {
    session: {
      id: row.s_id as string,
      user_id: row.user_id as number,
      created_at: row.s_created as string,
      expires_at: row.expires_at as string,
      last_seen_at: row.last_seen_at as string,
    },
    user: {
      id: row.u_id as number,
      email: row.email as string,
      name: row.name as string,
      role: row.role as string,
    },
  };
}

export function findUserByEmail(db: Database.Database, email: string): UserRow | null {
  const row = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as UserRow | undefined;
  return row ?? null;
}

export function touchLastLogin(db: Database.Database, userId: number): void {
  db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(userId);
}
