/* Regression (Worker): เตือนอัตโนมัติด้วย Cron ตามกำหนดการขั้นตอน (CLAUDE.md #310) */
const path=require('path'); const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'x'.repeat(48),SEND_AS_EMAIL:'hr@x.com',LINE_CHANNEL_ACCESS_TOKEN:'tok',APP_URL:'https://app.example/'};
const thai=(add)=>new Date(Date.now()+7*3600e3+add*86400e3).toISOString().slice(0,10);
async function run(opts){
  const calls=[]; const orig=global.fetch;
  const row=(v,i=0)=>({index:i,values:[v]});
  const fw=[
    row(['__autoremind__',JSON.stringify({on:opts.on!==false,email:true,line:true}),'']),
    row(['__steps__CY1',JSON.stringify({steps:[{id:'s1',order:1,name:'พนักงานประเมินตนเอง / หัวหน้าหน่วยประเมินรอบแรก',end:thai(opts.days??3),remind:'7,3,1',stage:'self'},{id:'s2',order:2,name:'ตั้งเอง',end:thai(3),remind:'3',stage:''}]}),'']),
    ...(opts.logged?[row(['__remindlog__',JSON.stringify({['CY1|s1|3']:thai(0)}),''])]:[]),
  ];
  global.fetch=async(url,o={})=>{
    const u=String(url); const m=o.method||'GET'; calls.push({u,m,body:o.body});
    const j=(x)=>({ok:true,status:200,json:async()=>x,text:async()=>JSON.stringify(x)});
    if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
    if(u.includes('/drive/root:')) return j({id:'ITEM'});
    if(u.includes('/drive')&&!u.includes('/rows')) return j({id:'DRV'});
    if(u.includes('/sites/')&&!u.includes('/rows')&&!u.includes('/lists')) return j({id:'SITE'});
    if(u.includes("tables('FormWeights')/rows")&&m==='GET') return j({value:fw});
    if(u.includes("tables('Cycles')/rows")) return j({value:[row(['CY1','2569','','','','','','Active'])]});
    if(u.includes("tables('Employees')/rows")) return j({value:[
      row(['E1','สมชาย','emp','','','','','','','e1@x.com','','','','','','active']),
      row(['E2','สมหญิง','emp','','','','','','','e2@x.com','','','','','','active']),
      row(['A1','HR','admin','','','','','','','a1@x.com','','','','','','active'])]});
    if(u.includes("tables('EmployeeSettings')/rows")) return j({value:[row(['E1','','','','','U1']),row(['A1','','','','1','U9'])]});
    if(u.includes("tables('Appraisals')/rows")) return j({value:[row(['E2','x','2569','of',...Array(18).fill(0),'Submitted',0])]});
    if(u.includes('/message/multicast')) return j({});
    return j({});
  };
  const mod=await import(W+'?'+Math.random());
  let r; try{ r=await mod.default.scheduled?await (async()=>{const ps=[];await mod.default.scheduled({},ENV,{waitUntil:p=>ps.push(p)});await Promise.all(ps);return null;})():null; }finally{}
  global.fetch=orig; return {calls,fw};
}
async function direct(opts){
  const calls=[]; const orig=global.fetch; const logs=[]; const ol=console.log; console.log=(...a)=>logs.push(a.join(' '));
  try{
    const r=await run(opts); console.log=ol; return {...r,logs};
  }finally{ console.log=ol; global.fetch=orig; }
}
(async()=>{
  // ส่งจริง: เหลือ E1 ยังไม่ส่ง (E2 ส่งแล้ว, A1 ยกเว้นประเมิน) → อีเมลถึง E1 + สรุปถึง A1
  let r=await direct({});
  const mails=r.calls.filter(c=>c.u.includes('/sendMail'));
  ok(mails.length===2,'ส่งอีเมล 2 ฉบับ (E1 + สรุปให้ Admin) ('+mails.length+')');
  ok(mails.some(m=>m.u.includes('hr%40x.com')),'ส่งในนามผู้ส่งที่ตั้งไว้ (SEND_AS_EMAIL)');
  ok(mails.some(m=>m.body.includes('e1@x.com')&&m.body.includes('อีก 3 วัน')),'อีเมลถึงพนักงานที่ยังไม่ส่ง บอกกำหนด');
  ok(!mails.some(m=>m.body.includes('e2@x.com')),'คนที่ส่งแล้วไม่ถูกเตือน');
  ok(r.calls.some(c=>c.u.includes('/message/multicast')),'ส่ง LINE ด้วย');
  ok(r.calls.some(c=>c.u.includes("'FormWeights'")&&c.m!=='GET'&&String(c.body).includes('__remindlog__')),'บันทึกว่าส่งแล้ววันนี้');
  ok(!mails.some(m=>m.body.includes('ตั้งเอง')),'ขั้นที่ไม่ผูกสถานะใบประเมินไม่ถูกส่ง');
  // ส่งซ้ำวันเดียวกัน = ไม่ส่ง
  r=await direct({logged:true});
  ok(r.calls.filter(c=>c.u.includes('/sendMail')).length===0,'วันนี้ส่งขั้นนี้ไปแล้ว → ไม่ส่งซ้ำ');
  // สวิตช์ปิด = ไม่ส่ง
  r=await direct({on:false});
  ok(r.calls.filter(c=>c.u.includes('/sendMail')).length===0,'Admin ปิดสวิตช์ → ไม่ส่งเลย');
  // ไม่ใช่วันที่ตรงกับ remind (เหลือ 5 วัน, remind=7,3,1) = ไม่ส่ง
  r=await direct({days:5});
  ok(r.calls.filter(c=>c.u.includes('/sendMail')).length===0,'วันที่ไม่ตรงรายการเตือนล่วงหน้า → ไม่ส่ง');
  // ไม่มีคนค้าง → ไม่ส่ง ไม่ต้องทดสอบเพิ่ม; ทดลอง (dryRun) ผ่าน /admin/run-reminders ต้องใช้บัตรผ่าน Admin — ตรวจเส้นทางเฉยๆ
  done();
})();
