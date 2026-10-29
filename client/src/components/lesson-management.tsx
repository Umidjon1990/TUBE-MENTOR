import {useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Archive,Trash2,X} from 'lucide-react';
import {request,errorText} from '@/lib/learning-api';
type Action='archive'|'delete'|'publish'|'unpublish';
const titles:Record<Action,string>={archive:'Darslarni arxivlash',delete:'Darslarni butunlay o‘chirish',publish:'Darsni nashr etish',unpublish:'Darsni nashrdan olish'};
const buttons:Record<Action,string>={archive:'Arxivlashni tasdiqlash',delete:'Butunlay o‘chirish',publish:'Nashr etishni tasdiqlash',unpublish:'Nashrdan olishni tasdiqlash'};
type Item={id:number;title:string;status:string;version:string;deleteBlocked:string|null};
export function LessonManagementActions({ids,onDone,status,published}:{ids:number[];onDone?:()=>void;status?:string;published?:boolean}){
 const [kind,K]=useState<Action>('archive'),[items,I]=useState<Item[]|null>(null),[ack,A]=useState(false);
 const cache=useQueryClient();
 const preview=useMutation({mutationFn:(action:Action)=>{K(action);A(false);return request<{lessons:Item[]}>('POST','/api/admin/lesson-actions/preview',{ids})},onSuccess:v=>I(v.lessons)});
 const apply=useMutation({mutationFn:()=>request('POST','/api/admin/lesson-actions',{ids:items!.map(l=>l.id),action:kind,confirmed:true,versions:Object.fromEntries(items!.map(l=>[l.id,l.version]))}),onSuccess:()=>{I(null);void cache.invalidateQueries();onDone?.()}});
 function open(action:Action){apply.reset();preview.reset();preview.mutate(action)}
 const blocked=kind==='delete'&&items?.some(l=>l.deleteBlocked);
 return <div className="lesson-management-actions">
  {status&&status!=='published'&&<button type="button" disabled={preview.isPending||apply.isPending} onClick={()=>open('publish')}>Nashr etish</button>}
  {(published??status==='published')&&<button type="button" disabled={preview.isPending||apply.isPending} onClick={()=>open('unpublish')}>Nashrdan olish</button>}
  <button type="button" disabled={!ids.length||preview.isPending||apply.isPending} onClick={()=>open('archive')}><Archive size={16}/>Arxivlash</button>
  <button type="button" className="lesson-delete" disabled={!ids.length||preview.isPending||apply.isPending} onClick={()=>open('delete')}><Trash2 size={16}/>O‘chirish</button>
  {preview.isPending&&<span role="status">Tekshirilmoqda…</span>}{preview.error&&<p role="alert">{errorText(preview.error)}</p>}
  <Dialog.Root open={!!items} onOpenChange={v=>{if(!v&&!apply.isPending)I(null)}}><Dialog.Portal><Dialog.Overlay className="lesson-action-overlay"/><Dialog.Content className="lesson-action-dialog">
   <Dialog.Title>{titles[kind]}</Dialog.Title>
   <Dialog.Description>{kind==='publish'?'Dars tekshirilgan nusxasi bilan nashr qilinadi.':kind==='unpublish'?'Dars katalog va yangi xaridlardan olinadi. Avval berilgan kirish huquqlari va natijalar saqlanadi.':kind==='archive'?'Darslar katalogdan olinadi. Dars mazmuni, o‘quvchilar natijalari va avval berilgan kirish huquqlari saqlanadi.':'Dars mazmuni va unga bog‘liq o‘quv natijalari, qaydlar, saqlangan so‘zlar o‘chadi. Bu amalni qaytarib bo‘lmaydi.'}</Dialog.Description>
   <p>{items?.length} ta dars tanlangan:</p><ul>{items?.map(l=><li key={l.id}><strong>{l.title}</strong> <small>#{l.id}</small>{kind==='delete'&&l.deleteBlocked&&<p className="lesson-blocked">{l.deleteBlocked}</p>}</li>)}</ul>
   {blocked?<p role="alert">Ayrim darslarni o‘chirish mumkin emas. Ushbu tanlovdagi hech bir dars o‘chirilmaydi. Ularni arxivlashingiz mumkin.</p>:kind==='delete'&&<label className="consent-row"><input type="checkbox" checked={ack} onChange={e=>A(e.target.checked)}/>Tanlangan darslar butunlay o‘chirilishini tushundim.</label>}
   {apply.error&&<p role="alert">{errorText(apply.error)}</p>}
   <div className="lesson-management-actions"><button disabled={apply.isPending} onClick={()=>I(null)}>Bekor qilish</button>{blocked?<button onClick={()=>{K('archive');A(false);apply.reset()}}>Arxivlashga o‘tish</button>:<button className={kind==='delete'?'lesson-delete':''} disabled={apply.isPending||(kind==='delete'&&!ack)} onClick={()=>apply.mutate()}>{apply.isPending?'Bajarilmoqda…':buttons[kind]}</button>}</div>
   <Dialog.Close className="lesson-dialog-close" disabled={apply.isPending} aria-label="Yopish"><X size={20}/></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
 </div>;
}
