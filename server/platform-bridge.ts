import type { Express, Request, Response, NextFunction } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from './db';
import { storage } from './storage';
import { canSignIn, hashPassword, verifyPassword } from './auth';
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
  return { id: user.id, fullName: user.fullName, username: user.username, email: user.email, phone: user.phone || null, isTest: !!user.isTest, role: user.role, coins: user.coins, onboardingCompleted: user.onboardingCompleted, learningLevel: user.learningLevel, dailyGoalMinutes: user.dailyGoalMinutes, timezone: user.timezone };
}
async function sessionFor(user: User) {
  if (!user.isActive || !canSignIn(user)) throw Object.assign(new Error('Tasdiqlangan faol hisob kerak'), { status: 403 });
  const bonus = await grantWelcomeBonus(user.id);
  const token = randomBytes(32).toString('base64url');
  // Kirish 90 kun saqlanadi va har kuni foydalanilganda yana 90 kunga uzayadi (attachPlatformIdentity).
  await pool.query('INSERT INTO platform_sessions(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,$3,now()+interval \'90 days\')', [hash(token), user.id, user.sessionVersion]);
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
    const found = await pool.query('SELECT user_id,auth_version,expires_at FROM platform_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()', [hash(token)]);
    if (!found.rowCount) return res.status(401).json({ message: 'Hisobga qayta kiring' });
    const user = await storage.getUser(found.rows[0].user_id);
    if (!user || !user.isActive || !canSignIn(user) || user.sessionVersion !== found.rows[0].auth_version) return res.status(401).json({ message: 'Hisob holati o‘zgargan. Qayta kiring' });
    // Sirpanuvchi muddat: kuniga ko'pi bilan bir marta yana 90 kunga uzaytiriladi.
    if (new Date(found.rows[0].expires_at).getTime() < Date.now() + 89 * 86400000) {
      await pool.query("UPDATE platform_sessions SET expires_at=now()+interval '90 days' WHERE token_hash=$1 AND revoked_at IS NULL", [hash(token)]);
    }
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
  // ── Telefon raqam + ism-familiya + kirish kodi ──
  // Kod — o'quvchi o'zi o'ylab topgan istalgan belgilar (4–64), scrypt bilan saqlanadi. SMS yo'q (xarajatsiz).
  // 5 marta noto'g'ri kiritilsa raqam 15 daqiqaga bloklanadi. Bunday hisobga xush kelibsiz bonusi berilmaydi
  // (soxta hisoblar ochib coin yig'ilmasin) — Google/Telegram ulansa beriladi.
  const normPhone = (raw: unknown) => {
    const d = String(raw || '').replace(/\D/g, '');
    const local = d.length === 12 && d.startsWith('998') ? d.slice(3) : d.length === 9 ? d : '';
    return /^[1-9]\d{8}$/.test(local) ? '+998' + local : null;
  };
  const passcodeOk = (v: unknown) => typeof v === 'string' && v.length >= 4 && v.length <= 64;
  app.post('/api/platform/auth/phone/register', requireService, async (req, res, next) => {
    try {
      const phone = normPhone(req.body?.phone);
      const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.replace(/\s+/g, ' ').trim() : '';
      if (!phone) return res.status(400).json({ message: 'Telefon raqamni to‘liq yozing, masalan +998 90 123 45 67' });
      if (fullName.length < 3 || fullName.length > 80) return res.status(400).json({ message: 'Ism-familiyani to‘liq yozing' });
      if (!passcodeOk(req.body?.passcode)) return res.status(400).json({ message: 'Kirish kodi kamida 4 ta belgidan iborat bo‘lsin' });
      if (process.env.ALLOW_SIGNUP === 'false') return res.status(403).json({ message: 'Ro‘yxatdan o‘tish vaqtincha yopiq' });
      const exists = await pool.query('SELECT 1 FROM users WHERE phone=$1', [phone]);
      if (exists.rowCount) return res.status(409).json({ message: 'Bu raqam bilan hisob ochilgan. «Kirish» bo‘limida kirish kodingizni yozing.' });
      const created = await pool.query(
        'INSERT INTO users(full_name,username,phone,email_verified,password_hash,role) VALUES($1,$2,$3,false,$4,$5) ON CONFLICT DO NOTHING RETURNING id',
        [fullName, 'phone_' + phone.slice(1), phone, hashPassword(req.body.passcode), 'student'],
      );
      if (!created.rowCount) return res.status(409).json({ message: 'Bu raqam bilan hisob ochilgan. «Kirish» bo‘limida kirish kodingizni yozing.' });
      const user = await storage.getUser(created.rows[0].id);
      res.json(await sessionFor(user!));
    } catch (error) { next(error); }
  });
  app.post('/api/platform/auth/phone/login', requireService, async (req, res, next) => {
    try {
      const phone = normPhone(req.body?.phone);
      if (!phone || !passcodeOk(req.body?.passcode)) return res.status(400).json({ message: 'Telefon raqam va kirish kodini tekshiring' });
      const lock = await pool.query('SELECT failures,locked_until FROM phone_login_attempts WHERE phone=$1', [phone]);
      const until = lock.rows[0]?.locked_until ? new Date(lock.rows[0].locked_until).getTime() : 0;
      if (until > Date.now()) {
        res.set('Retry-After', String(Math.ceil((until - Date.now()) / 1000)));
        return res.status(429).json({ message: 'Ko‘p marta noto‘g‘ri kiritildi. 15 daqiqadan keyin qayta urinib ko‘ring.' });
      }
      const row = await pool.query('SELECT id,password_hash FROM users WHERE phone=$1', [phone]);
      if (!row.rowCount || !verifyPassword(req.body.passcode, row.rows[0].password_hash)) {
        await pool.query(
          `INSERT INTO phone_login_attempts(phone,failures) VALUES($1,1) ON CONFLICT(phone) DO UPDATE SET
             failures = CASE WHEN phone_login_attempts.locked_until IS NOT NULL AND phone_login_attempts.locked_until < now() THEN 1 ELSE phone_login_attempts.failures + 1 END,
             locked_until = CASE WHEN (CASE WHEN phone_login_attempts.locked_until IS NOT NULL AND phone_login_attempts.locked_until < now() THEN 1 ELSE phone_login_attempts.failures + 1 END) >= 5 THEN now() + interval '15 minutes' ELSE NULL END`,
          [phone],
        );
        return res.status(401).json({ message: 'Telefon raqam yoki kirish kodi noto‘g‘ri' });
      }
      await pool.query('DELETE FROM phone_login_attempts WHERE phone=$1', [phone]);
      const user = await storage.getUser(row.rows[0].id);
      if (!user?.isActive) return res.status(403).json({ message: 'Hisob bloklangan' });
      await pool.query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
      res.json(await sessionFor(user));
    } catch (error) { next(error); }
  });
  // O'quvchi o'z kirish kodini almashtiradi (joriy kod bilan).
  app.post('/api/platform/auth/phone/change', requireService, async (req, res, next) => {
    try {
      const user = res.locals.validatedUser as User | undefined;
      if (!user?.phone) return res.status(401).json({ message: 'Hisobga qayta kiring' });
      if (!passcodeOk(req.body?.next)) return res.status(400).json({ message: 'Yangi kod kamida 4 ta belgidan iborat bo‘lsin' });
      if (!verifyPassword(String(req.body?.current || ''), user.passwordHash)) return res.status(400).json({ message: 'Joriy kirish kodi noto‘g‘ri' });
      await pool.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [hashPassword(req.body.next), user.id]);
      res.json({ success: true });
    } catch (error) { next(error); }
  });
  // Admin: o'quvchining kirish kodini tiklash — yangi vaqtinchalik kod qaytadi (admin o'quvchiga aytadi).
  app.post('/api/platform/admin/users/:id/reset-passcode', requireService, async (req, res, next) => {
    try {
      const actor = res.locals.validatedUser as User | undefined;
      if (!actor || actor.role !== 'admin' || actor.isTest) return res.status(403).json({ message: 'Faqat admin uchun' });
      const target = await storage.getUser(String(req.params.id));
      if (!target?.phone) return res.status(404).json({ message: 'Telefon raqamli hisob topilmadi' });
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
      await pool.query('UPDATE users SET password_hash=$1,session_version=session_version+1,updated_at=now() WHERE id=$2', [hashPassword(code), target.id]);
      await pool.query('DELETE FROM phone_login_attempts WHERE phone=$1', [target.phone]);
      res.json({ passcode: code, phone: target.phone, fullName: target.fullName });
    } catch (error) { next(error); }
  });
  // ── Admin uchun "O'quvchi rejimi": adminga bog'langan alohida sinov o'quvchi hisobi ──
  app.post('/api/platform/auth/student-mode', requireService, async (_req, res, next) => {
    try {
      const actor = res.locals.validatedUser as User | undefined;
      if (!actor || actor.role !== 'admin' || actor.isTest) return res.status(403).json({ message: 'Faqat admin uchun' });
      let row = await pool.query('SELECT id FROM users WHERE test_owner_id=$1', [actor.id]);
      if (!row.rowCount) {
        row = await pool.query(
          "INSERT INTO users(full_name,username,email_verified,password_hash,role,is_test,test_owner_id) VALUES($1,$2,false,$3,'student',true,$4) ON CONFLICT DO NOTHING RETURNING id",
          ['Sinov o‘quvchi', 'test_' + actor.id.replace(/-/g, '').slice(0, 24), hashPassword(randomBytes(32).toString('hex')), actor.id],
        );
        if (!row.rowCount) row = await pool.query('SELECT id FROM users WHERE test_owner_id=$1', [actor.id]);
      }
      const student = await storage.getUser(row.rows[0].id);
      if (!student) return res.status(500).json({ message: 'Sinov hisobini ochib bo‘lmadi' });
      // Har bir adminning sinov o'quvchisi tayyor sinov guruhlariga (masalan, "A1 sinov guruhi") avtomatik qo'shiladi.
      await pool.query(
        "INSERT INTO cls_members(group_id,user_id,status,display_name) SELECT g.id,$1,'active','Sinov o‘quvchi' FROM cls_groups g WHERE g.source_key IS NOT NULL ON CONFLICT (group_id,user_id) DO UPDATE SET status='active'",
        [student.id],
      );
      res.json(await sessionFor(student));
    } catch (error) { next(error); }
  });
  app.post('/api/platform/auth/logout', requireService, async (req, res, next) => {
    try {
      const token = req.get('x-platform-session');
      if (token) await pool.query('UPDATE platform_sessions SET revoked_at=now() WHERE token_hash=$1', [hash(token)]);
      res.json({ success: true });
    } catch (error) { next(error); }
  });
}
