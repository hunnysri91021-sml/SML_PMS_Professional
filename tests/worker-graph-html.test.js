/* #292: Graph ตอบเป็น HTML (502/ไฟล์ถูกล็อก) ต้องลองใหม่และแจ้ง HTTP status จริง ไม่ใช่ "Unexpected token '<'" */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const BASE={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789'};
const EMPS=[['AD','แอดมิน','admin','','','','','','','','','','','','','active']];
const SETS=[['AD',sha('9999')]];
let mode='flaky', patchCalls=0;
const html=(s)=>({ok:false,status:s,json:async()=>{throw new SyntaxError("Unexpected token '<'")},text:async()=>'<!DOCTYPE html><html>Bad gateway</html>'});
global.fetch=async(url,opt={})=>{
  const u=String(url); const m=opt.method||'GET'; const j=(o,s=200)=>({ok:s<300,status:s,json:async()=>o,text:async()=>JSON.stringify(o)});
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(/sites\/x\.sharepoint\.com:/.test(u)) return j({id:'SITE'});
  if(/sites\/SITE\/drive$/.test(u)) return j({id:'DRV'});
  if(u.includes("tables('Employees')/rows")) return j({value:EMPS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")) return j({value:SETS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('Attendance')/rows/itemAt")&&u.endsWith('/range')) return j({address:'Attendance!A5:K5'});
  if(u.includes("tables('Attendance')/rows")) return j({value:[{index:0,values:[['91021']]}]});
  if(u.includes('/range(address=')&&m==='PATCH'){ patchCalls++; if(mode==='always') return html(502); if(patchCalls<=2) return html(502); return j({}); }
  return j({value:[]});
};
(async()=>{
  const w=(await import(W+'?'+Math.random())).default;
  const tok=(await (await w.fetch(new Request('https://w.example/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'AD',pin:'9999'})}),BASE)).json()).token;
  const call=()=>w.fetch(new Request('https://w.example/rows/upsert-partial',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({table:'Attendance',keyColIndex:0,keyValue:'91021',values:['91021','x',2569,0,0,3,0,0,'','',''],protectedCols:[8,9]})}),BASE);
  let r=await call(); let j=await r.json();
  ok(r.status===200&&j.result==='updated-partial','HTML 502 ชั่วคราว 2 ครั้ง → ลองใหม่แล้วสำเร็จ (PATCH '+patchCalls+' ครั้ง)');
  mode='always'; patchCalls=0; r=await call(); j=await r.json();
  ok(r.status>=400&&/HTTP 502/.test(j.error||'')&&!/Unexpected token/.test(j.error||''),'ล้มตลอด → แจ้ง HTTP 502 ชัดเจน: '+(j.error||'').slice(0,90));
  done();
})();
