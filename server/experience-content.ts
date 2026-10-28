import {createHash} from 'node:crypto';
import type {Lesson} from '../shared/schema';
import {youtubeId} from '../shared/learning';
import {experienceSchema,type Experience,sentenceArabic,sentenceUzbek} from '../shared/experience';
import bundled from './curated/parvoz-v1.json';
let checked:Experience|undefined;
export function experienceFor(lesson:Pick<Lesson,'id'|'youtubeUrl'|'aiMetaJson'>):Experience|null{
 const custom=(lesson.aiMetaJson as any)?.experience;
 if(custom){const result=experienceSchema.safeParse(custom);if(!result.success)return null;const p=result.data;if(p.lessonId!==lesson.id||p.youtubeId!==youtubeId(lesson.youtubeUrl))return null;return {...p,version:p.version.slice(0,55)+'-'+createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0,20)}}
 return lesson.id===50&&youtubeId(lesson.youtubeUrl)==='MDZFbSmIFRM'?(checked??=experienceSchema.parse(bundled)):null;
}
export function wordById(p:Experience,id:string){const w=p.words.find(w=>w.id===id);if(w)return w;for(const s of p.segments)for(const g of s.groups){const t=g.tokens.find(t=>t.id===id);if(t)return p.words.find(w=>w.lemma&&w.lemma===t.lemma&&w.meaning===t.meaning)||{id:t.id,word:t.text,meaning:t.meaning,partOfSpeech:t.partOfSpeech,lemma:t.lemma,root:t.root,segmentId:s.id,grammar:s.grammar}}return null}
export function withContext(p:Experience,w:NonNullable<ReturnType<typeof wordById>>){const s=p.segments.find(s=>s.id===w.segmentId)!;return{...w,example:sentenceArabic(s),exampleTranslation:sentenceUzbek(s)}}
