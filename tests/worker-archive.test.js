/* #267: Worker /admin/list-archive — ลบแถวเก่าออกจาก List */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const BASE={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com',LIST_TABLES:'AuditLog'};
const EMPS=[['AD','แอดมิน','admin','','','','','','','','','','','','','active'],['E1','พนง','emp','','','','','','','','','','','','','active']];
const SETS=[['AD',sha('9999')],['E1',sha('1234')]];
const iso=(d)=>new Date(Date.now()-d*86400000).toISOString();
const items=[]; // id, F0
[400,300,200,100,10,5].forEach((d,i)=>items.push({id:String(i+1),fields:{F0:iso(d),F1:'u'+i,F2:'',F3:'',F4:'',F5:'',F6:''}}));
const deleted=[];
global.fetch=async(url,opt={})=>{
  const u=String(url); const m=opt.method||'GET'; const j=(o,s=200)=>({ok:s<300,status:s,json:async()=>o,text:async()=>JSON.stringify(o)});
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(/sites\/x\.sharepoint\.com:/.test(u)) return j({id:'SITE'});
  if(/sites\/SITE\/drive$/.test(u)) return j({id:'DRV'});
  if(u.includes("tables('Employees')/rows")) return j({value:EMPS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")) return j({value:SETS.map(r=>({index:0,values:[r]}))});
  if(/lists\/AuditLog\/columns/.test(u)) return j({value:Array.from({length:7},(_,i)=>({name:'F'+i,displayName:'F'+i}))});
  if(u.endsWith('/$batch')){ const reqs=JSON.parse(opt.body).requests; reqs.forEach(r=>{ const id=r.url.split('/items/')[1]; deleted.push(id); const k=items.findIndex(x=>x.id===id); if(k>=0) items.splice(k,1); }); return j({responses:reqs.map(r=>({id:r.id,status:204}))}); }
  if(/lists\/AuditLog\/items/.test(u)&&m==='GET') return j({value:items.map(x=>({id:x.id,fields:Object.assign({},x.fields)}))});
  return j({value:[]});
};
(async()=>{
  const w=(await import(W+'?'+Math.random())).default;
  const call=async(env,p,body,tok)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify(body)}),env); let o={}; try{o=await r.json();}catch(e){} return {s:r.status,j:o}; };
  const login=async(c,p)=>{ const r=await w.fetch(new Request('https://w.example/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:c,pin:p})}),BASE); return (await r.json()).token; };
  const A=await login('AD','9999'), E=await login('E1','1234');
  const cut=iso(150).slice(0,10);
  ok((await call(BASE,'/admin/list-archive',{table:'AuditLog',before:cut},E)).s===403,'ไม่ใช่ Admin → 403');
  ok((await call(BASE,'/admin/list-archive',{table:'Employees',before:cut},A)).s===400,'ตารางที่ไม่รองรับ → 400');
  ok((await call(Object.assign({},BASE,{LIST_TABLES:''}),'/admin/list-archive',{table:'AuditLog',before:cut},A)).s===400,'ตารางยังไม่สลับไป List → 400');
  ok((await call(BASE,'/admin/list-archive',{table:'AuditLog',before:iso(10).slice(0,10)},A)).s===400,'วันที่ตัดใหม่กว่า 60 วัน → 400 (กันลบรอบปัจจุบัน)');
  ok((await call(BASE,'/admin/list-archive',{table:'AuditLog',before:'xx'},A)).s===400,'วันที่ไม่ถูกต้อง → 400');
  const dry=await call(BASE,'/admin/list-archive',{table:'AuditLog',before:cut,dryRun:true},A);
  ok(dry.j.count===3&&dry.j.total===6&&deleted.length===0,'dry-run นับ 3 จาก 6 แถว ไม่ลบจริง');
  const del=await call(BASE,'/admin/list-archive',{table:'AuditLog',before:cut},A);
  ok(del.j.deleted===3&&del.j.remaining===0&&deleted.join()==='1,2,3'&&items.length===3,'ลบ 3 แถวเก่า เหลือ 3 แถวใหม่ไม่ถูกแตะ');
  done();
})();
