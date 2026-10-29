import {useRef} from 'react';
import {useParams,Link} from 'wouter';
import {useQuery} from '@tanstack/react-query';
import {LearningVideo,type VideoHandle} from '@/components/learning-video';
import {request,errorText} from '@/lib/learning-api';
import '@/components/experience/style.css';
type Trial={id:number;title:string;level:string;youtubeUrl:string;priceCoins:number;segments:{id:string;text:string;translation:string;start:number;end:number;words:{word:string;meaning:string}[]}[]};
export default function TrialPage(){
 const {id}=useParams<{id:string}>(),player=useRef<VideoHandle>(null),q=useQuery<Trial>({queryKey:['lesson-trial',id],queryFn:()=>request('GET','/api/learn/trial/'+id)});
 return <main className="xp-learning"><Link href="/courses">← Darslarga qaytish</Link>{q.error&&<p role="alert">{errorText(q.error)}</p>}{q.data?<><h1>{q.data.title}</h1><p>Bepul sinov · {q.data.segments.length} ta dastlabki gap · {q.data.level}</p><LearningVideo ref={player} url={q.data.youtubeUrl} segments={[]} position={0} onProgress={()=>{}} onSegment={()=>{}}/>{q.data.segments.map((s,i)=><article className="xp-panel" key={s.id}><div className="xp-row"><span>GAP {i+1}</span><button className="xp-button secondary" onClick={()=>player.current?.seek(s.start,s.end)}>Gapni tinglash</button></div><p className="xp-arabic" dir="rtl" lang="ar">{s.text}</p><p>{s.translation}</p><details><summary>So‘zma-so‘z tarjima</summary><div className="xp-literal">{s.words.map((w,n)=><div key={n}><span className="xp-arabic" dir="rtl">{w.word}</span><p>{w.meaning}</p></div>)}</div></details></article>)}<section className="xp-panel"><h2>To‘liq darsni davom ettirish</h2><p>To‘liq tarjima, lug‘at, kartalar va mashqlar dars ichida.</p><Link href={'/learn/'+id}>Darsni ochish · {q.data.priceCoins} coin →</Link></section></>:!q.error&&<p>Yuklanmoqda…</p>}</main>;
}
