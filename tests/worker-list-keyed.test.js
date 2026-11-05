/* Worker: Appraisals ใน SharePoint List (แก้แถวเดิม/ลบ/ลบซ้ำ/ย้ายแบบ upsert/LINE ack) */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const BASE={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789'};
const EMPS=[['AD','แอดมิน','admin','','','','','','','','','','','','','active'],['E1','พนง','emp','','','','','','','','','','','','','active']];
const SETS=[['AD',sha('9999')],['E1',sha('1234')]];
const mk=(code,cyc,lv,status)=>{const r=Array(24).fill('');r[0]=code;r[1]='n';r[2]=cyc;r[3]=lv;r[22]=status;r[23]='';return r;};
// Excel Appraisals: E1 มี 2 แถวซ้ำ (Submitted/L2Reviewed) + AD 1 แถว
const XL=[mk('E1','2569','of','Submitted'),mk('E1','2569','of','L2Reviewed'),mk('AD','2569','mgr','Draft')];
let items=[]; let nextId=1; const calls=[];
const fieldsOf=(vals)=>{const f={};vals.forEach((v,i)=>{f['F'+i]=String(v);});return f;};
global.fetch=async(url,opt={})=>{
  const u=String(url); const m=opt.method||'GET'; calls.push({u,m});
  const j=(o,s=200)=>({ok:s<300,status:s,json:async()=>o,text:async()=>JSON.stringify(o)});
  let body=null; try{body=opt.body?JSON.parse(opt.body):null;}catch(e){}
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(/sites\/x\.sharepoint\.com:/.test(u)) return j({id:'SITE'});
  if(/sites\/SITE\/drive$/.test(u)) return j({id:'DRV'});
  if(u.includes("tables('Employees')/rows")) return j({value:EMPS.map((r,i)=>({index:i,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")) return j({value:SETS.map((r,i)=>({index:i,values:[r]}))});
  if(u.includes("tables('Appraisals')/rows")&&m==='GET') return j({value:XL.map((r,i)=>({index:i,values:[r]}))});
  if(u.endsWith('/$batch')){
    const res=body.requests.map(r=>{
      if(r.method==='POST'){ const id=String(nextId++); items.push({id,fields:r.body.fields}); return {id:r.id,status:201}; }
      if(r.method==='PATCH'){ const id=/items\/(\d+)\/fields/.exec(r.url)[1]; const it=items.find(x=>x.id===id); Object.assign(it.fields,r.body); return {id:r.id,status:200}; }
      return {id:r.id,status:400};
    });
    return j({responses:res});
  }
  if(/lists\/Appraisals\/columns/.test(u)) return j({value:Array.from({length:24},(_,i)=>({name:'F'+i,displayName:'F'+i}))});
  let mm;
  if((mm=/lists\/Appraisals\/items\/(\d+)\/fields$/.exec(u))&&m==='PATCH'){ const it=items.find(x=>x.id===mm[1]); Object.assign(it.fields,body); return j({});}
  if((mm=/lists\/Appraisals\/items\/(\d+)$/.exec(u))&&m==='DELETE'){ items=items.filter(x=>x.id!==mm[1]); return j({},204);}
  if(/lists\/Appraisals\/items(\?|$)/.test(u)&&m==='POST'){ const id=String(nextId++); items.push({id,fields:body.fields}); return j({id},201);}
  if(/lists\/Appraisals\/items/.test(u)&&m==='GET') return j({value:items.map(x=>({id:x.id,fields:x.fields}))});
  if(/lists\/Appraisals$/.test(u)) return j({id:'L'});
  return j({value:[]});
};
(async()=>{
  const w=(await import(W+'?'+Math.random())).default;
  const call=async(env,p,method,body,tok)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method,headers:Object.assign({'content-type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:body?JSON.stringify(body):undefined}),env); let o={}; try{o=await r.json();}catch(e){} return {s:r.status,j:o}; };
  const A=(await call(BASE,'/auth/login','POST',{code:'AD',pin:'9999'})).j.token;
  const E=(await call(BASE,'/auth/login','POST',{code:'E1',pin:'1234'})).j.token;

  // ย้าย: ตัดแถวซ้ำ (เก็บสถานะก้าวหน้าสุด) แล้ว upsert เข้า list
  const su=await call(BASE,'/admin/list-setup','POST',{table:'Appraisals'},A);
  ok(su.s===200&&su.j.list==='exists','setup: มี list อยู่แล้ว ('+JSON.stringify(su.j)+')');
  const mg=await call(BASE,'/admin/list-migrate','POST',{table:'Appraisals',offset:0},A);
  ok(mg.s===200&&mg.j.total===2&&mg.j.migrated===2&&mg.j.done&&mg.j.droppedDuplicates===1,'ย้าย 2 แถว (ตัดซ้ำ 1) '+JSON.stringify(mg.j));
  ok(items.length===2&&items.find(x=>x.fields.F0==='E1').fields.F22==='L2Reviewed','เก็บแถวสถานะก้าวหน้าสุดของ E1');
  const mg2=await call(BASE,'/admin/list-migrate','POST',{table:'Appraisals',offset:0},A);
  ok(mg2.j.done&&items.length===2,'ย้ายซ้ำ → อัปเดตตามคีย์ ไม่เพิ่มซ้ำ');

  const ENV2=Object.assign({},BASE,{LIST_TABLES:'Appraisals'});
  ok((await call(ENV2,'/admin/list-migrate','POST',{table:'Appraisals',offset:0},A)).s===400,'หลังสลับ LIST_TABLES แล้ว ห้ามย้ายซ้ำ');

  // อ่าน
  const rd=await call(ENV2,'/rows?table=Appraisals','GET',null,A);
  ok(rd.s===200&&rd.j.rows.length===2&&rd.j.rows[0].length===24&&rd.j.rows[0][22]==='L2Reviewed','อ่านจาก List ได้รูป array 24 ช่อง');

  // upsert: อัปเดตของเดิม
  const up=await call(ENV2,'/rows/upsert','POST',{table:'Appraisals',keyColIndex:[0,2,3],keyValue:['E1','2569','of'],values:mk('E1','2569','of','Acknowledged')},A);
  ok(up.s===200&&up.j.result==='updated'&&items.length===2&&items.find(x=>x.fields.F0==='E1').fields.F22==='Acknowledged','upsert อัปเดตรายการเดิม ไม่เพิ่มซ้ำ');
  // upsert: คีย์ใหม่ → เพิ่ม
  const up2=await call(ENV2,'/rows/upsert','POST',{table:'Appraisals',keyColIndex:[0,2,3],keyValue:['E1','2570','of'],values:mk('E1','2570','of','Draft')},A);
  ok(up2.j.result==='added'&&items.length===3,'upsert คีย์ใหม่ → เพิ่ม');
  // พนักงาน (E1) เขียนของตัวเองได้ ของคนอื่นไม่ได้
  ok((await call(ENV2,'/rows/upsert','POST',{table:'Appraisals',keyColIndex:[0,2,3],keyValue:['E1','2570','of'],values:mk('E1','2570','of','Submitted')},E)).s===200,'พนักงานเขียนของตนได้');
  ok((await call(ENV2,'/rows/upsert','POST',{table:'Appraisals',keyColIndex:[0,2,3],keyValue:['AD','2569','mgr'],values:mk('AD','2569','mgr','Submitted')},E)).s===403,'พนักงานเขียนของคนอื่น → 403');

  // dedupe บน list: ใส่แถวซ้ำเองแล้วลบ
  items.push({id:String(nextId++),fields:fieldsOf(mk('E1','2570','of','Draft'))});
  const dry=await call(ENV2,'/rows/dedupe','POST',{table:'Appraisals',keyCols:[0,2,3],dryRun:true},A);
  ok(dry.j.toDelete===1&&dry.j.deleted===0,'dedupe dry-run นับ 1 ไม่ลบ');
  const dd=await call(ENV2,'/rows/dedupe','POST',{table:'Appraisals',keyCols:[0,2,3],dryRun:false},A);
  ok(dd.j.deleted===1&&items.filter(x=>x.fields.F0==='E1'&&x.fields.F2==='2570').length===1,'dedupe ลบซ้ำจริง เก็บสถานะก้าวหน้า');

  // delete
  ok((await call(ENV2,'/rows/delete','POST',{table:'Appraisals',keyColIndex:[0,2,3],keyValue:['E1','2570','of']},A)).j.deleted===1,'ลบตามคีย์บน List');

  // ตารางแบบเพิ่มอย่างเดียวยัง 400
  const ENV3=Object.assign({},BASE,{LIST_TABLES:'Approvals'});
  ok((await call(ENV3,'/rows/upsert','POST',{table:'Approvals',keyColIndex:0,keyValue:'x',values:['x']},A)).s===400,'Approvals (append-only) upsert ยัง 400');
  done();
})();
