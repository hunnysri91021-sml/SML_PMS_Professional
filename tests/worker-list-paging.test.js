/* Worker: อ่าน SharePoint List เกิน 2,000 รายการ ต้องวนตาม @odata.nextLink ครบทุกหน้า (#264) */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const BASE={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com',LIST_TABLES:'AuditLog'};
const EMPS=[['AD','แอดมิน','admin','','','','','','','','','','','','','active']];
const SETS=[['AD',sha('9999')]];
const TOTAL=2500; const PAGE=999;
const ALL=[]; for(let i=0;i<TOTAL;i++) ALL.push({id:String(i+1),fields:{F0:'t'+i,F1:'u'+i,F2:'a',F3:'b',F4:'c',F5:'d',F6:''}});
let itemCalls=0;
global.fetch=async(url,opt={})=>{
  const u=String(url); const j=(o,s=200)=>({ok:s<300,status:s,json:async()=>o,text:async()=>JSON.stringify(o)});
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(/sites\/x\.sharepoint\.com:/.test(u)) return j({id:'SITE'});
  if(/sites\/SITE\/drive$/.test(u)) return j({id:'DRV'});
  if(u.includes("tables('Employees')/rows")) return j({value:EMPS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")) return j({value:SETS.map(r=>({index:0,values:[r]}))});
  if(/lists\/AuditLog\/columns/.test(u)) return j({value:Array.from({length:7},(_,i)=>({name:'F'+i,displayName:'F'+i}))});
  if(/lists\/AuditLog\/items/.test(u)){
    itemCalls++;
    const m=u.match(/[?&]skip=(\d+)/); const skip=m?parseInt(m[1],10):0;
    const slice=ALL.slice(skip,skip+PAGE);
    const o={value:slice};
    if(skip+PAGE<TOTAL) o['@odata.nextLink']='https://graph.microsoft.com/v1.0/sites/SITE/lists/AuditLog/items?skip='+(skip+PAGE);
    return j(o);
  }
  return j({value:[]});
};
(async()=>{
  const w=(await import(W+'?'+Math.random())).default;
  const call=async(p,tok)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method:'GET',headers:{Authorization:'Bearer '+tok}}),BASE); return {s:r.status,j:await r.json()}; };
  const lg=await w.fetch(new Request('https://w.example/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'AD',pin:'9999'})}),BASE);
  const A=(await lg.json()).token;
  const all=await call('/rows?table=AuditLog',A);
  ok(all.s===200&&all.j.rows.length===TOTAL,'List '+TOTAL+' รายการ → อ่านครบทุกหน้า ได้ '+all.j.rows.length);
  ok(itemCalls===3,'วนอ่าน 3 หน้า (999+999+502) เรียก '+itemCalls+' ครั้ง');
  ok(all.j.rows[0][1]==='u0'&&all.j.rows[TOTAL-1][1]==='u'+(TOTAL-1),'ลำดับแถวแรก/สุดท้ายถูกต้อง');
  const lim=await call('/rows?table=AuditLog&limit=2000',A);
  ok(lim.j.rows.length===2000&&lim.j.rows[1999][1]==='u'+(TOTAL-1)&&lim.j.rows[0][1]==='u500','limit=2000 → ได้ 2,000 แถวล่าสุด');
  done();
})();
