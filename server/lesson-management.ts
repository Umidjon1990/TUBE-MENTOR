import type {Express} from 'express';
import {eq,inArray,asc,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from './db';
import {lessons,commerceAudit} from '../shared/schema';
import {publishedLesson} from '../shared/learning';
import {requireAdmin} from './auth';
import {getCommerceSettings} from './commerce';

const selection=z.object({ids:z.array(z.number().int().positive()).min(1).max(100)}).strict();
const action=selection.extend({action:z.enum(['archive','delete']),confirmed:z.literal(true),versions:z.record(z.string())}).strict();
const fail=(status:number,message:string)=>{throw Object.assign(new Error(message),{status})};
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function inspect(tx:Tx,ids:number[]){
 const rows=await tx.select().from(lessons).where(inArray(lessons.id,ids)).orderBy(asc(lessons.id)).for('update');
 if(rows.length!==ids.length)fail(409,'Darslar ro‘yxati o‘zgargan. Sahifani yangilang.');
 const settings=await getCommerceSettings(tx);
 const result=[];
 for(const l of rows){
  const r=await tx.execute(sql`SELECT
   EXISTS(SELECT 1 FROM lesson_access WHERE lesson_id=${l.id}) AS access,
   EXISTS(SELECT 1 FROM coin_transactions WHERE lesson_id=${l.id}) AS coins,
   EXISTS(SELECT 1 FROM commerce_support_tickets WHERE lesson_id=${l.id}) AS support,
   EXISTS(SELECT 1 FROM platform_orders o JOIN platform_products p ON p.id=o.product_id WHERE p.provider='tube' AND p.source_id=${String(l.id)}) AS orders`);
  const refs=r.rows[0];
  const reason=settings.demoLessonId===l.id?'Bu dars bepul namuna sifatida tanlangan. Avval namunaviy darsni almashtiring.':refs.access||refs.coins||refs.orders||refs.support?'Darsga kirish huquqi, moliyaviy tarix yoki murojaat biriktirilgan. Uni arxivlash mumkin.':null;
  result.push({source:l,id:l.id,title:l.title,status:l.status,version:l.updatedAt.toISOString(),deleteBlocked:reason});
 }
 return result;
}
export function registerLessonManagement(app:Express){
 app.post('/api/admin/lesson-actions/preview',requireAdmin,async(req,res,next)=>{try{
  const {ids}=selection.parse(req.body);
  const result=await db.transaction(tx=>inspect(tx,[...new Set(ids)]));
  res.set('Cache-Control','private, no-store').json({lessons:result.map(({source,...row})=>row)});
 }catch(e){next(e)}});
 app.post('/api/admin/lesson-actions',requireAdmin,async(req,res,next)=>{try{
  const b=action.parse(req.body),ids=[...new Set(b.ids)];
  const changed=await db.transaction(async tx=>{
   const rows=await inspect(tx,ids);
   if(rows.some(l=>b.versions[String(l.id)]!==l.version))fail(409,'Dars o‘zgargan. Tasdiqlash oynasini qayta oching.');
   if(b.action==='delete'&&rows.some(l=>l.deleteBlocked))fail(409,rows.filter(l=>l.deleteBlocked).map(l=>l.title+': '+l.deleteBlocked).join('\n'));
   for(const row of rows){
    if(b.action==='archive'){
     const published=publishedLesson(row.source);
     const {publishedSnapshot:_,...snapshot}=published||row.source;
     await tx.update(lessons).set({status:'archived',updatedAt:new Date(),...(published?{publishedSnapshot:row.source.publishedSnapshot||snapshot,publishedAt:row.source.publishedAt||new Date()}: {})}).where(eq(lessons.id,row.id));
    }else await tx.delete(lessons).where(eq(lessons.id,row.id));
    await tx.execute(sql`UPDATE platform_products SET status='archived',updated_at=now() WHERE provider='tube' AND source_id=${String(row.id)}`);
   }
   await tx.insert(commerceAudit).values({actorId:req.session.userId!,action:'lesson.'+b.action,details:{lessons:rows.map(l=>({id:l.id,title:l.title}))}});
   return rows.map(l=>l.id);
  });
  res.json({success:true,ids:changed,action:b.action});
 }catch(e:any){if(e?.code==='23503')return res.status(409).json({message:'Darsga bog‘liq yozuvlar mavjud. O‘chirish o‘rniga arxivlang.'});next(e)}});
}
