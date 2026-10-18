import type { Express } from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from './db';
import { storage } from './storage';
import { requireAdmin, requireAuth } from './auth';
import { getCommerceSettings, grantWelcomeBonus } from './commerce';
import { cefrLevel, lessonSegments, publishedLesson, youtubeId } from '@shared/learning';
import { lessonPrice } from '@shared/commerce';
import { catalogCard } from './access';

const providerConfig = {
 courses: { url: 'https://zamonaviy-videokurs.up.railway.app', env: 'PLATFORM_COURSES_SECRET' },
 arabictest: { url: 'https://www.arabictest.uz', env: 'PLATFORM_ARABICTEST_SECRET' },
 quiz: { url: 'https://web-production-73482.up.railway.app', env: 'PLATFORM_QUIZ_SECRET' },
};
export async function providerRequest(provider: string, path: string, body?: unknown) {
 const config = providerConfig[provider as keyof typeof providerConfig];
 const key = config && process.env[config.env];
 if (!config || !key || key.length < 32) throw Object.assign(new Error('Manba ulanishi tayyor emas'), { status: 503 });
 const response = await fetch(config.url + '/api/platform/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-platform-key': key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error' });
 if (!response.ok) throw Object.assign(new Error('Manba so‘rovni bajarmadi'), { status: response.status >= 500 ? 503 : response.status });
 return response.json();
}
const problem = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
function dto(p: any) {
 return { id: p.id, provider: p.provider, sourceId: p.source_id, kind: p.kind, title: p.title, description: p.description, thumbnailUrl: p.thumbnail_url, level: p.level, skill: p.skill, priceCoins: p.price_coins, durationDays: p.duration_days, maxAttempts: p.max_attempts, hasDemo: !!p.demo_ref, sourceVersion: p.source_version, status: p.status };
}
const offerInput = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(5000).default(''), priceCoins: z.number().int().min(0).max(1000000), durationDays: z.number().int().min(1).max(3650).nullable(), maxAttempts: z.number().int().min(1).max(1000).nullable(), demoRef: z.string().min(1).max(200).nullable(), status: z.enum(['draft','published','archived']) });

/** Import only real source metadata. Never create fabricated inventory or convert UZS to coins implicitly. */
export async function syncTubeProducts() {
 const settings = await getCommerceSettings();
 for (const source of await storage.getAllLessons()) {
  const lesson = publishedLesson(source);
  if (!lesson || source.status === 'archived') continue;
  const free = settings.demoLessonId === source.id;
  await pool.query(`INSERT INTO platform_products(id,provider,source_id,kind,title,description,thumbnail_url,level,price_coins,demo_ref,source_version,status)
   VALUES($1,'tube',$2,'tube',$3,$4,$5,$6,$7,$2,$8,'published')
   ON CONFLICT(provider,source_id) DO UPDATE SET title=excluded.title,description=excluded.description,thumbnail_url=excluded.thumbnail_url,level=excluded.level,price_coins=excluded.price_coins,source_version=excluded.source_version,updated_at=now()`,
   ['tube-' + source.id, String(source.id), lesson.title, lesson.description || '', lesson.thumbnailUrl, cefrLevel(lesson.level), free ? 0 : lessonPrice(settings, source.id), String(lesson.contentVersion)]);
 }
}
async function tubeCatalog(req: any) {
 const sources = await storage.getAllLessons();const valid = sources.filter(s => s.status !== 'archived' && publishedLesson(s));
 const ids = valid.map(s => 'tube-' + s.id);
 if (!ids.length) return [];
 const rows = await pool.query("SELECT * FROM platform_products WHERE provider='tube' AND status='published' AND id=ANY($1::varchar[])", [ids]);
 return Promise.all(rows.rows.map(async p => { const lesson = valid.find(s => String(s.id) === p.source_id)!; const card = await catalogCard(req, lesson); return { ...dto(p), owned: card.access === 'owned' || card.access === 'admin', access: card.access }; }));
}
async function product(id: string) { const r = await pool.query('SELECT * FROM platform_products WHERE id=$1', [id]); return r.rows[0]; }

