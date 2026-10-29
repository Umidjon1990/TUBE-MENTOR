import express,{type Express} from 'express';
import {createHash,timingSafeEqual} from 'node:crypto';
import {and,eq,gte,lte,asc,desc,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from './db';
import {users,paymentOrders,coinGrants,coinTransactions,commerceAudit,paymeInvoices,paymeTransactions} from '../shared/schema';
import {requireAdmin,requireAuth} from './auth';
import {applyCredit,reconcileLots,getCommerceSettings} from './commerce';
import {paymeConfig,paymeCheckout} from './payme-config';
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Payment=typeof paymeTransactions.$inferSelect;
const TTL=43200000;
class RpcError extends Error{constructor(public code:number,message:string,public data?:string){super(message)}}
const fail=(code:number,message:string,data?:string):never=>{throw new RpcError(code,message,data)};
const error=(code:number,message:string,data?:string)=>({error:{code,message:{uz:message,ru:message,en:message},...(data?{data}:{})}});
const paymentId=z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const amount=z.number().int().positive().safe();
function checkResult(t:Payment){return{create_time:t.createTime,perform_time:t.performTime,cancel_time:t.cancelTime,transaction:t.key,state:t.state,reason:t.reason}}
function created(t:Payment){return{create_time:t.createTime,transaction:t.key,state:t.state}}
function performed(t:Payment){return{perform_time:t.performTime,transaction:t.key,state:t.state}}
function cancelled(t:Payment){return{cancel_time:t.cancelTime,transaction:t.key,state:t.state}}
async function serialize(tx:Tx){await tx.execute(sql`SELECT pg_advisory_xact_lock(726309)`)}
async function expire(tx:Tx,t:Payment){if(t.state===1&&Date.now()-t.time>=TTL){const [updated]=await tx.update(paymeTransactions).set({state:-1,reason:4,cancelTime:Date.now()}).where(eq(paymeTransactions.key,t.key)).returning();return updated}return t}
function accountId(p:any){const id=p?.account?.order_id;if((typeof id!=='string'&&typeof id!=='number')||!/^\d{1,10}$/.test(String(id))||!Number.isSafeInteger(Number(id))||Number(id)<1)fail(-31050,'Buyurtma raqami noto‘g‘ri','order_id');return Number(id)}
async function invoice(tx:Tx,p:any,mode:string){const id=accountId(p);const [inv]=await tx.select().from(paymeInvoices).where(and(eq(paymeInvoices.id,id),eq(paymeInvoices.mode,mode))).for('update');if(!inv)fail(-31050,'Buyurtma topilmadi','order_id');if(!Number.isSafeInteger(p.amount)||p.amount<=0||p.amount!==inv.amount)fail(-31001,'To‘lov summasi noto‘g‘ri');return inv}
async function payable(tx:Tx,inv:typeof paymeInvoices.$inferSelect){
 if(inv.mode==='test'){if(Date.now()-inv.createdAt.getTime()>=TTL)fail(-31050,'Sinov hisobi eskirgan','order_id');return null}
 const [o]=await tx.select().from(paymentOrders).where(eq(paymentOrders.id,inv.orderId!)).for('update');
 if(!o||o.status!=='awaiting_payment'||o.expiresAt.getTime()<=Date.now()||o.priceUzs*100!==inv.amount||o.instructions.provider!=='payme')fail(-31050,'Buyurtma to‘lov uchun ochiq emas','order_id');
 const [u]=await tx.select().from(users).where(eq(users.id,o.userId)).for('update');
 if(!u?.isActive||u.role!=='student')fail(-31050,'Foydalanuvchi hisobi faol emas','order_id');
 if(!Number.isSafeInteger(u.coins+o.coins)||u.coins+o.coins>2147483647)fail(-31050,'Balans chegarasi oshib ketadi','order_id');
 await reconcileLots(tx,u);return{o,u};
}
async function audit(tx:Tx,action:string,referenceId:string,details:Record<string,unknown>){await tx.insert(commerceAudit).values({action,referenceId,details})}
export async function paymeRpc(method:string,p:any){
 const c=paymeConfig(),mode=c.mode;
 return db.transaction(async tx=>{
  await serialize(tx);
  if(method==='CheckPerformTransaction'||method==='CreateTransaction'){
   const inv=await invoice(tx,p,mode);
   if(method==='CreateTransaction'){
    const id=paymentId.parse(p.id),time=amount.parse(p.time),key=mode+':'+id;
    const [old]=await tx.select().from(paymeTransactions).where(eq(paymeTransactions.key,key)).for('update');
    if(old){if(old.invoiceId!==inv.id||old.amount!==inv.amount||old.time!==time)fail(-31008,'Tranzaksiya rekvizitlari mos emas');const t=await expire(tx,old);return t.state===1?{result:created(t)}:error(-31008,'Tranzaksiyani yaratib bo‘lmaydi')}
    if(mode==='live'&&!c.liveReady)fail(-31008,'Yangi Payme to‘lovlari vaqtincha yopiq');
    if(Date.now()-time>=TTL||time>Date.now()+300000)fail(-31008,'Tranzaksiya vaqti noto‘g‘ri');
    await payable(tx,inv);
    const active=await tx.select().from(paymeTransactions).where(eq(paymeTransactions.invoiceId,inv.id));
    for(const old of active){const t=await expire(tx,old);if(t.state===1||t.state===2)fail(-31050,'Bu hisob uchun to‘lov mavjud','order_id')}
    const [t]=await tx.insert(paymeTransactions).values({key,id,mode,invoiceId:inv.id,amount:inv.amount,time,createTime:Date.now(),state:1}).returning();
    if(inv.orderId)await tx.update(paymentOrders).set({expiresAt:new Date(Math.max(Date.now()+TTL,time+TTL)),updatedAt:new Date()}).where(eq(paymentOrders.id,inv.orderId));
    await audit(tx,'payme.created',t.key,{invoiceId:inv.id,mode,amount:inv.amount});return{result:created(t)};
   }
   if(mode==='live'&&!c.liveReady)fail(-31008,'Yangi Payme to‘lovlari vaqtincha yopiq');
   await payable(tx,inv);
   const previous=await tx.select().from(paymeTransactions).where(eq(paymeTransactions.invoiceId,inv.id));
   for(const old of previous){const t=await expire(tx,old);if(t.state===1||t.state===2)fail(-31050,'Hisob band yoki allaqachon to‘langan','order_id')}
   const detail=c.fiscalReady?{detail:{receipt_type:0,items:[{title:'Ta’lim platformasi uchun coin paketi',price:inv.amount,count:1,code:c.ikpu,package_code:c.packageCode,vat_percent:c.vat}]}}:{};
   return{result:{allow:true,...detail}};
  }
  if(method==='GetStatement'){
   const from=z.number().int().nonnegative().safe().parse(p.from),to=z.number().int().nonnegative().safe().parse(p.to);if(to<from)fail(-32600,'Davr noto‘g‘ri');
   const rows=await tx.select().from(paymeTransactions).where(and(eq(paymeTransactions.mode,mode),gte(paymeTransactions.time,from),lte(paymeTransactions.time,to))).orderBy(asc(paymeTransactions.time),asc(paymeTransactions.key));
   return{result:{transactions:rows.map(t=>({id:t.id,time:t.time,amount:t.amount,account:{order_id:String(t.invoiceId)},...checkResult(t)}))}};
  }
  if(method==='SetFiscalData'){
   const data=z.object({id:paymentId,type:z.enum(['PERFORM','CANCEL']),fiscal_data:z.object({status_code:z.number().int(),receipt_id:z.union([z.string().max(100),z.number().int()]).optional(),message:z.string().max(2000).optional(),terminal_id:z.string().max(100).optional(),fiscal_sign:z.string().max(100).optional(),qr_code_url:z.string().max(2000).optional(),date:z.string().max(100).optional()})}).safeParse(p);
   if(!data.success)return error(-32602,'Fiskal chek parametrlari noto‘g‘ri');
   const key=mode+':'+data.data.id,[t]=await tx.select().from(paymeTransactions).where(eq(paymeTransactions.key,key)).for('update');if(!t)fail(-32001,'Fiskal chek tranzaksiyasi topilmadi');
   await tx.update(paymeTransactions).set({fiscalData:{...(t.fiscalData as object||{}),[data.data.type==='PERFORM'?'perform':'cancel']:data.data.fiscal_data}}).where(eq(paymeTransactions.key,key));return{result:{success:true}};
  }
  if(!['CheckTransaction','PerformTransaction','CancelTransaction'].includes(method))fail(-32601,'Metod topilmadi',method);
  const id=paymentId.parse(p.id),key=mode+':'+id;
  const [row]=await tx.select().from(paymeTransactions).where(eq(paymeTransactions.key,key)).for('update');if(!row)fail(-31003,'Tranzaksiya topilmadi');
  const t=await expire(tx,row);
  if(method==='CheckTransaction')return{result:checkResult(t)};
  if(method==='PerformTransaction'){
   if(t.state===2)return{result:performed(t)};
   if(t.state!==1)return error(-31008,'Tranzaksiyani bajarib bo‘lmaydi');
   const [inv]=await tx.select().from(paymeInvoices).where(eq(paymeInvoices.id,t.invoiceId)).for('update');
   const paid=await payable(tx,inv);
   if(paid){const{o,u}=paid;await applyCredit(tx,u,o.coins,'payment_credit','payment:'+o.id,o.packageName+': Payme to‘lovi','paid',undefined,o.id,'payme:'+t.id);
    await tx.update(paymentOrders).set({status:'approved',bankReference:'payme:'+t.id,reviewedAt:new Date(),updatedAt:new Date()}).where(eq(paymentOrders.id,o.id));}
   const [done]=await tx.update(paymeTransactions).set({state:2,performTime:Date.now()}).where(eq(paymeTransactions.key,key)).returning();
   await audit(tx,'payme.performed',key,{mode,invoiceId:inv.id,orderId:inv.orderId,amount:t.amount,coins:paid?.o.coins||0});return{result:performed(done)};
  }
  const reason=z.number().int().min(1).max(10).parse(p.reason);
  if(t.state<0)return{result:cancelled(t)};
  if(t.state===2&&mode==='live'){
   const [inv]=await tx.select().from(paymeInvoices).where(eq(paymeInvoices.id,t.invoiceId));
   const [o]=await tx.select().from(paymentOrders).where(eq(paymentOrders.id,inv.orderId!)).for('update');
   const [u]=await tx.select().from(users).where(eq(users.id,o.userId)).for('update');await reconcileLots(tx,u);
   const [grant]=await tx.select().from(coinGrants).where(and(eq(coinGrants.orderId,o.id),eq(coinGrants.source,'paid'))).for('update');
   if(o.status!=='approved'||o.refundedCoins!==0||!grant||grant.remaining!==o.coins||u.coins<o.coins)fail(-31007,'Ushbu paket coinlari sarflangan; to‘liq qaytarish mumkin emas');
   await tx.update(coinGrants).set({remaining:0}).where(eq(coinGrants.id,grant.id));
   await tx.update(users).set({coins:u.coins-o.coins,updatedAt:new Date()}).where(eq(users.id,u.id));
   await tx.insert(coinTransactions).values({userId:u.id,amount:-o.coins,type:'payment_refund',orderId:o.id,bankReference:'payme-cancel:'+t.id,idempotencyKey:'payme-cancel:'+t.id,balanceBefore:u.coins,balanceAfter:u.coins-o.coins,description:'Payme orqali to‘lov qaytarildi',metadata:{refundUzs:o.priceUzs,grantId:grant.id}});
   await tx.update(paymentOrders).set({status:'refunded',refundedCoins:o.coins,updatedAt:new Date()}).where(eq(paymentOrders.id,o.id));
  }
  const [done]=await tx.update(paymeTransactions).set({state:t.state===2?-2:-1,reason,cancelTime:Date.now()}).where(eq(paymeTransactions.key,key)).returning();
  await audit(tx,'payme.cancelled',key,{mode,invoiceId:t.invoiceId,reason,state:done.state});return{result:cancelled(done)};
 });
}

/** This route precedes sessions and the general JSON middleware: Payme uses text/json too. */
export function registerPaymeWebhook(app:Express){
 const path='/api/payme/webhook';
 app.all(path,express.json({limit:'32kb',type:['application/json','text/json','application/*+json'],strict:false}),async(req,res)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  const requestId=typeof req.body?.id==='number'||typeof req.body?.id==='string'?req.body.id:null;
  const send=(r:object)=>res.status(200).json({jsonrpc:'2.0',id:requestId,...r});
  if(req.method!=='POST')return send(error(-32300,'POST so‘rovi talab qilinadi'));
  const c=paymeConfig(),expected='Basic '+Buffer.from('Paycom:'+c.key).toString('base64'),provided=req.get('authorization')||'';
  if(!c.configured||provided.length>2048||!timingSafeEqual(createHash('sha256').update(expected).digest(),createHash('sha256').update(provided).digest()))return send(error(-32504,'Avtorizatsiya xatosi'));
  if(!req.body||Array.isArray(req.body)||requestId===null||typeof req.body.method!=='string'||req.body.method.length>80||!req.body.params||typeof req.body.params!=='object'||Array.isArray(req.body.params))return send(error(-32600,'RPC so‘rovi noto‘g‘ri'));
  try{return send(await paymeRpc(req.body.method,req.body.params))}catch(e){if(e instanceof RpcError)return send(error(e.code,e.message,e.data));if(e instanceof z.ZodError)return send(error(-32600,'So‘rov parametrlari noto‘g‘ri'));console.error('Payme operation failed',e instanceof Error?e.name:'unknown');return send(error(-32400,'Tizim xatosi'))}
 });
 app.use(path,(err:any,_req:any,res:any,next:any)=>{if(!err)return next();res.status(200).json({jsonrpc:'2.0',id:null,...error(err.type==='entity.too.large'?-32600:-32700,'JSON so‘rovi noto‘g‘ri')})});
}
export function registerPaymeRoutes(app:Express){
 const handle=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res)).catch(next);
 app.get('/api/admin/commerce/payme',requireAdmin,handle(async(_req:any,res:any)=>{
  const c=paymeConfig();const transactions=await db.select({id:paymeTransactions.id,mode:paymeTransactions.mode,invoiceId:paymeTransactions.invoiceId,amount:paymeTransactions.amount,state:paymeTransactions.state,time:paymeTransactions.time,performTime:paymeTransactions.performTime,cancelTime:paymeTransactions.cancelTime,reason:paymeTransactions.reason}).from(paymeTransactions).orderBy(desc(paymeTransactions.createTime)).limit(30);
  res.json({mode:c.mode,merchantId:c.merchantId,configured:c.configured,liveReady:c.liveReady,fiscalReady:c.fiscalReady,endpoint:process.env.PAYME_WEBHOOK_URL||new URL('/api/payme/webhook',process.env.APP_URL||'http://localhost').href,transactions});
 }));
 app.post('/api/admin/commerce/payme/test-invoice',requireAdmin,handle(async(req:any,res:any)=>{
  const c=paymeConfig();if(c.mode!=='test'||!c.configured)return res.status(409).json({message:'Avval Payme test kalitini serverga kiriting'});
  const uzs=z.number().int().min(1).max(10000).parse(req.body.amountUzs??1000);
  const [inv]=await db.insert(paymeInvoices).values({mode:'test',amount:uzs*100}).returning();
  await db.insert(commerceAudit).values({actorId:req.session.userId,action:'payme.test_invoice',referenceId:String(inv.id),details:{amount:inv.amount}});
  res.status(201).json({invoiceId:String(inv.id),amount:inv.amount,checkoutUrl:paymeCheckout(inv.id,inv.amount),sandbox:true});
 }));
 app.post('/api/commerce/orders/:id/payme',requireAuth,handle(async(req:any,res:any)=>{
  const c=paymeConfig();if(!c.liveReady)return res.status(503).json({message:'Payme orqali haqiqiy to‘lov hali yoqilmagan'});
  if(!(await getCommerceSettings()).paymentsEnabled)return res.status(503).json({message:'To‘lovlar vaqtincha yopiq'});
  const id=z.string().uuid().parse(req.params.id);
  const inv=await db.transaction(async tx=>{
   await serialize(tx);
   const [o]=await tx.select().from(paymentOrders).where(and(eq(paymentOrders.id,id),eq(paymentOrders.userId,req.session.userId))).for('update');
   if(!o)throw Object.assign(Error('Buyurtma topilmadi'),{status:404});
   if(o.status!=='awaiting_payment'||o.expiresAt.getTime()<=Date.now())throw Object.assign(Error('Buyurtma to‘lovga yopiq'),{status:409});
   const [existing]=await tx.select().from(paymeInvoices).where(and(eq(paymeInvoices.orderId,id),eq(paymeInvoices.mode,'live')));
   if(existing)return existing;
   await tx.update(paymentOrders).set({instructions:{...o.instructions,provider:'payme'},updatedAt:new Date()}).where(eq(paymentOrders.id,id));
   const [created]=await tx.insert(paymeInvoices).values({orderId:id,mode:'live',amount:o.priceUzs*100}).returning();
   await audit(tx,'payme.checkout',id,{invoiceId:created.id,amount:created.amount});return created;
  });res.json({invoiceId:String(inv.id),checkoutUrl:paymeCheckout(inv.id,inv.amount)});
 }));
}
