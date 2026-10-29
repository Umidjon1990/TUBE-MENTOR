import {experienceFor} from './experience-content';
import {sentenceArabic,sentenceUzbek} from '../shared/experience';
import {controlsMap,defaultControl} from './lesson-controls';
import {lessonPrice} from '../shared/commerce';
import type {Express} from 'express';
import {eq,inArray,asc,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from './db';
import {lessons,commerceAudit,lessonControls,systemSettings} from '../shared/schema';
import {publishedLesson,publicationProblems,lessonSegments,lessonVocabulary} from '../shared/learning';
import {requireAdmin} from './auth';
import {getCommerceSettings} from './commerce';

const selection=z.object({ids:z.array(z.number().int().positive()).min(1).max(100)}).strict();
const action=selection.extend({action:z.enum(['archive','delete','publish','unpublish']),confirmed:z.literal(true),versions:z.record(z.string())}).strict();
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
  result.push({source:l,id:l.id,title:l.title,status:l.status,version:l.updatedAt.toISOString(),hasPublishedVersion:!!publishedLesson(l),deleteBlocked:reason});
 }
 return result;
}
export function registerLessonManagement(app:Express){
 app.get('/api/learn/trial/:id',async(req,res,next)=>{try{
  const id=z.coerce.number().int().positive().parse(req.params.id),source=(await db.select().from(lessons).where(eq(lessons.id,id)))[0],control=(await controlsMap()).get(id);
  if(!source||['archived','unpublished'].includes(source.status)||control?.trialMode!=='preview')return res.status(404).json({message:'Sinov mavjud emas'});
  const l=publishedLesson(source);if(!l)return res.status(404).json({message:'Dars nashr qilinmagan'});
  const xp=experienceFor(l),segments=xp?xp.segments.slice(0,control.previewSegments).map(s=>({id:s.id,text:sentenceArabic(s),translation:sentenceUzbek(s),start:s.start,end:s.end,words:s.groups.flatMap(g=>g.tokens.map(t=>({word:t.text,meaning:t.meaning})))})):lessonSegments(l).slice(0,control.previewSegments).map(s=>({id:s.id,text:s.text,translation:s.translation,start:s.start,end:s.end,words:s.words.map(w=>({word:w.word,meaning:w.meaning||''}))}));
  res.set('Cache-Control','private, no-store').json({id:l.id,title:l.title,level:l.level,youtubeUrl:l.youtubeUrl,segments,priceCoins:lessonPrice(await getCommerceSettings(),id)});
 }catch(e){next(e)}});

 app.get('/api/admin/lessons/:id/controls',requireAdmin,async(req,res,next)=>{try{
  const id=z.coerce.number().int().positive().parse(req.params.id),l=(await db.select().from(lessons).where(eq(lessons.id,id)))[0];if(!l)return res.status(404).json({message:'Dars topilmadi'});
  const c=(await controlsMap()).get(id)||defaultControl(id),settings=await getCommerceSettings();
  const analysis=Array.isArray(l.sentenceAnalysisJson)?l.sentenceAnalysisJson as any[]:[],xp=experienceFor(l);
  res.json({...c,trialMode:settings.demoLessonId===id?'full':c.trialMode,priceCoins:lessonPrice(settings,id),globalDemo:settings.demoLessonId===id,version:l.updatedAt.toISOString(),audit:{interactive:!!xp,segments:xp?.segments.length??lessonSegments(l).length,words:xp?.words.length??lessonVocabulary(l).length,missingGrammar:xp?xp.segments.filter(s=>!s.grammar).length:analysis.filter(s=>!s.grammarNotes?.trim()).length,missingAlignment:xp?0:analysis.filter(s=>!s.alignment?.length).length,problems:xp?[]:publicationProblems(l)}});
 }catch(e){next(e)}});
 app.patch('/api/admin/lessons/:id/controls',requireAdmin,async(req,res,next)=>{try{
  const id=z.coerce.number().int().positive().parse(req.params.id),b=z.object({version:z.string(),priceCoins:z.number().int().min(0).max(100000),dashboardVisible:z.boolean(),sortOrder:z.number().int().min(0).max(100000),trialMode:z.enum(['none','full','preview']),previewSegments:z.number().int().min(1).max(20),levelNote:z.string().max(4000)}).strict().parse(req.body);
  await db.transaction(async tx=>{
   // Keep settings/lesson lock order consistent for concurrent settings saves.
   await tx.insert(systemSettings).values({key:'commerce',value:JSON.stringify(await getCommerceSettings(tx))}).onConflictDoNothing();
   await tx.select().from(systemSettings).where(eq(systemSettings.key,'commerce')).for('update');
   const [l]=await tx.select().from(lessons).where(eq(lessons.id,id)).for('update');if(!l)fail(404,'Dars topilmadi');if(l.updatedAt.toISOString()!==b.version)fail(409,'Dars yangilangan. Sahifani yangilang.');
   const settings=await getCommerceSettings(tx);settings.lessonPrices[String(id)]=b.priceCoins;if(settings.demoLessonId===id)settings.demoLessonId=null;
   await tx.update(systemSettings).set({value:JSON.stringify(settings)}).where(eq(systemSettings.key,'commerce'));
   const {version,priceCoins,...values}=b;
   await tx.insert(lessonControls).values({lessonId:id,...values}).onConflictDoUpdate({target:lessonControls.lessonId,set:{...values,updatedAt:new Date()}});
   await tx.update(lessons).set({updatedAt:new Date()}).where(eq(lessons.id,id));
   const free=b.trialMode==='full'||settings.demoLessonId===id;
   await tx.execute(sql`UPDATE platform_products SET price_coins=${free?0:b.priceCoins},updated_at=now() WHERE provider='tube' AND source_id=${String(id)}`);
   await tx.insert(commerceAudit).values({actorId:req.session.userId!,action:'lesson.controls',referenceId:String(id),details:b});
  });res.json({success:true});
 }catch(e){next(e)}});
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
    if(b.action==='publish'){
     if(row.source.status!=='approved')fail(409,row.title+': avval kontent tekshiruvidan o‘tkazib tasdiqlang.');
     const problems=publicationProblems(row.source);if(problems.length)fail(400,row.title+': '+problems.join('. '));
     const {publishedSnapshot:_,...snapshot}=row.source;
     await tx.update(lessons).set({status:'published',publishedSnapshot:{...snapshot,status:'published'},publishedAt:new Date(),publishedBy:req.session.userId!,updatedAt:new Date()}).where(eq(lessons.id,row.id));
    }else if(b.action==='unpublish'){
     if(!publishedLesson(row.source))fail(409,row.title+': dars nashr qilinmagan.');
     const {publishedSnapshot:_,...snapshot}=publishedLesson(row.source)!;
     await tx.update(lessons).set({status:'unpublished',publishedSnapshot:row.source.publishedSnapshot||snapshot,publishedAt:row.source.publishedAt||new Date(),updatedAt:new Date()}).where(eq(lessons.id,row.id));
    }else if(b.action==='archive'){
     const published=publishedLesson(row.source);
     const {publishedSnapshot:_,...snapshot}=published||row.source;
     await tx.update(lessons).set({status:'archived',updatedAt:new Date(),...(published?{publishedSnapshot:row.source.publishedSnapshot||snapshot,publishedAt:row.source.publishedAt||new Date()}: {})}).where(eq(lessons.id,row.id));
    }else await tx.delete(lessons).where(eq(lessons.id,row.id));
    await tx.execute(sql`UPDATE platform_products SET status=${b.action==='publish'?'published':'archived'},updated_at=now() WHERE provider='tube' AND source_id=${String(row.id)}`);
   }
   await tx.insert(commerceAudit).values({actorId:req.session.userId!,action:'lesson.'+b.action,details:{lessons:rows.map(l=>({id:l.id,title:l.title}))}});
   return rows.map(l=>l.id);
  });
  res.json({success:true,ids:changed,action:b.action});
 }catch(e:any){if(e?.code==='23503')return res.status(409).json({message:'Darsga bog‘liq yozuvlar mavjud. O‘chirish o‘rniga arxivlang.'});next(e)}});
}
