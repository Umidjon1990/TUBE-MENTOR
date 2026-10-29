import {useMemo,useState} from 'react';
import {Volume2} from 'lucide-react';
import {sentenceArabic,sentenceUzbek} from '@shared/experience';
import type {Package} from './types';

export function Introduction({p,hear,openWord,start}:{p:Package;hear:(id:string)=>void;openWord:(word:any)=>void;start:()=>void}){
 const [query,Q]=useState('');
 const words=useMemo(()=>{
  const all=new Map<string,any>();
  for(const segment of p.segments)for(const group of segment.groups)for(const token of group.tokens){
   const key=token.text+'\0'+token.meaning;
   if(!all.has(key))all.set(key,{...token,word:token.text,segment,group});
  }
  return [...all.values()];
 },[p.segments]);
 const normalize=(value:string)=>value.normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g,'').toLocaleLowerCase();
 const filtered=words.filter(w=>normalize(w.word+' '+w.meaning+' '+(w.lemma||'')).includes(normalize(query)));
 return <section className="xp-panel xp-introduction">
  <h2>Tanishuv</h2><p>Har bir gapni alohida tinglang, tarjimasi va barcha so‘zlarining ma’nosi bilan tanishing.</p>
  <div className="xp-intro-sentences">{p.segments.map((s,i)=><article key={s.id} className="xp-intro-sentence">
   <div className="xp-row"><span className="xp-tag">GAP {i+1}</span><button className="xp-button secondary" aria-label={`${i+1}-gapni tinglash`} onClick={()=>hear(s.id)}><Volume2 size={17}/>Tinglash</button></div>
   <p className="xp-arabic" dir="rtl" lang="ar">{sentenceArabic(s)}</p><p lang="uz">{sentenceUzbek(s)}</p>
   <details><summary>So‘zma-so‘z tarjima</summary><div className="xp-literal" dir="rtl">{s.groups.flatMap(g=>g.tokens.map(t=><button key={t.id} onClick={()=>openWord({...t,word:t.text,segment:s,group:g})}><span className="xp-arabic" lang="ar">{t.text}</span><span dir="ltr" lang="uz">{t.meaning}</span></button>))}</div></details>
  </article>)}</div>
  <h2>Barcha so‘zlar lug‘ati</h2><label className="xp-glossary-search">So‘z yoki tarjimasini qidirish<input type="search" value={query} onChange={e=>Q(e.target.value)} placeholder="Arabcha yoki o‘zbekcha…"/></label>
  <p className="xp-small">{filtered.length} / {words.length} ta so‘z va ma’no</p><div className="xp-literal">{filtered.map(w=><button key={w.id} onClick={()=>openWord(w)}><span className="xp-arabic" dir="rtl" lang="ar">{w.word}</span><span>{w.meaning}</span></button>)}</div>{!filtered.length&&<p>So‘z topilmadi.</p>}
  <button className="xp-button" onClick={start}>Ko‘r va tingla →</button>
 </section>;
}
