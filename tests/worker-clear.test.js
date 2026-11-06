/* #281: Worker /admin/clear-table + /admin/clear-columns — ล้างข้อมูลทดสอบ */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const BASE={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com',LIST_TABLES:'AuditLog'};
const EMPS=[['AD','แอดมิน','admin','','','','','','','','','','','','','active'],['E1','พนง','emp','','','','','','','','','','','','','active']];
const SETS=[['AD',sha('9999')],['E1',sha('1234')]];
const listItems=[1,2,3].map(i=>({id:String(i),fields:{F0:'t'+i,F1:'',F2:'',F3:'',F4:'',F5:'',F6:''}}));
let apprRows=Array.from({length:130},(_,i)=>({index:i,values:[['E'+i,'n','2569','of']]}));
const deletedRows=[], patches=[], batchDeleted=[];
global.fetch=async(url,opt={})=>{
  const u=String(url); const m=opt.method||'GET'; const j=(o,s=200)=>({ok:s<300,status:s,json:async()=>o,text:async()=>JSON.stringify(o)});
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(/sites\/x\.sharepoint\.com:/.test(u)) return j({id:'SITE'});
  if(/sites\/SITE\/drive$/.test(u)) return j({id:'DRV'});
  if(u.includes("tables('Employees')/rows")) return j({value:EMPS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")) return j({value:SETS.map(r=>({index:0,values:[r]}))});
  if(/lists\/AuditLog\/columns/.test(u)) return j({value:Array.from({length:7},(_,i)=>({name:'F'+i,displayName:'F'+i}))});
  if(u.endsWith('/$batch')){ const reqs=JSON.parse(opt.body).requests; reqs.forEach(r=>{ const id=r.url.split('/items/')[1]; batchDeleted.push(id); const k=listItems.findIndex(x=>x.id===id); if(k>=0) listItems.splice(k,1); }); return j({responses:reqs.map(r=>({id:r.id,status:204}))}); }
  if(/lists\/AuditLog\/items/.test(u)&&m==='GET') return j({value:listItems.map(x=>({id:x.id,fields:Object.assign({},x.fields)}))});
  if(u.includes("tables('Appraisals')/rows/itemAt")&&m==='DELETE'){ const idx=parseInt(/index=(\d+)/.exec(u)[1],10); deletedRows.push(idx); apprRows=apprRows.filter(r=>r.index!==idx); return j({}); }
  if(u.includes("tables('Appraisals')/rows")) return j({value:apprRows});
  if(u.includes("tables('Attendance')/dataBodyRange")) return j({address:'Attendance!A2:K4',rowCount:3});
  if(u.includes('/range(address=')&&m==='PATCH'){ patches.push({u:decodeURIComponent(u),body:JSON.parse(opt.body)}); return j({}); }
  return j({value:[]});
};
(async()=>{
  const w=(await import(W+'?'+Math.random())).default;
  const call=async(p,body,tok)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify(body)}),BASE); let o={}; try{o=await r.json();}catch(e){} return {s:r.status,j:o}; };
  const login=async(c,p)=>{ const r=await w.fetch(new Request('https://w.example/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:c,pin:p})}),BASE); return (await r.json()).token; };
  const A=await login('AD','9999'), E=await login('E1','1234');
  ok((await call('/admin/clear-table',{table:'Appraisals'},E)).s===403,'ไม่ใช่ Admin → 403');
  ok((await call('/admin/clear-table',{table:'Employees'},A)).s===400,'ตารางนอก whitelist (Employees) → 400');
  ok((await call('/admin/clear-columns',{table:'Employees'},E)).s===403&&(await call('/admin/clear-columns',{table:'Employees'},A)).s===400,'clear-columns: ไม่ใช่ Admin 403 / ตารางไม่รองรับ 400');
  const dry=await call('/admin/clear-table',{table:'Appraisals',dryRun:true},A);
  ok(dry.j.total===130&&deletedRows.length===0,'dry-run นับ 130 ไม่ลบจริง');
  const c1=await call('/admin/clear-table',{table:'Appraisals'},A);
  ok(c1.j.deleted===100&&c1.j.remaining===30&&deletedRows[0]===129,'Excel: ลบก้อนแรก 100 แถว จาก index มากไปน้อย เหลือ 30');
  const c2=await call('/admin/clear-table',{table:'Appraisals'},A);
  ok(c2.j.remaining===0&&apprRows.length===0,'ลบก้อนที่สองหมด (เหลือ 0)');
  const l=await call('/admin/clear-table',{table:'AuditLog'},A);
  ok(l.j.deleted===3&&l.j.remaining===0&&listItems.length===0&&batchDeleted.join()==='1,2,3','List: ลบทุก item ผ่าน $batch');
  const cc=await call('/admin/clear-columns',{table:'Attendance'},A);
  ok(cc.j.rows===3&&patches.length===2,'Attendance: PATCH 2 ช่วงคอลัมน์ (D–H และ K) ไม่แตะ I,J ที่เป็นสูตร');
  ok(patches[0].u.includes('Attendance!D2:H4')&&patches[1].u.includes('Attendance!K2:K4'),'ช่วงที่เคลียร์ตรง D2:H4 และ K2:K4');
  ok(patches[0].body.values.length===3&&patches[0].body.values[0].length===5&&patches[0].body.values.every(r=>r.every(v=>v==='')),'ค่าที่เขียนเป็นช่องว่างทั้งหมด');
  done();
})();
