import {useEffect,useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {request,errorText} from '@/lib/learning-api';
import {Panel} from '@/components/learning-shell';
type Controls={version:string;priceCoins:number;globalDemo:boolean;dashboardVisible:boolean;sortOrder:number;trialMode:'none'|'full'|'preview';previewSegments:number;levelNote:string;audit:{interactive?:boolean;segments:number;words:number;missingGrammar:number;missingAlignment:number;problems:string[]}};
export function LessonControlPanel({id}:{id:number}){
 const cache=useQueryClient(),q=useQuery<Controls>({queryKey:['lesson-controls',id],queryFn:()=>request('GET',`/api/admin/lessons/${id}/controls`)}),[form,F]=useState<Controls|null>(null),[saved,S]=useState(false);
 useEffect(()=>{if(q.data)F(q.data)},[q.data]);
 const save=useMutation({mutationFn:()=>{const {version,priceCoins,dashboardVisible,sortOrder,trialMode,previewSegments,levelNote}=form!;return request('PATCH',`/api/admin/lessons/${id}/controls`,{version,priceCoins,dashboardVisible,sortOrder,trialMode,previewSegments,levelNote})},onSuccess:()=>{S(true);void cache.invalidateQueries()}});
 const change=(key:keyof Controls,value:any)=>{S(false);F(v=>v?{...v,[key]:value}:v)};
 return <Panel><h2>Dars boshqaruvi</h2>{q.error&&<p role="alert">{errorText(q.error)}</p>}{form?<form onSubmit={e=>{e.preventDefault();save.mutate()}}><div className="catalog-filters">
 <label className="field-label">Dars narxi (coin)<input type="number" min={0} max={100000} required value={form.priceCoins} onChange={e=>change('priceCoins',Number(e.target.value))}/><small>0 — bepul. Oldingi xaridlar saqlanadi.</small></label>
 <label className="field-label">Dashboarddagi tartib<input type="number" min={0} max={100000} required value={form.sortOrder} onChange={e=>change('sortOrder',Number(e.target.value))}/><small>Kichik raqam oldin chiqadi.</small></label>
 <label className="field-label">Sinov rejimi<select value={form.trialMode} onChange={e=>change('trialMode',e.target.value)}><option value="none">Sinov yopiq</option><option value="full">To‘liq bepul sinov</option><option value="preview">Faqat dastlabki gaplar</option></select></label>
 {form.trialMode==='preview'&&<label className="field-label">Sinovdagi gaplar soni<input type="number" min={1} max={20} required value={form.previewSegments} onChange={e=>change('previewSegments',Number(e.target.value))}/><a href={'/trial/'+id} target="_blank" rel="noreferrer">Sinovni ko‘rish →</a></label>}
 </div><label className="consent-row"><input type="checkbox" checked={form.dashboardVisible} onChange={e=>change('dashboardVisible',e.target.checked)}/>Umumiy dashboard va katalogda ko‘rsatish</label>
 {form.globalDemo&&<p>Bu dars avval umumiy bepul namuna sifatida tanlangan. Saqlaganda shu sahifadagi sinov rejimiga o‘tkaziladi; tanlangan bepul kirish saqlanadi.</p>}
 <label className="field-label">Daraja bo‘yicha tahrirchi xulosasi<textarea rows={3} value={form.levelNote} onChange={e=>change('levelNote',e.target.value)} placeholder="Lug‘at, gap tuzilishi, nutq tezligi va tanlangan CEFR darajasining sababi"/></label>
 <button className="primary-button" disabled={save.isPending}>{save.isPending?'Saqlanmoqda…':'Boshqaruv sozlamalarini saqlash'}</button>{saved&&<p role="status">Sozlamalar saqlandi.</p>}{save.error&&<p role="alert">{errorText(save.error)}</p>}
 {form.audit.interactive&&<p>Interaktiv paket mavjud. O‘quvchi shu paket bilan o‘rganadi. Quyidagi eski kontent maydonlari undan farq qilishi mumkin. <a href={`/api/admin/lessons/${id}/experience/package?preview=1`}>Amaldagi interaktiv paketni eksport qilish</a></p>}<details><summary>Mazmunning dastlabki tekshiruvi</summary><p>{form.audit.segments} ta gap · {form.audit.words} ta lug‘at birligi</p><p>Grammatik izohi yo‘q: {form.audit.missingGrammar}. Rangli mosligi yo‘q: {form.audit.missingAlignment}.</p><ul>{form.audit.problems.map((p,i)=><li key={i}>{p}</li>)}</ul><p>Bu texnik tekshiruv. Daraja va mazmunni manba bilan solishtirib baholash kerak.</p></details>
 </form>:<p>Yuklanmoqda…</p>}</Panel>;
}
