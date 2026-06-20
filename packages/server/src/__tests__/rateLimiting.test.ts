import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createAuthRoutes } from '../routes/auth.js';
import { loginLimiter } from '../middleware/rateLimiters.js';

const COOKIE_SECRET = 'test-secret-cookie-test-secret-cookie';

function makeApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(cookieParser(COOKIE_SECRET));
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', createAuthRoutes(db));
  return { app, db };
}

describe('login rate limiter', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => { ({ app, db } = makeApp()); });
  afterEach(() => db.close());

  it('returns 429 after 10 attempts from the same IP within the window', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'x@y.com', password: 'nope' });
      expect(res.status).toBe(401);
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@y.com', password: 'nope' });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many requests');
  });
});
