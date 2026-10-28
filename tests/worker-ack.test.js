/* Regression (Worker): รับทราบผ่าน LINE ต้องเป็น ResultSent → Acknowledged และอ่านสถานะที่ index 22 ของแถว 24 คอลัมน์ (CLAUDE.md #238) */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',API_KEY:'k',LINE_CHANNEL_SECRET:'sec',LINE_CHANNEL_ACCESS_TOKEN:'tok'};
async function run(status){
  const calls=[]; const orig=global.fetch;
  const row=(vals)=>({index:0,values:[vals]});
  const appr=['E1','พนง','2569','of',...Array(18).fill(0),status,12.5]; // 24 คอลัมน์: status index 22, KPI index 23
  global.fetch=async(url,opt={})=>{
    const u=String(url); const m=(opt.method||'GET'); calls.push({u,m,body:opt.body});
    const j=(o)=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)});
    if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
    if(u.includes('/drive/root:')) return j({id:'ITEM'});
    if(u.includes('/drive')&&!u.includes('/rows')) return j({id:'DRV'});
    if(u.includes('/sites/')&&!u.includes('/rows')) return j({id:'SITE'});
    if(u.includes("tables('EmployeeSettings')/rows")) return j({value:[row(['E1','','','','','U123'])]});
    if(u.includes("tables('Employees')/rows")) return j({value:[row(['E1','พนง'])]});
    if(u.includes("tables('Appraisals')/rows")&&m==='GET') return j({value:[row(appr)]});
    return j({});
  };
  const body=JSON.stringify({events:[{type:'postback',replyToken:'rt',source:{userId:'U123'},postback:{data:'action=ack&code=E1&cycle=2569'}}]});
  const sig=crypto.createHmac('sha256',ENV.LINE_CHANNEL_SECRET).update(body).digest('base64');
  const mod=await import(W+'?'+Math.random());
  const res=await mod.default.fetch(new Request('https://w.example/webhook/line',{method:'POST',headers:{'x-line-signature':sig,'content-type':'application/json'},body}),ENV);
  global.fetch=orig;
  const patch=calls.find(c=>c.m==='PATCH'&&c.u.includes('Appraisals'));
  const reply=calls.find(c=>c.u.includes('/message/reply'));
  return {status:res.status,patch:patch?JSON.parse(patch.body).values[0]:null,reply:reply?JSON.parse(reply.body).messages[0].text:''};
}
(async()=>{
  const a=await run('ResultSent');
  ok(a.status===200,'webhook ตอบ 200');
  ok(a.patch&&a.patch[22]==='Acknowledged','ResultSent → Acknowledged ที่ index 22 ('+(a.patch&&a.patch[22])+')');
  ok(a.patch&&a.patch[23]===12.5,'คอลัมน์ KPI (index 23) ไม่ถูกทับ');
  const b=await run('GMApproved');
  ok(!b.patch,'GM อนุมัติแล้วแต่ยังไม่ส่งผล (GMApproved) → รับทราบผ่าน LINE ไม่ได้ ไม่เขียน Excel');
  const c=await run('Acknowledged');
  ok(!c.patch,'รับทราบไปแล้ว → ไม่เขียนซ้ำ');
  done();
})();