export async function buyProduct(userId: string, id: string, requestKey: string, expectedPrice?: number) {
 await grantWelcomeBonus(userId);
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  const user = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
  if (!user || !user.is_active || user.role !== 'student' || !(user.email_verified || user.google_id || user.telegram_id)) problem(403,'Faol o‘quvchi hisobi kerak');
  const prior = (await client.query('SELECT * FROM platform_orders WHERE user_id=$1 AND request_key=$2', [userId,requestKey])).rows[0];
  if (prior) { if(prior.product_id!==id)problem(409,'Xarid kaliti boshqa mahsulot uchun ishlatilgan'); await client.query('COMMIT');return prior; }
  const p = (await client.query("SELECT * FROM platform_products WHERE id=$1 AND status='published' FOR SHARE", [id])).rows[0];
  if (!p || !p.demo_ref) problem(404,'Mahsulot sotuvda mavjud emas');
  if(expectedPrice!==undefined&&expectedPrice!==p.price_coins)problem(409,'Narx yangilangan. Mahsulot sahifasini qayta oching');
  const active = (await client.query("SELECT * FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND (status='pending' OR (status='active' AND (expires_at IS NULL OR expires_at>now()))) ORDER BY created_at DESC LIMIT 1", [userId,id])).rows[0];
  if(active){await client.query('COMMIT');return active;}
  if(p.provider==='tube'){
   const source=(await client.query('SELECT * FROM lessons WHERE id=$1',[Number(p.source_id)])).rows[0];
   if(!source||source.status==='archived'||(!source.published_snapshot&&source.status!=='published'))problem(404,'Dars nashrda mavjud emas');
   const owned=(await client.query('SELECT * FROM lesson_access WHERE user_id=$1 AND lesson_id=$2',[userId,Number(p.source_id)])).rows[0];
   if(owned?.revoked_at)problem(403,'Kirish admin tomonidan to‘xtatilgan');
   if(owned&&(!owned.expires_at||new Date(owned.expires_at)>new Date())){await client.query('COMMIT');return {status:'active',product_id:id,alreadyOwned:true};}
  }else{
   const config=providerConfig[p.provider as keyof typeof providerConfig];
   if(!config||!process.env[config.env])problem(503,'Mahsulot manbasi hali ulanmagan');
  }
  if(user.coins<p.price_coins)problem(402,'Coin yetarli emas. Hamyonni to‘ldiring');
  const lots=(await client.query("SELECT * FROM coin_grants WHERE user_id=$1 ORDER BY CASE source WHEN 'bonus' THEN 0 WHEN 'legacy' THEN 1 WHEN 'adjustment' THEN 2 ELSE 3 END,created_at,id FOR UPDATE",[userId])).rows;
  if(lots.reduce((n,l)=>n+l.remaining,0)!==user.coins)problem(409,'Hamyon tarixi mos emas. Adminga murojaat qiling');
  let remaining=p.price_coins;const allocations=[];
  for(const lot of lots){if(!remaining)break;const amount=Math.min(lot.remaining,remaining);if(!amount)continue;await client.query('UPDATE coin_grants SET remaining=remaining-$1 WHERE id=$2',[amount,lot.id]);allocations.push({grantId:lot.id,amount,source:lot.source});remaining-=amount;}
  if(remaining)problem(409,'Coin manbalari mos emas');
  const orderId=randomUUID();const policy={...dto(p),fullName:user.full_name,version:1};
  const native=p.provider==='tube';const expiry=native&&p.duration_days?new Date(Date.now()+p.duration_days*86400000):null;
  const transaction=(await client.query(`INSERT INTO coin_transactions(user_id,amount,type,description,idempotency_key,order_id,balance_before,balance_after,metadata)
   VALUES($1,$2,'product_purchase',$3,$4,$5,$6,$7,$8) RETURNING id`,[userId,-p.price_coins,'Xarid: '+p.title,'platform-purchase:'+orderId,orderId,user.coins,user.coins-p.price_coins,JSON.stringify({allocations,productId:id})])).rows[0];
  await client.query('UPDATE users SET coins=coins-$1,updated_at=now() WHERE id=$2',[p.price_coins,userId]);
  const order=(await client.query(`INSERT INTO platform_orders(id,user_id,product_id,request_key,status,price_coins,policy,transaction_id,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[orderId,userId,id,requestKey,native?'active':'pending',p.price_coins,JSON.stringify(policy),transaction.id,expiry])).rows[0];
  if(native)await client.query(`INSERT INTO lesson_access(user_id,lesson_id,source,price_coins,purchase_transaction_id,expires_at)
   VALUES($1,$2,'marketplace',$3,$4,$5) ON CONFLICT(user_id,lesson_id) DO UPDATE SET source='marketplace',price_coins=excluded.price_coins,purchase_transaction_id=excluded.purchase_transaction_id,expires_at=excluded.expires_at`,[userId,Number(p.source_id),p.price_coins,transaction.id,expiry]);
  await client.query("INSERT INTO commerce_audit(user_id,action,reference_id,idempotency_key,details) VALUES($1,'product_purchase',$2,$3,$4)",[userId,orderId,'platform-purchase:'+orderId,JSON.stringify({productId:id,priceCoins:p.price_coins})]);
  await client.query('COMMIT');return order;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

/** Central admin actions are serialized on the same wallet row as every debit. */
export async function managePlatformOrder(actorId:string,id:string,input:{action:'extend'|'revoke'|'refund';days?:number;reason:string}) {
 const client=await pool.connect();
 try{await client.query('BEGIN');
  const summary=(await client.query('SELECT user_id FROM platform_orders WHERE id=$1',[id])).rows[0];if(!summary)problem(404,'Xarid topilmadi');
  const user=(await client.query('SELECT coins FROM users WHERE id=$1 FOR UPDATE',[summary.user_id])).rows[0];
  const order=(await client.query('SELECT * FROM platform_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(order.policy.provider!=='tube')problem(409,'Manba ruxsatini boshqarish adapteri hali yoqilmagan');
  if(order.status==='refunded'){if(input.action==='refund'){await client.query('COMMIT');return {success:true,alreadyApplied:true};}problem(409,'Qaytarilgan xaridni o‘zgartirib bo‘lmaydi');}
  if(input.action==='extend'){
   if(order.status!=='active')problem(409,'Faqat faol xarid uzaytiriladi');if(!input.days)problem(400,'Kunlar soni kerak');
   const expires=new Date(Math.max(Date.now(),order.expires_at?new Date(order.expires_at).getTime():Date.now())+input.days!*86400000);
   await client.query('UPDATE platform_orders SET expires_at=$2,updated_at=now() WHERE id=$1',[id,expires]);
   const changed=await client.query('UPDATE lesson_access SET expires_at=$3 WHERE user_id=$1 AND lesson_id=$2 AND purchase_transaction_id=$4 AND revoked_at IS NULL',[order.user_id,Number(order.policy.sourceId),expires,order.transaction_id]);if(!changed.rowCount)problem(409,'Bu kirish keyingi xarid bilan almashtirilgan yoki bekor qilingan');
  }else{
   await client.query('UPDATE lesson_access SET revoked_at=now() WHERE user_id=$1 AND lesson_id=$2 AND purchase_transaction_id=$3',[order.user_id,Number(order.policy.sourceId),order.transaction_id]);
   if(input.action==='refund'){
    const transaction=(await client.query('SELECT metadata FROM coin_transactions WHERE id=$1',[order.transaction_id])).rows[0];
    for(const allocation of transaction?.metadata?.allocations||[])await client.query('UPDATE coin_grants SET remaining=remaining+$1 WHERE id=$2 AND user_id=$3',[allocation.amount,allocation.grantId,order.user_id]);
    await client.query('UPDATE users SET coins=coins+$1,updated_at=now() WHERE id=$2',[order.price_coins,order.user_id]);
    await client.query("INSERT INTO coin_transactions(user_id,amount,type,description,idempotency_key,order_id,balance_before,balance_after,metadata) VALUES($1,$2,'product_refund',$3,$4,$5,$6,$7,$8)",[order.user_id,order.price_coins,'Xarid coinlari qaytarildi: '+order.policy.title,'platform-refund:'+id,id,user.coins,user.coins+order.price_coins,JSON.stringify({originalTransactionId:order.transaction_id})]);
   }
   await client.query('UPDATE platform_orders SET status=$2,updated_at=now() WHERE id=$1',[id,input.action==='refund'?'refunded':'revoked']);
  }
  await client.query('INSERT INTO commerce_audit(actor_id,user_id,action,reference_id,details) VALUES($1,$2,$3,$4,$5)',[actorId,order.user_id,'platform_'+input.action,id,JSON.stringify(input)]);
  await client.query('COMMIT');return {success:true};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export async function provisionOrder(id: string) {
 const order=(await pool.query("UPDATE platform_orders SET locked_until=now()+interval '45 seconds',delivery_attempts=delivery_attempts+1 WHERE id=$1 AND status='pending' AND (locked_until IS NULL OR locked_until<now()) RETURNING *",[id])).rows[0];
 if(!order)return;
 const p=order.policy;
 try{
  const result=await providerRequest(p.provider,'grants',{orderId:id,externalUserId:order.user_id,fullName:p.fullName,sourceId:p.sourceId,kind:p.kind,durationDays:p.durationDays,maxAttempts:p.maxAttempts,sourceVersion:p.sourceVersion});
  if(result.orderId!==id||!result.active)throw new Error('Ruxsat tasdig‘i mos emas');
  await pool.query("UPDATE platform_orders SET status='active',source_result=$2,expires_at=$3,locked_until=NULL,error=NULL,updated_at=now() WHERE id=$1 AND status='pending'",[id,JSON.stringify(result),result.expiresAt||null]);
 }catch{
  await pool.query("UPDATE platform_orders SET locked_until=NULL,error=$2,next_try_at=now()+interval '1 minute',updated_at=now() WHERE id=$1 AND status='pending'",[id,'Manba bilan tasdiqlash kutilmoqda']);
 }
}

export function registerMarketplace(app: Express, http: Server) {
 app.get('/api/platform/catalog',async(req,res,next)=>{
  try{await syncTubeProducts();const native=await tubeCatalog(req);const other=(await pool.query("SELECT * FROM platform_products WHERE provider<>'tube' AND status='published' ORDER BY updated_at DESC")).rows.map(dto);res.json({products:[...native,...other]});}catch(error){next(error)}
 });
 app.get('/api/platform/products/:id',async(req,res,next)=>{
  try{await syncTubeProducts();const p=await product(String(req.params.id));if(!p||p.status!=='published')return res.status(404).json({message:'Mahsulot topilmadi'});let owned=false;if(p.provider==='tube'){const source=await storage.getLessonById(Number(p.source_id));if(!source||!publishedLesson(source)||source.status==='archived')return res.status(404).json({message:'Mahsulot topilmadi'});const card=await catalogCard(req,source);owned=card.access==='owned'||card.access==='admin';}else if(req.session.userId){owned=!!(await pool.query("SELECT 1 FROM platform_orders WHERE user_id=$1 AND product_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at>now())",[req.session.userId,p.id])).rowCount;}res.json({...dto(p),owned});}catch(error){next(error)}
 });
 app.get('/api/platform/products/:id/demo',async(req,res,next)=>{
  try{const p=await product(String(req.params.id));if(!p||p.status!=='published'||!p.demo_ref)return res.status(404).json({message:'Demo mavjud emas'});if(p.provider!=='tube')return res.json(await providerRequest(p.provider,'products/'+encodeURIComponent(p.source_id)+'/demo'));
   const source=await storage.getLessonById(Number(p.source_id));const lesson=source&&source.status!=='archived'&&publishedLesson(source);if(!lesson)return res.status(404).json({message:'Demo mavjud emas'});
   const segments=lessonSegments(lesson).filter(s=>s.start!==null&&s.start<30).slice(0,3).map(s=>({id:s.id,text:s.text,translation:s.translation,start:s.start,end:Math.min(s.end||30,30)}));
   res.json({kind:'video',title:lesson.title,youtubeId:youtubeId(lesson.youtubeUrl),endSeconds:30,segments});
  }catch(error){next(error)}
 });
 app.post('/api/platform/products/:id/purchase',requireAuth,async(req,res,next)=>{
  try{const key=z.string().uuid().parse(req.body?.requestKey);const expectedPrice=z.number().int().min(0).parse(req.body?.expectedPrice);const order=await buyProduct(req.session.userId!,String(req.params.id),key,expectedPrice);if(order.status==='pending')await provisionOrder(order.id);const current=order.id?(await pool.query('SELECT * FROM platform_orders WHERE id=$1 AND user_id=$2',[order.id,req.session.userId])).rows[0]:order;res.json(current);}catch(error){next(error)}
 });
 app.get('/api/platform/library',requireAuth,async(req,res,next)=>{
  try{await syncTubeProducts();const orders=(await pool.query('SELECT * FROM platform_orders WHERE user_id=$1 ORDER BY created_at DESC',[req.session.userId])).rows;const native=await tubeCatalog(req);const progress=(await pool.query('SELECT lesson_id,completion_percent FROM lesson_progress WHERE user_id=$1',[req.session.userId])).rows;
   const products=native.filter(p=>p.owned).map(p=>({...p,completionPercent:progress.find(r=>String(r.lesson_id)===p.sourceId)?.completion_percent||0,expiresAt:orders.find(o=>o.product_id===p.id&&o.status==='active')?.expires_at||null}));
   for(const o of orders.filter(o=>o.policy.provider==='tube'&&!products.some(p=>p.id===o.product_id))) products.push({...o.policy,id:o.product_id,owned:o.status==='active',orderId:o.id,orderStatus:o.status,expiresAt:o.expires_at,completionPercent:progress.find(r=>String(r.lesson_id)===o.policy.sourceId)?.completion_percent||0} as any);
   for(const o of orders.filter(o=>o.policy.provider!=='tube'))products.push({...o.policy,id:o.product_id,owned:o.status==='active'&&(!o.expires_at||new Date(o.expires_at)>new Date()),orderId:o.id,orderStatus:o.status,expiresAt:o.expires_at} as any);
   res.json({products,orders:orders.map(o=>({id:o.id,productId:o.product_id,title:o.policy.title,status:o.status,expiresAt:o.expires_at,createdAt:o.created_at,error:o.error}))});
  }catch(error){next(error)}
 });
 app.get('/api/platform/admin/products',requireAdmin,async(_req,res,next)=>{try{await syncTubeProducts();res.json({products:(await pool.query('SELECT * FROM platform_products ORDER BY updated_at DESC')).rows.map(dto),providers:Object.entries(providerConfig).map(([id,p])=>({id,configured:!!process.env[p.env]}))});}catch(error){next(error)}});
 app.patch('/api/platform/admin/products/:id',requireAdmin,async(req,res,next)=>{
  try{const p=await product(String(req.params.id));if(!p)return res.status(404).json({message:'Mahsulot topilmadi'});const v=offerInput.parse(req.body);if(p.provider==='tube'&&v.maxAttempts!==null)return res.status(400).json({message:'Tube Mentor darslari uchun urinish limiti qo‘llanmaydi'});if(v.status==='published'&&!v.demoRef)return res.status(400).json({message:'Savdo uchun demo kerak'});if(p.provider!=='tube'&&v.status==='published')await providerRequest(p.provider,'products/'+encodeURIComponent(p.source_id)+'/demo');
   if(p.provider==='tube'){const settings=await getCommerceSettings();settings.lessonPrices[p.source_id]=v.priceCoins;await pool.query("INSERT INTO system_settings(key,value) VALUES('commerce',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify(settings)]);}
   await pool.query('UPDATE platform_products SET title=$2,description=$3,price_coins=$4,duration_days=$5,max_attempts=$6,demo_ref=$7,status=$8,updated_at=now() WHERE id=$1',[p.id,v.title,v.description,v.priceCoins,v.durationDays,v.maxAttempts,v.demoRef,v.status]);
   await pool.query("INSERT INTO commerce_audit(actor_id,action,reference_id,details) VALUES($1,'product_updated',$2,$3)",[req.session.userId,p.id,JSON.stringify(v)]);res.json(dto(await product(p.id)));
  }catch(error){next(error)}
 });
 app.get('/api/platform/admin/orders',requireAdmin,async(_req,res,next)=>{try{res.json((await pool.query('SELECT id,user_id,product_id,status,price_coins,policy,expires_at,error,created_at FROM platform_orders ORDER BY created_at DESC LIMIT 200')).rows);}catch(error){next(error)}});
 app.post('/api/platform/admin/orders/:id/manage',requireAdmin,async(req,res,next)=>{try{const input=z.object({action:z.enum(['extend','revoke','refund']),days:z.number().int().min(1).max(3650).optional(),reason:z.string().trim().min(5).max(1000)}).strict().parse(req.body);res.json(await managePlatformOrder(req.session.userId!,z.string().uuid().parse(req.params.id),input));}catch(error){next(error)}});
 app.post('/api/platform/admin/orders/:id/retry',requireAdmin,async(req,res,next)=>{try{await provisionOrder(z.string().uuid().parse(req.params.id));res.json({success:true});}catch(error){next(error)}});
 if(process.env.NODE_ENV==='production'){
  const timer=setInterval(async()=>{try{const orders=await pool.query("SELECT id FROM platform_orders WHERE status='pending' AND next_try_at<=now() AND (locked_until IS NULL OR locked_until<now()) LIMIT 10");for(const o of orders.rows)await provisionOrder(o.id);}catch{console.error('Marketplace delivery reconciliation failed');}},15000);timer.unref();http.once('close',()=>clearInterval(timer));
 }
}
