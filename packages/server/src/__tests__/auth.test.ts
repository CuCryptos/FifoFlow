import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createAuthRoutes } from '../routes/auth.js';
import { createRequireAuth } from '../middleware/requireAuth.js';
import { hashPassword } from '../auth/passwords.js';

const COOKIE_SECRET = 'test-secret-cookie-test-secret-cookie';

async function makeApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const hash = await hashPassword('correct-horse-battery');
  db.prepare(
    `INSERT INTO users (email, password_hash, name, role, created_at)
     VALUES ('curt@example.com', ?, 'Curt', 'admin', datetime('now'))`,
  ).run(hash);
  const app = express();
  app.use(express.json());
  app.use(cookieParser(COOKIE_SECRET));
  app.use('/api/auth', createAuthRoutes(db));
  const requireAuth = createRequireAuth(db);
  app.get('/api/protected', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
  return { app, db };
}

describe('auth routes', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(async () => {
    ({ app, db } = await makeApp());
  });
  afterEach(() => db.close());

  it('logs in with valid credentials and sets a cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'curt@example.com', password: 'correct-horse-battery' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'curt@example.com', name: 'Curt' });
    expect(res.headers['set-cookie']?.[0]).toMatch(/^sid=/);
  });

  it('rejects invalid password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'curt@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects unknown email with the same 401 message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('GET /me returns 401 without cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /me returns user with valid cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'curt@example.com', password: 'correct-horse-battery',
    });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('curt@example.com');
  });

  it('logout deletes the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'curt@example.com', password: 'correct-horse-battery',
    });
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions').get()).toEqual({ c: 0 });
  });

  it('requireAuth rejects protected routes without a session', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
  });

  it('requireAuth allows protected routes with a valid session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'curt@example.com', password: 'correct-horse-battery',
    });
    const res = await agent.get('/api/protected');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('curt@example.com');
  });

  it('expired sessions are rejected and removed', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'curt@example.com', password: 'correct-horse-battery',
    });
    db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour')").run();
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions').get()).toEqual({ c: 0 });
  });
});
