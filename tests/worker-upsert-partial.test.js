/* #285: /rows/upsert-partial ต้องไม่แตะคอลัมน์สูตร (index 8,9 = วันลารวม/Z) ของแถวเดิมใน Attendance */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const BASE={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com'};
const EMPS=[['AD','แอดมิน','admin','','','','','','','','','','','','','active']];
const SETS=[['AD',sha('9999')]];
const attRows=[{index:0,values:[['91021','x',2569,'','',3,1.5,'','=F+G','=Z','','','','','','','']]}];
const patches=[], adds=[];
global.fetch=async(url,opt={})=>{
  const u=String(url); const m=opt.method||'GET'; const j=(o,s=200)=>({ok:s<300,status:s,json:async()=>o,text:async()=>JSON.stringify(o)});
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(/sites\/x\.sharepoint\.com:/.test(u)) return j({id:'SITE'});
  if(/sites\/SITE\/drive$/.test(u)) return j({id:'DRV'});
  if(u.includes("tables('Employees')/rows")) return j({value:EMPS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")) return j({value:SETS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('Attendance')/rows/itemAt")&&u.endsWith('/range')) return j({address:'Attendance!A5:K5'});
  if(u.includes("tables('Attendance')/rows/add")){ adds.push(JSON.parse(opt.body)); return j({}); }
  if(u.includes("tables('Attendance')/rows")) return j({value:attRows});
  if(u.includes('/range(address=')&&m==='PATCH'){ patches.push({u:decodeURIComponent(u),body:JSON.parse(opt.body)}); return j({}); }
  return j({value:[]});
};
(async()=>{
  const w=(await import(W+'?'+Math.random())).default;
  const login=await w.fetch(new Request('https://w.example/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'AD',pin:'9999'})}),BASE);
  const tok=(await login.json()).token;
  const row=['91021','x',2569,0,0,3,1.5,0,'','',''];
  const r=await w.fetch(new Request('https://w.example/rows/upsert-partial',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({table:'Attendance',keyColIndex:0,keyValue:'91021',values:row,protectedCols:[8,9]})}),BASE);
  const j=await r.json();
  ok(r.status===200&&j.result==='updated-partial','แถวเดิม → updated-partial (ไม่ add)');
  ok(adds.length===0,'ไม่มีการ add แถวใหม่');
  ok(patches.length===2&&patches[0].u.includes('A5:H5')&&patches[1].u.includes('K5:K5'),'PATCH 2 ช่วง A5:H5 และ K5:K5 ('+patches.map(p=>p.u.split('address=')[1]).join(',')+')');
  ok(!patches.some(p=>/[^A-Z](I5|J5)[^0-9]/.test(p.u)||/I5:|:J5|:I5|J5:/.test(p.u.split('address=')[1]||'')),'ไม่มี PATCH ครอบคลุมเซลล์ I5/J5 (สูตร)');
  done();
})();
