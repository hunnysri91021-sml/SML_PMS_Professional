/* Worker: ปิด/เปิดระบบที่ฝั่งเซิร์ฟเวอร์ + ตั้งเวลาล่วงหน้า (#312) */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789'};
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const EMPS=[
  ['E1','สมชาย','emp','','','','','','','e1@x.com','','','','','','active'],
  ['A1','แอดมิน','admin','','','','','','','a1@x.com','','','','','','active'],
];
const SETS=[['E1',sha('1234')],['A1',sha('9999')]];
let sysRow=null, failFW=false;
function mockFetch(){
  global.fetch=async(url,opt={})=>{
    const u=String(url); const m=opt.method||'GET';
    const j=(o)=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)});
    if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
    if(u.includes('/drive/root:')) return j({id:'ITEM'});
    if(u.includes('/drive')&&!u.includes('/rows')) return j({id:'DRV'});
    if(u.includes('/sites/')&&!u.includes('/rows')) return j({id:'SITE'});
    if(u.includes("tables('Employees')/rows")&&m==='GET') return j({value:EMPS.map(r=>({index:0,values:[r]}))});
    if(u.includes("tables('EmployeeSettings')/rows")&&m==='GET') return j({value:SETS.map(r=>({index:0,values:[r]}))});
    if(u.includes("tables('FormWeights')/rows")&&m==='GET'){
      if(failFW) return {ok:false,status:500,json:async()=>({}),text:async()=>'err'};
      return j({value: sysRow?[{index:0,values:[['__sysopen__',JSON.stringify(sysRow),'']]}]:[]});
    }
    return j({value:[]});
  };
}
mockFetch();
async function fresh(){ const mod=await import(W+'?'+Math.random()); return mod.default; }
const req=(p,method,body,tok)=>new Request('https://w.example'+p,{method,headers:Object.assign({'content-type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:body?JSON.stringify(body):undefined});
async function call(w,p,method,body,tok){ const r=await w.fetch(req(p,method,body,tok),ENV); let j={}; try{j=await r.json();}catch(e){} return {s:r.status,j}; }
(async()=>{
  // เปิดอยู่ → ล็อกอินได้
  sysRow=null; let w=await fresh();
  const e1=await call(w,'/auth/login','POST',{code:'E1',pin:'1234'}); ok(e1.s===200&&e1.j.token,'ระบบเปิด → พนักงานล็อกอินได้');
  const st0=await call(w,'/system-status','GET'); ok(st0.s===200&&st0.j.closed===false,'/system-status: เปิด (ไม่ต้องมีบัตร)');
  // ปิดด้วยมือ
  sysRow={open:false,msg:'ปรับปรุงระบบ',at:'2026-01-01T00:00:00Z'}; w=await fresh();
  const blk=await call(w,'/auth/login','POST',{code:'E1',pin:'1234'});
  ok(blk.s===403&&blk.j.error==='system_closed'&&/ปรับปรุงระบบ/.test(blk.j.message)&&!blk.j.token,'ปิดอยู่ → พนักงานล็อกอินไม่ได้ (403 พร้อมข้อความ)');
  const wrongPin=await call(w,'/auth/login','POST',{code:'E1',pin:'0000'});
  ok(wrongPin.s===401,'PIN ผิดตอนปิด → ยังตอบ 401 ปกติ (ไม่บอกสถานะระบบให้คนที่ไม่รู้ PIN)');
  const adm=await call(w,'/auth/login','POST',{code:'A1',pin:'9999'}); ok(adm.s===200&&adm.j.token,'ปิดอยู่ → Admin ล็อกอินได้');
  const rows=await call(w,'/rows?table=Employees','GET',null,adm.j.token); ok(rows.s===200,'ปิดอยู่ → Admin อ่านข้อมูลได้');
  const stC=await call(w,'/system-status','GET'); ok(stC.j.closed===true&&stC.j.state.msg==='ปรับปรุงระบบ','/system-status: ปิด + ข้อความ');
  // บัตรผ่านที่ออกไว้ก่อนปิด → ถูกบล็อก 503
  sysRow=null; w=await fresh(); const tokE=(await call(w,'/auth/login','POST',{code:'E1',pin:'1234'})).j.token;
  ok((await call(w,'/rows?table=Employees','GET',null,tokE)).s===200,'เปิดอยู่ → พนักงานเรียกข้อมูลได้');
  sysRow={open:false,msg:'อัปเดต',at:'2026-01-01T00:00:00Z'}; w=await fresh();
  // ใช้คีย์/บัตรเดิม (SESSION_SECRET เดียวกัน) กับ Worker ที่เห็นสถานะปิด
  const old=await call(w,'/rows?table=Employees','GET',null,tokE);
  ok(old.s===503&&old.j.error==='system_closed','ปิดอยู่ → บัตรเดิมของพนักงานถูกบล็อก 503');
  // ตั้งเวลา: ปิดอัตโนมัติ
  const past=new Date(Date.now()-60000).toISOString(), future=new Date(Date.now()+3600000).toISOString();
  sysRow={open:true,msg:'',at:'x',closeAt:past,openAt:''}; w=await fresh();
  ok((await call(w,'/auth/login','POST',{code:'E1',pin:'1234'})).s===403,'ถึงเวลาปิดอัตโนมัติแล้ว → บล็อก');
  sysRow={open:true,msg:'',at:'x',closeAt:future,openAt:''}; w=await fresh();
  ok((await call(w,'/auth/login','POST',{code:'E1',pin:'1234'})).s===200,'ยังไม่ถึงเวลาปิด → ใช้ได้');
  sysRow={open:true,msg:'',at:'x',closeAt:past,openAt:past}; w=await fresh();
  ok((await call(w,'/auth/login','POST',{code:'E1',pin:'1234'})).s===200,'ปิดแล้วแต่ถึงเวลาเปิดอัตโนมัติแล้ว → ใช้ได้');
  sysRow={open:false,msg:'',at:'x',openAt:past}; w=await fresh();
  ok((await call(w,'/auth/login','POST',{code:'E1',pin:'1234'})).s===200,'ปิดด้วยมือ + ถึงเวลาเปิดอัตโนมัติ → เปิดเอง');
  sysRow={open:false,msg:'',at:'x',openAt:future}; w=await fresh();
  ok((await call(w,'/auth/login','POST',{code:'E1',pin:'1234'})).s===403,'ปิดด้วยมือ + ยังไม่ถึงเวลาเปิด → ยังบล็อก');
  // อ่านสถานะไม่ได้ → เปิด (ไม่ล่มทั้งบริษัท)
  sysRow=null; failFW=true; w=await fresh();
  ok((await call(w,'/auth/login','POST',{code:'E1',pin:'1234'})).s===200,'อ่านสถานะไม่ได้ → ถือว่าเปิด (fail-open)');
  done();
})();
