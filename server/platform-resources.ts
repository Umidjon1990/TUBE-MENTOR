import type {Express} from 'express';
import {z} from 'zod';
import {pool} from './db';
import {requireAuth} from './auth';

export function registerPlatformResources(app:Express){
 app.get('/api/platform/audio/progress',requireAuth,async(req,res,next)=>{try{const rows=(await pool.query('SELECT resource_id,position FROM platform_resource_progress WHERE user_id=$1',[req.session.userId])).rows;res.json({progress:Object.fromEntries(rows.map(r=>[r.resource_id,r.position]))});}catch(error){next(error)}});
 app.post('/api/platform/audio/progress',requireAuth,async(req,res,next)=>{try{const v=z.object({resourceId:z.string().regex(/^lesson-(0[1-9]|[12][0-9]|30)$/),position:z.number().finite().min(0).max(86400),duration:z.number().finite().min(0).max(86400)}).parse(req.body);await pool.query('INSERT INTO platform_resource_progress(user_id,resource_id,position,duration) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,resource_id) DO UPDATE SET position=excluded.position,duration=excluded.duration,updated_at=now()',[req.session.userId,v.resourceId,v.position,v.duration]);res.json({success:true});}catch(error){next(error)}});
 app.get('/api/platform/saved',requireAuth,async(req,res,next)=>{try{res.json({words:(await pool.query('SELECT source_id AS id,arabic,translation,created_at FROM platform_saved_words WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500',[req.session.userId])).rows});}catch(error){next(error)}});
 app.post('/api/platform/saved',requireAuth,async(req,res,next)=>{try{const v=z.object({sourceId:z.string().regex(/^\d+$/).max(20),arabic:z.string().min(1).max(2000),translation:z.string().max(20000)}).parse(req.body);await pool.query('INSERT INTO platform_saved_words(user_id,source_id,arabic,translation) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,source_id) DO UPDATE SET arabic=excluded.arabic,translation=excluded.translation',[req.session.userId,v.sourceId,v.arabic,v.translation]);res.json({success:true});}catch(error){next(error)}});
 app.delete('/api/platform/saved/:id',requireAuth,async(req,res,next)=>{try{const id=z.string().regex(/^\d+$/).parse(req.params.id);await pool.query('DELETE FROM platform_saved_words WHERE user_id=$1 AND source_id=$2',[req.session.userId,id]);res.json({success:true});}catch(error){next(error)}});
}
