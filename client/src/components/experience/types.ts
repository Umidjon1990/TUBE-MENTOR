import type {Experience,Answer,PublicQuestion} from '@shared/experience';
export type {Answer,PublicQuestion};
export type Package=Omit<Experience,'questions'> & {available:true;questions:PublicQuestion[];audioPath:string|null;progress:{tab:number;position:number;seen:string[];completed:string[]}|null};
export type Call=<T=any>(method:string,path:string,body?:unknown)=>Promise<T>;
export interface Feedback{questionId:string;response:Answer;correct:boolean;answer:Answer;explanation:string;segmentId:string;wordId?:string}
export interface Attempt{id:string;phase:string;questions:PublicQuestion[];answers:Feedback[];finished:boolean;score:number|null}
export function shuffled<T>(values:T[]){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
