/* Worker: ตารางที่ย้ายไป SharePoint List (#264) */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const BASE={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com'};
const EMPS=[['AD','แอดมิน','admin','','','','','','','','','','','','','active'],['E1','พนง','emp','','','','','','','','','','','','','active']];
const SETS=[['AD',sha('9999')],['E1',sha('1234')]];
const XL=[];for(let i=0;i<450;i++)XL.push(['2569-01-01T00:00:'+i,'u'+i,'auth','act'+i,'t','d'+i,'']);
let listExists=false; const items=[]; const calls=[];
global.fetch=async(url,opt={})=>{
  const u=String(url); const m=opt.method||'GET'; calls.push({u,m});
  const j=(o,s=200)=>({ok:s<300,status:s,json:async()=>o,text:async()=>JSON.stringify(o)});
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(u.includes('/sites/s.sharepoint')||/sites\/x\.sharepoint\.com:/.test(u)) return j({id:'SITE'});
  if(/\/sites\/SITE\/drive$/.test(u)) return j({id:'DRV'});
  if(u.includes("tables('Employees')/rows")) return j({value:EMPS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")) return j({value:SETS.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('AuditLog')/rows")&&m==='GET') return j({value:XL.map(r=>({index:0,values:[r]}))});
  if(u.includes("tables('AuditLog')/rows/add")){ calls.push({excelAdd:1}); return j({}); }
  if(u.endsWith('/$batch')){ const reqs=JSON.parse(opt.body).requests; reqs.forEach(r=>items.push(r.body.fields)); return j({responses:reqs.map(r=>({id:r.id,status:201}))}); }
  if(/sites\/SITE\/lists$/.test(u)&&m==='POST'){ listExists=true; return j({id:'L'},201); }
  if(/sites\/SITE\/lists\/AuditLog$/.test(u)) return listExists?j({id:'L'}):j({error:{message:'nf'}},404);
  if(/lists\/AuditLog\/items/.test(u)&&m==='POST'){ items.push(JSON.parse(opt.body).fields); return j({id:'1'},201); }
  if(/lists\/AuditLog\/items/.test(u)&&m==='GET'){ if(!listExists) return j({error:{message:'nf'}},404); return j({value:items.map(f=>({id:'x',fields:f}))}); }
  return j({value:[]});
};
(async()=>{
  const w=(await import(W+'?'+Math.random())).default;
  const call=async(env,p,method,body,tok)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method,headers:Object.assign({'content-type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:body?JSON.stringify(body):undefined}),env); let o={}; try{o=await r.json();}catch(e){} return {s:r.status,j:o}; };
  const A=(await call(BASE,'/auth/login','POST',{code:'AD',pin:'9999'})).j.token;
  const E=(await call(BASE,'/auth/login','POST',{code:'E1',pin:'1234'})).j.token;

  ok((await call(BASE,'/admin/list-setup','POST',{table:'AuditLog'},E)).s===403,'พนักงานทั่วไปสร้าง/ย้าย list ไม่ได้');
  ok((await call(BASE,'/admin/list-setup','POST',{table:'Appraisals'},A)).s===400,'ตารางที่ไม่รองรับ → 400');
  const su=await call(BASE,'/admin/list-setup','POST',{table:'AuditLog'},A);
  ok(su.s===200&&su.j.list==='created','สร้าง list สำเร็จ');
  ok((await call(BASE,'/admin/list-setup','POST',{table:'AuditLog'},A)).j.list==='exists','เรียกซ้ำ → exists ไม่สร้างซ้ำ');

  let off=0,loops=0,r;
  do{ r=await call(BASE,'/admin/list-migrate','POST',{table:'AuditLog',offset:off},A); off=r.j.next; loops++; }while(!r.j.done&&loops<10);
  ok(items.length===450&&loops===3,'ย้ายครบ 450 แถว เป็น 3 ก้อน (ก้อนละ ≤200) ได้ '+items.length+' แถว '+loops+' ก้อน');
  ok(items[0].F0==='2569-01-01T00:00:0'&&items[449].F3==='act449','ลำดับและค่าคอลัมน์ตรง');
  const again=await call(BASE,'/admin/list-migrate','POST',{table:'AuditLog',offset:0},A);
  ok(again.j.done&&again.j.migrated===0&&items.length===450,'รันซ้ำจากต้น → ไม่ย้ายซ้ำ (เริ่มต่อจากที่ย้ายแล้ว)');

  // ยังไม่เปิด LIST_TABLES → ใช้ Excel เหมือนเดิม
  const mark=calls.length;
  const x=await call(BASE,'/rows?table=AuditLog','GET',null,A);
  ok(x.j.rows.length===450&&!calls.slice(mark).some(c=>/lists\/AuditLog\/items/.test(c.u||'')),'ไม่ตั้ง LIST_TABLES → อ่านจาก Excel');

  const ENV2=Object.assign({},BASE,{LIST_TABLES:'AuditLog'});
  const l=await call(ENV2,'/rows?table=AuditLog','GET',null,A);
  ok(l.s===200&&l.j.rows.length===450&&l.j.rows[0].length===7&&l.j.rows[5][1]==='u5','เปิด LIST_TABLES → อ่านจาก List ได้รูป array 7 ช่องเหมือนเดิม');
  const lim=await call(ENV2,'/rows?table=AuditLog&limit=100','GET',null,A);
  ok(lim.j.rows.length===100&&lim.j.rows[99][1]==='u449','limit=100 → ได้ 100 แถวล่าสุด');
  const ad=await call(ENV2,'/rows/add','POST',{table:'AuditLog',values:['t','who','auth','a','tg','dt','']},E);
  ok(ad.s===200&&items.length===451&&items[450].F1==='who'&&!calls.some(c=>c.excelAdd),'เพิ่มแถวใหม่ลง List (ไม่ลง Excel)');
  const ne=await call(ENV2,'/rows?table=AuditLog','GET',null,E);
  ok(ne.j.rows.length===0,'ไม่ใช่ Admin ยังอ่าน AuditLog ไม่ได้เหมือนเดิม');
  ok((await call(ENV2,'/rows/upsert','POST',{table:'AuditLog',keyColIndex:0,keyValue:'x',values:['x']},A)).s===400,'upsert บนตารางใน List → 400');
  ok((await call(ENV2,'/rows/delete','POST',{table:'AuditLog',keyColIndex:0,keyValue:'x'},A)).s===400,'delete บนตารางใน List → 400');
  // Approvals ก็ย้ายได้ (append-only) และ LINE ack ต้องเขียนผ่าน appendRow เคารพ LIST_TABLES
  const ENV3=Object.assign({},BASE,{LIST_TABLES:'Approvals'});
  const m2=calls.length;
  const ap=await call(ENV3,'/rows/add','POST',{table:'Approvals',values:['E1','พนง','2569','Submitted','พนง','t','']},E);
  ok(ap.s===200&&calls.slice(m2).some(c=>/lists\/Approvals\/items/.test(c.u)&&c.m==='POST')&&!calls.slice(m2).some(c=>c.excelAdd),'Approvals ที่เปิด LIST_TABLES → เพิ่มแถวลง List ไม่ใช่ Excel');
  done();
})();
