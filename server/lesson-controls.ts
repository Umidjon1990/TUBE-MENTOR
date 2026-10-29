import {db} from './db';
import {lessonControls,type Lesson} from '../shared/schema';
import {publishedLesson} from '../shared/learning';
export type Control=typeof lessonControls.$inferSelect;
export const defaultControl=(id:number)=>({lessonId:id,dashboardVisible:true,sortOrder:0,trialMode:'none',previewSegments:3,levelNote:''});
export async function controlsMap(source:Pick<typeof db,'select'>=db){return new Map((await source.select().from(lessonControls)).map(c=>[c.lessonId,c]));}
export function orderedVisible<T extends {id:number}>(rows:T[],controls:Map<number,Control>,includeHidden=false){return rows.filter(l=>includeHidden||controls.get(l.id)?.dashboardVisible!==false).sort((a,b)=>(controls.get(a.id)?.sortOrder||0)-(controls.get(b.id)?.sortOrder||0)||b.id-a.id);}
export function retired(l:Pick<Lesson,'status'>){return ['archived','unpublished'].includes(l.status)}
export function trialAvailable(l:Lesson,c:Control|undefined){return !retired(l)&&!!publishedLesson(l)&&c?.trialMode==='full'}
