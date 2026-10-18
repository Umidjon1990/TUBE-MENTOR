import type { Express, Request, Response, NextFunction } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from './db';
import { storage } from './storage';
import { hasVerifiedIdentity, verifyPassword } from './auth';
import { grantWelcomeBonus } from './commerce';
import type { User } from '@shared/schema';

declare module 'express-session' {
  interface SessionData {
    platformLogin: { nonce: string; expires: number };
  }
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function platformOrigin() {
  const value = process.env.PLATFORM_APP_URL;
  if (!value) return null;
  try { const url = new URL(value); if (url.protocol !== 'https:' && process.env.NODE_ENV !== 'test') return null; return url.origin; } catch { return null; }
}
export function platformKeyMatches(value: string | undefined) {
  const expected = process.env.PLATFORM_SERVICE_SECRET;
  return !!expected && expected.length >= 32 && !!value && value.length <= 256 && timingSafeEqual(Buffer.from(hash(value)), Buffer.from(hash(expected)));
}
function requireService(req: Request, res: Response, next: NextFunction) {
  if (!platformKeyMatches(req.get('x-platform-key'))) return res.status(403).json({ message: 'Xizmat ruxsati yo‘q' });
  next();
}
function publicUser(user: User) {
  return { id: user.id, fullName: user.fullName, username: user.username, email: user.email, role: user.role, coins: user.coins, onboardingCompleted: user.onboardingCompleted, learningLevel: user.learningLevel, dailyGoalMinutes: user.dailyGoalMinutes, timezone: user.timezone };
}
async function sessionFor(user: User) {
  if (!user.isActive || !hasVerifiedIdentity(user)) throw Object.assign(new Error('Tasdiqlangan faol hisob kerak'), { status: 403 });
  const bonus = await grantWelcomeBonus(user.id);
  const token = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO platform_sessions(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,$3,now()+interval \'7 days\')', [hash(token), user.id, user.sessionVersion]);
  return { token, user: publicUser({ ...user, coins: bonus.balance }) };
}
export async function finishPlatformLogin(user: User, nonce: string): Promise<string | null> {
  const origin = platformOrigin();
  if (!origin || !/^[A-Za-z0-9_-]{32,100}$/.test(nonce)) return null;
  const code = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO platform_auth_codes(code_hash,user_id,nonce,expires_at) VALUES($1,$2,$3,now()+interval \'60 seconds\')', [hash(code), user.id, nonce]);
  await pool.query('DELETE FROM platform_auth_codes WHERE expires_at < now()');
  return origin + '/api/platform/auth/callback?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(nonce);
}

/** Authenticate server-to-server calls without sharing native session cookies or secrets. */
export async function attachPlatformIdentity(req: Request, res: Response, next: NextFunction) {
  const key = req.get('x-platform-key');
  if (!key && !req.get('x-platform-session')) return next();
  if (!platformKeyMatches(key)) return res.status(403).json({ message: 'Xizmat ruxsati yo‘q' });
  // BFF requests must not create a new native express-session row on every call.
  Object.defineProperty(req, 'sessionID', { value: undefined, writable: true, configurable: true });
  delete (req.session as any).userId;
  delete (req.session as any).userRole;
  const token = req.get('x-platform-session');
  if (!token) return next();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return res.status(401).json({ message: 'Hisobga qayta kiring' });
  try {
    const found = await pool.query('SELECT user_id,auth_version FROM platform_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()', [hash(token)]);
    if (!found.rowCount) return res.status(401).json({ message: 'Hisobga qayta kiring' });
    const user = await storage.getUser(found.rows[0].user_id);
    if (!user || !user.isActive || !hasVerifiedIdentity(user) || user.sessionVersion !== found.rows[0].auth_version) return res.status(401).json({ message: 'Hisob holati o‘zgargan. Qayta kiring' });
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.authVersion = user.sessionVersion;
    res.locals.validatedUser = user;
    next();
  } catch (error) { next(error); }
}

export function registerPlatformBridge(app: Express) {
  app.get('/api/platform/auth/start/:provider', async (req, res, next) => {
    const provider = req.params.provider;
    const nonce = typeof req.query.nonce === 'string' ? req.query.nonce : '';
    if (!platformOrigin() || !process.env.PLATFORM_SERVICE_SECRET || !['google','telegram'].includes(String(provider)) || !/^[A-Za-z0-9_-]{32,100}$/.test(nonce)) return res.status(400).json({ message: 'Kirish so‘rovi noto‘g‘ri' });
    // OAuth must begin on the host used by the existing callback, so its native session cookie survives.
    if (process.env.APP_URL) {
      const canonical = new URL(process.env.APP_URL);
      if (canonical.host !== req.get('host')) return res.redirect(canonical.origin + '/api/platform/auth/start/' + provider + '?nonce=' + encodeURIComponent(nonce));
    }
    req.session.platformLogin = { nonce, expires: Date.now() + 600000 };
    req.session.save(error => error ? next(error) : res.redirect('/api/auth/' + provider));
  });
  app.post('/api/platform/auth/exchange', requireService, async (req, res, next) => {
    try {
      const { code, nonce } = req.body || {};
      if (typeof code !== 'string' || typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code) || !/^[A-Za-z0-9_-]{32,100}$/.test(nonce)) return res.status(400).json({ message: 'Kirish kodi noto‘g‘ri' });
      const found = await pool.query('DELETE FROM platform_auth_codes WHERE code_hash=$1 AND nonce=$2 AND expires_at>now() RETURNING user_id', [hash(code), nonce]);
      if (!found.rowCount) return res.status(401).json({ message: 'Kirish kodi ishlatilgan yoki eskirgan' });
      const user = await storage.getUser(found.rows[0].user_id);
      if (!user) return res.status(401).json({ message: 'Hisob topilmadi' });
      res.json(await sessionFor(user));
    } catch (error) { next(error); }
  });
  app.post('/api/platform/auth/password', requireService, async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (typeof username !== 'string' || typeof password !== 'string' || username.length > 254 || password.length > 128) return res.status(400).json({ message: 'Login ma’lumotlarini tekshiring' });
      const user = await storage.getUserByUsername(username.trim());
      if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ message: 'Login yoki parol noto‘g‘ri' });
      res.json(await sessionFor(user));
    } catch (error) { next(error); }
  });
  app.get('/api/platform/me', requireService, async (_req, res) => {
    res.json({ user: res.locals.validatedUser ? publicUser(res.locals.validatedUser) : null });
  });
  app.post('/api/platform/auth/logout', requireService, async (req, res, next) => {
    try {
      const token = req.get('x-platform-session');
      if (token) await pool.query('UPDATE platform_sessions SET revoked_at=now() WHERE token_hash=$1', [hash(token)]);
      res.json({ success: true });
    } catch (error) { next(error); }
  });
}
