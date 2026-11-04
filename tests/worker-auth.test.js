/* Worker: ล็อกอิน + บัตรผ่าน + สิทธิ์ตามบทบาท (#260) */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com',LINE_CHANNEL_ACCESS_TOKEN:'tok'};
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
// Employees: id,name,role,group,section,division,dept,position,startDate,email,grade,l1,l2,gm,approver,status
const EMPS=[
  ['E1','สมชาย','emp','','','','','','','e1@x.com','','','','','','active'],
  ['A1','แอดมิน','admin','','','','','','','a1@x.com','','','','','','active'],
  ['R1','ลาออก','emp','','','','','','','r1@x.com','','','','','','resigned'],
  ['N1','ไม่มีพิน','emp','','','','','','','n1@x.com','','','','','','active'],
];
const SETS=[['E1',sha('1234'),'','','','Uline1'],['A1',sha('9999'),'','','','Uline2'],['R1',sha('1111')]];
const calls=[];
function mockFetch(){
  const orig=global.fetch;
  global.fetch=async(url,opt={})=>{
    const u=String(url); const m=opt.method||'GET'; calls.push({u,m,body:opt.body});
    const j=(o)=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)});
    if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
    if(u.includes('/drive/root:')) return j({id:'ITEM'});
    if(u.includes('/drive')&&!u.includes('/rows')) return j({id:'DRV'});
    if(u.includes('/sites/')&&!u.includes('/rows')) return j({id:'SITE'});
    if(u.includes("tables('Employees')/rows")&&m==='GET') return j({value:EMPS.map(r=>({index:0,values:[r]}))});
    if(u.includes("tables('EmployeeSettings')/rows")&&m==='GET') return j({value:SETS.map(r=>({index:0,values:[r]}))});
    if(u.includes('/sendMail')||u.includes('/rows/add')||u.includes('/message/')) return j({});
    return j({value:[]});
  };
  return ()=>{ global.fetch=orig; };
}
(async()=>{
  const restore=mockFetch();
  const mod=await import(W+'?'+Math.random()); const w=mod.default;
  const req=(p,method,body,tok)=>new Request('https://w.example'+p,{method,headers:Object.assign({'content-type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:body?JSON.stringify(body):undefined});
  const call=async(p,method,body,tok)=>{ const r=await w.fetch(req(p,method,body,tok),ENV); let j={}; try{j=await r.json();}catch(e){} return {s:r.status,j}; };

  // ไม่มีบัตร = 401
  ok((await call('/rows?table=Employees','GET')).s===401,'ไม่มีบัตรผ่าน → 401');
  ok((await call('/rows?table=Employees','GET',null,'bad.token')).s===401,'บัตรปลอม → 401');
  // ล็อกอิน
  const bad=await call('/auth/login','POST',{code:'E1',pin:'0000'});
  ok(bad.s===401&&!bad.j.token,'PIN ผิด → 401 ไม่ได้บัตร');
  const unk=await call('/auth/login','POST',{code:'ZZZ',pin:'1234'});
  ok(unk.s===401&&unk.j.error===bad.j.error,'รหัสไม่มี → ข้อความเดียวกับ PIN ผิด (ไม่บอกว่ารหัสมีหรือไม่)');
  const res=await call('/auth/login','POST',{code:'R1',pin:'1111'});
  ok(res.s===401,'พนักงานลาออก → เข้าไม่ได้ แม้ PIN ถูก');
  const nopin=await call('/auth/login','POST',{code:'N1',pin:'1234'});
  ok(nopin.s===403&&/ยังไม่ได้ตั้ง PIN/.test(nopin.j.error),'ไม่มี PIN ในระบบ → บล็อก (403)');
  const e1=await call('/auth/login','POST',{code:'E1',pin:'1234'});
  ok(e1.s===200&&e1.j.token&&e1.j.user.role==='emp','PIN ถูก → ได้บัตร role=emp');
  const a1=await call('/auth/login','POST',{code:'A1',pin:'9999'});
  ok(a1.s===200&&a1.j.user.role==='admin','admin ได้บัตร role=admin');
  const E=e1.j.token, A=a1.j.token;

  // สิทธิ์อ่าน: hash ถูกซ่อนจาก non-admin
  const rs=await call('/rows?table=EmployeeSettings','GET',null,E);
  ok(rs.s===200&&rs.j.rows.every(r=>r[1]===''),'non-admin อ่าน EmployeeSettings: PinHash ถูกลบเป็นค่าว่าง');
  ok(rs.j.rows[0][5]==='Uline1','คอลัมน์อื่น (LineUserId) ยังอยู่');
  const ra=await call('/rows?table=EmployeeSettings','GET',null,A);
  ok(ra.j.rows.some(r=>r[1]===sha('1234')),'admin ยังเห็น hash (จำเป็นต่อการตั้ง PIN)');

  // สิทธิ์เขียน
  ok((await call('/rows/upsert','POST',{table:'Employees',keyColIndex:0,keyValue:'E1',values:['E1']},E)).s===403,'emp เขียน Employees ไม่ได้');
  ok((await call('/rows/upsert','POST',{table:'EmployeeSettings',keyColIndex:0,keyValue:'E1',values:['E1']},E)).s===403,'emp เขียน EmployeeSettings (PIN) ไม่ได้');
  ok((await call('/rows/upsert','POST',{table:'Appraisals',keyColIndex:[0,2,3],keyValue:['E1','2569','of'],values:['E1']},E)).s===200,'emp upsert Appraisals ได้');
  ok((await call('/rows/add','POST',{table:'Approvals',values:['E1']},E)).s===200,'emp เพิ่ม Approvals ได้');
  ok((await call('/rows/add','POST',{table:'Employees',values:['X']},E)).s===403,'emp เพิ่มแถว Employees ไม่ได้');
  ok((await call('/rows/delete','POST',{table:'KPI_Goals',keyColIndex:0,keyValue:'K1'},E)).s===403,'emp ลบแถวไม่ได้');
  ok((await call('/rows/dedupe','POST',{table:'Appraisals',keyCols:[0],dryRun:true},E)).s===403,'emp dedupe ไม่ได้');
  ok((await call('/rows/upsert-partial','POST',{table:'Attendance',keyColIndex:0,keyValue:'E1',values:['E1']},E)).s===403,'emp เขียน Attendance ไม่ได้');
  ok((await call('/rows/upsert','POST',{table:'EmployeeSettings',keyColIndex:0,keyValue:'E1',values:['E1']},A)).s===200,'admin เขียน EmployeeSettings ได้');
  ok((await call('/rows/delete','POST',{table:'KPI_Goals',keyColIndex:0,keyValue:'K1'},A)).s===200,'admin ลบแถวได้');

  // ส่งอีเมล / LINE
  ok((await call('/send-mail','POST',{toEmail:'evil@out.com',subject:'s',body:'b'},E)).s===403,'emp ส่งอีเมลหาคนนอกไม่ได้');
  ok((await call('/send-mail','POST',{toEmail:'a1@x.com',subject:'s',body:'b'},E)).s===200,'emp ส่งอีเมลหาพนักงานในระบบได้');
  ok((await call('/send-mail','POST',{toEmail:'evil@out.com',subject:'s',body:'b'},A)).s===200,'admin ส่งได้ทุกที่อยู่');
  ok((await call('/send-line','POST',{userIds:['Uunknown'],message:'m'},E)).s===403,'emp ส่ง LINE หา userId ที่ไม่ได้ลงทะเบียนไม่ได้');
  ok((await call('/send-line','POST',{userIds:['Uline1'],message:'m'},E)).s===200,'emp ส่ง LINE หา userId ที่ลงทะเบียนได้');
  ok((await call('/send-line-ack','POST',{userId:'Uline2',empCode:'E1',empName:'x',cycle:'2569'},E)).s===403,'ack: userId ไม่ตรงกับพนักงาน → 403');
  ok((await call('/send-line-ack','POST',{userId:'Uline1',empCode:'E1',empName:'x',cycle:'2569'},E)).s===200,'ack: userId ตรงกับพนักงาน → ส่งได้');

  // บัตรหมดอายุ
  const mod2={...ENV};
  const exp=await (async()=>{ const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url'); const body=b64({sub:'E1',role:'admin',exp:Math.floor(Date.now()/1000)-10}); const sig=crypto.createHmac('sha256',ENV.SESSION_SECRET).update(body).digest('base64url'); return body+'.'+sig; })();
  ok((await call('/rows?table=Employees','GET',null,exp)).s===401,'บัตรลายเซ็นถูกแต่หมดอายุ → 401');
  const forged=await (async()=>{ const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url'); const body=b64({sub:'E1',role:'admin',exp:Math.floor(Date.now()/1000)+999}); const sig=crypto.createHmac('sha256','wrong-secret').update(body).digest('base64url'); return body+'.'+sig; })();
  ok((await call('/rows?table=Employees','GET',null,forged)).s===401,'ปลอมบัตรเป็น admin ด้วย secret ผิด → 401');

  // ล็อก PIN ผิดซ้ำ
  for(let i=0;i<5;i++) await call('/auth/login','POST',{code:'A1',pin:'0000'});
  const locked=await call('/auth/login','POST',{code:'A1',pin:'9999'});
  ok(locked.s===429,'ผิดครบ 5 ครั้ง → ล็อก (429) แม้ PIN ถูก');
  restore(); done();
})();
