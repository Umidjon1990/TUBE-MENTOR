/** Keys live exclusively in server environment variables. Never return them in DTOs. */
export function paymeConfig(){
 const mode=process.env.PAYME_MODE==='live'?'live':'test';
 const merchantId=process.env.PAYME_MERCHANT_ID||'';
 const key=mode==='live'?process.env.PAYME_KEY:process.env.PAYME_TEST_KEY;
 const ikpu=process.env.PAYME_IKPU||'',packageCode=process.env.PAYME_PACKAGE_CODE||'';
 const vat=Number(process.env.PAYME_VAT_PERCENT??'NaN');
 const fiscalReady=/^\d{17}$/.test(ikpu)&&/^\d{1,30}$/.test(packageCode)&&Number.isInteger(vat)&&vat>=0&&vat<=100;
 const configured=/^[a-f0-9]{24}$/i.test(merchantId)&&!!key&&key.length>=12;
 return {mode,merchantId,key,configured,fiscalReady,ikpu,packageCode,vat,
  liveReady:mode==='live'&&configured&&fiscalReady&&process.env.PAYME_ENABLED==='true',
  returnOrigin:process.env.PAYME_RETURN_ORIGIN||process.env.APP_URL||''};
}
export function paymeCheckout(invoice:number,amount:number){const c=paymeConfig();const origin=new URL(c.returnOrigin);if(origin.protocol!=='https:'&&process.env.NODE_ENV!=='test')throw Error('HTTPS return origin required');
 const returnUrl=new URL(process.env.PAYME_RETURN_URL||'/wallet',origin);if(returnUrl.protocol!=='https:'&&process.env.NODE_ENV!=='test')throw Error('HTTPS return URL required');const callback=returnUrl.href;
 const payload=`m=${c.merchantId};ac.order_id=${invoice};a=${amount};l=uz;c=${callback}`;
 return (c.mode==='test'?'https://test.paycom.uz/':'https://checkout.paycom.uz/')+Buffer.from(payload).toString('base64');
}
