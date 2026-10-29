import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
type Call=(method:string,path:string,body?:unknown)=>Promise<any>;
export function PaymeSetupPanel({call}:{call:Call}){
 const q=useQuery<any>({queryKey:['payme-setup'],queryFn:()=>call('GET','/api/admin/commerce/payme')}),[test,T]=useState<any>(null),[busy,B]=useState(false),[error,E]=useState('');
 async function create(){B(true);E('');try{T(await call('POST','/api/admin/commerce/payme/test-invoice',{amountUzs:1000}));void q.refetch()}catch(e){E((e as Error).message)}finally{B(false)}}
 return <section className="commerce-panel ad-card"><h2>Payme — ONLINE HARID</h2>{q.isLoading?<p>Ulanish tekshirilmoqda…</p>:q.error?<p role="alert">{(q.error as Error).message}</p>:q.data&&<>
 <p><strong>{q.data.liveReady?'Haqiqiy to‘lovlar yoqilgan':q.data.configured?'Sinovga tayyor':'Server kaliti kiritilishi kerak'}</strong></p>
 <dl><dt>Rejim</dt><dd>{q.data.mode==='test'?'Sinov — haqiqiy coin qo‘shilmaydi':'Ishchi'}</dd><dt>Kassa ID</dt><dd>{q.data.merchantId||'Hali kiritilmagan'}</dd><dt>Payme kassasiga kiritiladigan Endpoint URL</dt><dd style={{overflowWrap:'anywhere'}}><code>{q.data.endpoint}</code></dd></dl>
 {!q.data.fiscalReady&&<p>Ishchi rejim uchun tasdiqlangan IKPU, qadoq kodi va QQS stavkasi serverga kiritiladi.</p>}
 <p>Kassa rekviziti: <code>order_id</code>. Buyurtmaga bog‘langan raqam avtomatik yaratiladi. Maxfiy kalitlar bu panelda ko‘rsatilmaydi.</p>
 {q.data.mode==='test'&&<button type="button" className="ad-button" disabled={busy||!q.data.configured} onClick={()=>void create()}>{busy?'Tayyorlanmoqda…':'Sinov hisobini yaratish — 1 000 so‘m'}</button>}
 {error&&<p role="alert">{error}</p>}
 {test&&<div role="status"><p>Sinov hisobi: <strong>{test.invoiceId}</strong> · summa: {test.amount} tiyin. Bu sinov hamyon balansiga ta’sir qilmaydi.</p><a href={test.checkoutUrl} target="_blank" rel="noreferrer">Payme sinov to‘lovini ochish →</a></div>}
 <p><a href="https://test.paycom.uz" target="_blank" rel="noreferrer">Payme sinov muhiti</a></p>
 <button type="button" onClick={()=>void q.refetch()}>Holatni yangilash</button>
 {q.data.transactions.length>0&&<div style={{overflowX:'auto'}}><table><thead><tr><th>Rejim</th><th>Hisob</th><th>Summa</th><th>Holat</th></tr></thead><tbody>{q.data.transactions.map((t:any)=><tr key={t.mode+':'+t.id}><td>{t.mode==='test'?'Sinov':'Ishchi'}</td><td>{t.invoiceId}</td><td>{(t.amount/100).toLocaleString('uz-UZ')} so‘m</td><td>{{1:'Kutilmoqda',2:'To‘langan','-1':'Bekor qilingan','-2':'Qaytarilgan'}[String(t.state)]||t.state}</td></tr>)}</tbody></table></div>}
 </>}</section>;
}
