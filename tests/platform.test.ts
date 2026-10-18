import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import type { Server } from 'node:http';
let pg: PGlite, socket: PGLiteSocketServer, http: Server, pool: import('pg').Pool, base: string, userId: string;
const password = randomBytes(32).toString('hex');
const key = randomBytes(32).toString('hex');
const headers = { 'Content-Type': 'application/json', 'x-platform-key': key };
async function post(path: string, data: unknown, extra: Record<string,string> = {}) { return fetch(base + path, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(data) }); }
before(async () => {
  pg = new PGlite(); await pg.waitReady;
  socket = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 1 }); await socket.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
  process.env.DB_POOL_MAX = '1'; process.env.NODE_ENV = 'test'; process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  process.env.APP_URL = 'http://localhost'; process.env.PLATFORM_APP_URL = 'http://portal.local'; process.env.PLATFORM_SERVICE_SECRET = key;
  const { createApplication } = await import('../server/app');
  ({ pool } = await import('../server/db'));
  const app = await createApplication({ seed: false }); http = app.httpServer;
  const { hashPassword } = await import('../server/auth');
  const result = await pool.query("INSERT INTO users(full_name,username,password_hash,email_verified) VALUES('Platform test','platform_test',$1,true) RETURNING id", [hashPassword(password)]); userId = result.rows[0].id;
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + (http.address() as any).port;
});
after(async () => { await new Promise<void>(resolve => http?.close(() => resolve())); await pool?.end(); await socket?.stop(); await pg?.close(); });
test('platform service authentication cannot be forged and public me contains no private identity', async () => {
  assert.equal((await fetch(base + '/api/platform/me', { headers: { 'x-platform-key': 'incorrect', 'x-platform-session': 'forged' } })).status, 403);
  const response = await fetch(base + '/api/platform/me', { headers });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { user: null });
});
test('password login shares the existing account/wallet and never repeats the welcome bonus', async () => {
  const first = await post('/api/platform/auth/password', { username: 'platform_test', password });
  assert.equal(first.status, 200); const data = await first.json(); assert.equal(data.user.id, userId); assert.equal(data.user.coins, 30); assert.equal(data.user.passwordHash, undefined);
  const second = await post('/api/platform/auth/password', { username: 'platform_test', password }); assert.equal(second.status, 200);
  assert.equal((await second.json()).user.coins, 30);
  const wallet = await fetch(base + '/api/commerce/wallet', { headers: { ...headers, 'x-platform-session': data.token } }); assert.equal(wallet.status, 200);
  assert.equal((await wallet.json()).balance, 30);
  const ledger = await pool.query("SELECT count(*)::int AS n FROM coin_transactions WHERE user_id=$1 AND type='welcome_bonus'", [userId]); assert.equal(ledger.rows[0].n, 1);
  const sessions = await pool.query('SELECT count(*)::int AS n FROM session'); assert.equal(sessions.rows[0].n, 0);
});
test('OAuth handoff is nonce-bound, single-use and has a fixed callback origin', async () => {
  const { finishPlatformLogin } = await import('../server/platform-bridge'); const { storage } = await import('../server/storage');
  const nonce = randomBytes(32).toString('base64url'); const url = new URL((await finishPlatformLogin((await storage.getUser(userId))!, nonce))!);
  assert.equal(url.origin, 'http://portal.local'); const code = url.searchParams.get('code');
  assert.equal((await post('/api/platform/auth/exchange', { code, nonce: randomBytes(32).toString('base64url') })).status, 401);
  const response = await post('/api/platform/auth/exchange', { code, nonce }); assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, userId);
  assert.equal((await post('/api/platform/auth/exchange', { code, nonce })).status, 401);
});
test('logout and account version changes invalidate platform sessions', async () => {
  const response = await post('/api/platform/auth/password', { username: 'platform_test', password }); const { token } = await response.json();
  assert.equal((await post('/api/platform/auth/logout', {}, { 'x-platform-session': token })).status, 200);
  assert.equal((await fetch(base + '/api/platform/me', { headers: { ...headers, 'x-platform-session': token } })).status, 401);
  const another = await post('/api/platform/auth/password', { username: 'platform_test', password }); const newToken = (await another.json()).token;
  await pool.query('UPDATE users SET session_version=session_version+1 WHERE id=$1', [userId]);
  assert.equal((await fetch(base + '/api/platform/me', { headers: { ...headers, 'x-platform-session': newToken } })).status, 401);
});
let productId: string, lessonId: number, accessToken: string;
test('real published lessons appear in the public marketplace; demos contain only the allowed portion', async () => {
  const lesson = await pool.query(`INSERT INTO lessons(title,status,youtube_url,transcript_source,subtitles_json) VALUES('Real source fixture','published','https://www.youtube.com/watch?v=dQw4w9WgXcQ','manual',$1) RETURNING id`,[JSON.stringify([{text:'أَهْلًا',translation:'Salom',start:0,end:5},{text:'بَعْدَ ذَلِكَ',translation:'Keyin',start:60,end:65}])]);
  lessonId = lesson.rows[0].id; productId = 'tube-' + lessonId;
  const catalog = await fetch(base + '/api/platform/catalog'); assert.equal(catalog.status,200);
  const products = (await catalog.json()).products; assert.equal(products.find((p:any)=>p.id===productId).priceCoins,10);
  const demo = await fetch(base + '/api/platform/products/' + productId + '/demo'); const data=await demo.json();
  assert.equal(demo.status,200); assert.equal(data.endSeconds,30); assert.equal(data.transcript,undefined); assert.equal(data.quizzesJson,undefined); assert.equal(data.segments.some((s:any)=>s.start>=30),false);
  accessToken=(await (await post('/api/platform/auth/password',{username:'platform_test',password})).json()).token;
});
test('marketplace purchase and repeated requests debit the existing wallet only once', async () => {
  const requestKey=crypto.randomUUID(); const body={requestKey,expectedPrice:10}; const h={'x-platform-session':accessToken};
  const first=await post('/api/platform/products/'+productId+'/purchase',body,h); assert.equal(first.status,200); const order=await first.json(); assert.equal(order.status,'active');
  const repeat=await post('/api/platform/products/'+productId+'/purchase',body,h); assert.equal((await repeat.json()).id,order.id);
  const another=await post('/api/platform/products/'+productId+'/purchase',{requestKey:crypto.randomUUID(),expectedPrice:10},h); assert.equal(another.status,200);
  const user=(await pool.query('SELECT coins FROM users WHERE id=$1',[userId])).rows[0]; assert.equal(user.coins,20);
  const ledger=await pool.query("SELECT count(*)::int AS n FROM coin_transactions WHERE user_id=$1 AND type='product_purchase'",[userId]); assert.equal(ledger.rows[0].n,1);
  const source=await fetch(base+'/api/learn/lessons/'+lessonId,{headers:{...headers,...h}}); assert.equal(source.status,200);
});
test('expired access is denied by the original learning endpoint and renewed purchase creates one new term', async () => {
  await pool.query("UPDATE lesson_access SET expires_at=now()-interval '1 day' WHERE user_id=$1 AND lesson_id=$2",[userId,lessonId]);
  await pool.query("UPDATE platform_orders SET expires_at=now()-interval '1 day' WHERE user_id=$1 AND product_id=$2",[userId,productId]);
  const h={'x-platform-session':accessToken};
  assert.equal((await fetch(base+'/api/learn/lessons/'+lessonId,{headers:{...headers,...h}})).status,402);
  await pool.query('UPDATE platform_products SET duration_days=30 WHERE id=$1',[productId]);
  const changed=await post('/api/platform/products/'+productId+'/purchase',{requestKey:crypto.randomUUID(),expectedPrice:99},h);assert.equal(changed.status,409);
  const renewed=await post('/api/platform/products/'+productId+'/purchase',{requestKey:crypto.randomUUID(),expectedPrice:10},h);assert.equal(renewed.status,200);assert.ok((await renewed.json()).expires_at);
  assert.equal((await fetch(base+'/api/learn/lessons/'+lessonId,{headers:{...headers,...h}})).status,200);
  assert.equal((await pool.query('SELECT coins FROM users WHERE id=$1',[userId])).rows[0].coins,10);
});
test('unconnected source products cannot charge a student', async()=>{
  await pool.query("INSERT INTO platform_products(id,provider,source_id,kind,title,price_coins,demo_ref,status) VALUES('unconnected-course','courses','fixture','course','Provider fixture',5,'fixture','published')");
  const response=await post('/api/platform/products/unconnected-course/purchase',{requestKey:crypto.randomUUID(),expectedPrice:5},{'x-platform-session':accessToken});assert.equal(response.status,503);
  assert.equal((await pool.query('SELECT coins FROM users WHERE id=$1',[userId])).rows[0].coins,10);
});
test('admin extends access, then refund restores original coin lots exactly once and removes source access',async()=>{
 const {managePlatformOrder}=await import('../server/marketplace');
 const order=(await pool.query("SELECT * FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND status='active' ORDER BY created_at DESC LIMIT 1",[userId,productId])).rows[0];
 await managePlatformOrder(userId,order.id,{action:'extend',days:10,reason:'Test extension'});
 const access=(await pool.query('SELECT expires_at FROM lesson_access WHERE user_id=$1 AND lesson_id=$2',[userId,lessonId])).rows[0];assert.ok(new Date(access.expires_at).getTime()>Date.now()+39*86400000);
 await managePlatformOrder(userId,order.id,{action:'refund',reason:'Test refund'});
 await managePlatformOrder(userId,order.id,{action:'refund',reason:'Retry refund'});
 assert.equal((await pool.query('SELECT coins FROM users WHERE id=$1',[userId])).rows[0].coins,20);
 assert.equal((await pool.query('SELECT sum(remaining)::int AS balance FROM coin_grants WHERE user_id=$1',[userId])).rows[0].balance,20);
 assert.equal((await fetch(base+'/api/learn/lessons/'+lessonId,{headers:{...headers,'x-platform-session':accessToken}})).status,402);
});
test('saved words and audio progress are isolated by account and reject invalid resource identifiers',async()=>{
 const extra={'x-platform-session':accessToken};
 assert.equal((await post('/api/platform/audio/progress',{resourceId:'lesson-01',position:15,duration:100},extra)).status,200);
 assert.equal((await post('/api/platform/audio/progress',{resourceId:'lesson-31',position:0,duration:1},extra)).status,400);
 const response=await fetch(base+'/api/platform/audio/progress',{headers:{...headers,...extra}});assert.equal((await response.json()).progress['lesson-01'],15);
 assert.equal((await post('/api/platform/saved',{sourceId:'123',arabic:'كِتَابٌ',translation:'kitob'},extra)).status,200);
 assert.equal((await fetch(base+'/api/platform/saved',{headers})).status,401);
});
