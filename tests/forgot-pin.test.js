/* ลืม PIN → OTP อีเมล → พนักงานตั้ง PIN ใหม่เอง (#302): Worker + หน้าล็อกอิน */
const crypto=require('crypto'); const path=require('path');
const {ok,done,open,INJECT}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com'};
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const EMPS=[
  ['E1','สมชาย','emp','','','','','','','somchai@x.com','','','','','','active'],
  ['R1','ลาออก','emp','','','','','','','r1@x.com','','','','','','resigned'],
  ['N1','ไม่มีอีเมล','emp','','','','','','','','','','','','','active'],
];
let SETS=[['E1',sha('1234'),'of','2026-01-01','1','Uline1']];
const mails=[], writes=[];
function mockFetch(){
  global.fetch=async(url,opt={})=>{
    const u=String(url); const m=opt.method||'GET';
    const j=(o)=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)});
    if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
    if(u.includes('/drive/root:')) return j({id:'ITEM'});
    if(u.includes('/drive')&&!u.includes('/rows')) return j({id:'DRV'});
    if(u.includes('/sites/')&&!u.includes('/rows')) return j({id:'SITE'});
    if(u.includes("tables('Employees')/rows")&&m==='GET') return j({value:EMPS.map((r,i)=>({index:i,values:[r]}))});
    if(u.includes("tables('EmployeeSettings')/rows")&&m==='GET') return j({value:SETS.map((r,i)=>({index:i,values:[r]}))});
    if(u.includes("tables('EmployeeSettings')/rows/itemAt")&&m==='PATCH'){ const v=JSON.parse(opt.body).values[0]; writes.push(v); SETS=[v]; return j({}); }
    if(u.includes('/sendMail')){ mails.push(JSON.parse(opt.body)); return j({}); }
    return j({value:[]});
  };
}
(async()=>{
  mockFetch();
  const mod=await import(W+'?'+Math.random()); const w=mod.default;
  const call=async(p,body)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),ENV); let j={}; try{j=await r.json();}catch(e){} return {s:r.status,j}; };
  const otpOf=()=>/คือ: (\d{6})/.exec(mails[mails.length-1].message.body.content)[1];

  const bad=await call('/auth/forgot',{code:'ZZZ'});
  ok(bad.s===400&&!mails.length,'รหัสไม่มี → 400 ไม่ส่งอีเมล');
  ok((await call('/auth/forgot',{code:'N1'})).j.error===bad.j.error,'ไม่มีอีเมล → ข้อความเดียวกับรหัสไม่มี');
  ok((await call('/auth/forgot',{code:'R1'})).s===400,'ลาออกแล้ว → ขอไม่ได้');

  const f=await call('/auth/forgot',{code:'E1'});
  ok(f.s===200&&f.j.challenge&&/^so\*\*\*@x\.com$/.test(f.j.maskedEmail),'ขอ OTP สำเร็จ ได้ challenge + อีเมลถูกปิดบังบางส่วน');
  ok(!JSON.stringify(f.j).includes(otpOf()),'OTP ไม่อยู่ในคำตอบที่ส่งกลับเว็บ');
  ok(mails.length===1&&mails[0].message.toRecipients[0].emailAddress.address==='somchai@x.com','OTP ส่งไปอีเมลของพนักงานจริง');
  const otp=otpOf();

  ok((await call('/auth/reset',{code:'E1',otp:'000000',challenge:f.j.challenge,newPin:'5678'})).s===401&&!writes.length,'OTP ผิด → 401 ไม่เปลี่ยน PIN');
  ok((await call('/auth/reset',{code:'E1',otp,challenge:f.j.challenge,newPin:'12'})).s===400,'PIN ไม่ใช่ตัวเลข 4-6 หลัก → ปฏิเสธ');
  ok((await call('/auth/reset',{code:'E1',otp,challenge:'1.abc',newPin:'5678'})).s===401,'challenge ปลอม → 401');
  const exp=parseInt(f.j.challenge.split('.')[0],10);
  ok((await call('/auth/reset',{code:'E1',otp,challenge:(exp-9999)+'.'+f.j.challenge.split('.')[1],newPin:'5678'})).s===401,'แก้เวลาหมดอายุใน challenge ไม่ได้');
  ok((await call('/auth/reset',{code:'R1',otp,challenge:f.j.challenge,newPin:'5678'})).s===401,'OTP ของคนหนึ่งใช้กับรหัสอื่นไม่ได้');

  const good=await call('/auth/reset',{code:'E1',otp,challenge:f.j.challenge,newPin:'5678'});
  ok(good.s===200&&writes.length===1,'OTP ถูก → ตั้ง PIN ใหม่สำเร็จ');
  ok(writes[0][1]===sha('5678')&&writes[0][2]==='of'&&writes[0][4]==='1'&&writes[0][5]==='Uline1','เขียนเฉพาะ PinHash — ระดับแบบฟอร์ม/ยกเว้นประเมิน/LINE ID เดิมยังอยู่');
  ok((await call('/auth/reset',{code:'E1',otp,challenge:f.j.challenge,newPin:'9999'})).s===401&&writes.length===1,'ใช้ OTP เดิมซ้ำไม่ได้ (ผูกกับ PinHash เดิม)');
  const lg=await call('/auth/login',{code:'E1',pin:'5678'});
  ok(lg.s===200&&lg.j.token,'ล็อกอินด้วย PIN ใหม่ได้');

  // กันเดา OTP: ผิด 5 ครั้งล็อก
  mails.length=0; const f2=await call('/auth/forgot',{code:'E1'});
  let last; for(let i=0;i<5;i++) last=await call('/auth/reset',{code:'E1',otp:String(100000+i),challenge:f2.j.challenge,newPin:'1111'});
  const lk=await call('/auth/reset',{code:'E1',otp:otpOf(),challenge:f2.j.challenge,newPin:'1111'});
  ok(lk.s===429,'ใส่ OTP ผิดครบ 5 ครั้ง → ล็อก แม้ OTP ถูก');
  // ขอ OTP ถี่เกิน
  let s429=0; for(let i=0;i<5;i++){ const r=await call('/auth/forgot',{code:'N2'+i}); } 
  mails.length=0; let blocked=false; for(let i=0;i<5;i++){ const r=await call('/auth/forgot',{code:'E1'}); if(r.s===429) blocked=true; }
  ok(blocked,'ขอ OTP เกิน 3 ครั้ง/รหัส → 429');
  ok((await w.fetch(new Request('https://w.example/auth/forgot',{method:'POST',body:'{}'}),{...ENV,SESSION_SECRET:''})).status===500,'ไม่ตั้ง SESSION_SECRET → ปฏิเสธ');

  // ===== หน้าเว็บ =====
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    const out={}; sessionStorage.clear();
    out.linkShown=!!document.getElementById('forgotLink');
    window.isMs365Configured=()=>true; window.isWorkerConfigured=()=>true;
    const calls=[];
    window.workerFetch=async(cfg,path,opt)=>{ calls.push({path,body:JSON.parse(opt.body)}); if(path==='/auth/forgot') return {challenge:'9.sig',maskedEmail:'so***@x.com',ttlMin:10}; if(path==='/auth/reset'){ if(JSON.parse(opt.body).otp==='111111') return {ok:true}; const e=new Error('รหัสยืนยันไม่ถูกต้อง'); e.status=401; throw e; } };
    document.getElementById('loginCode').value='E1';
    openForgotPin();
    out.opened=document.getElementById('forgotGate').style.display==='flex'&&document.getElementById('loginGate').style.display==='none';
    out.prefill=document.getElementById('forgotCode').value==='E1';
    await forgotSendOtp();
    out.step2=document.getElementById('forgotStep2').style.display==='block'&&/so\*\*\*@x\.com/.test(document.getElementById('forgotNote').textContent);
    const set=(id,v)=>document.getElementById(id).value=v;
    set('forgotOtp','111111'); set('forgotPin1','12'); set('forgotPin2','12'); await forgotSubmit();
    out.shortPinBlocked=/4-6/.test(document.getElementById('forgotErr').textContent)&&!calls.some(c=>c.path==='/auth/reset');
    set('forgotPin1','5678'); set('forgotPin2','5679'); await forgotSubmit();
    out.mismatchBlocked=/ไม่ตรงกัน/.test(document.getElementById('forgotErr').textContent)&&!calls.some(c=>c.path==='/auth/reset');
    set('forgotOtp','222222'); set('forgotPin1','5678'); set('forgotPin2','5678'); await forgotSubmit();
    out.badOtpShown=/ไม่ถูกต้อง/.test(document.getElementById('forgotErr').textContent)&&document.getElementById('forgotGate').style.display==='flex';
    set('forgotOtp','111111'); await forgotSubmit();
    const rc=calls.filter(c=>c.path==='/auth/reset').pop();
    out.sentReset=rc&&rc.body.code==='E1'&&rc.body.newPin==='5678'&&rc.body.challenge==='9.sig';
    out.backToLogin=document.getElementById('loginGate').style.display==='flex'&&document.getElementById('forgotGate').style.display==='none'&&document.getElementById('loginCode').value==='E1';
    out.pinCleared=document.getElementById('forgotPin1').value==='';
    // ไม่ตั้ง Proxy → บอกให้ติดต่อ HR
    window.isWorkerConfigured=()=>false; openForgotPin();
    out.noProxyMsg=/ติดต่อ HR/.test(document.getElementById('forgotErr').textContent);
    // workerFetch: 2 path นี้ไม่ต้องมีบัตรผ่าน
    window.fetch=async()=>({ok:true,status:200,text:async()=>'{}'});
    const realWF=(0,eval)('workerFetch');
    return out;
  });
  ok(r.linkShown,'มีลิงก์ "ลืม PIN?" ที่หน้าล็อกอิน');
  ok(r.opened&&r.prefill,'เปิดหน้าตั้ง PIN ใหม่ + เติมรหัสพนักงานที่พิมพ์ไว้');
  ok(r.step2,'ส่ง OTP แล้วขึ้นช่องกรอกรหัส + แสดงอีเมลที่ปิดบังบางส่วน');
  ok(r.shortPinBlocked,'PIN สั้นไป → ไม่ยิงเซิร์ฟเวอร์');
  ok(r.mismatchBlocked,'PIN สองช่องไม่ตรง → ไม่ยิงเซิร์ฟเวอร์');
  ok(r.badOtpShown,'OTP ผิด → แสดงข้อความจากเซิร์ฟเวอร์ ยังอยู่หน้าเดิม');
  ok(r.sentReset,'ส่ง code/otp/challenge/newPin ไป /auth/reset');
  ok(r.backToLogin&&r.pinCleared,'สำเร็จ → กลับหน้าล็อกอินพร้อมรหัสพนักงาน และล้างช่อง PIN');
  ok(r.noProxyMsg,'ไม่ได้ตั้ง Proxy → แจ้งให้ติดต่อ HR');
  const o2=await open(); await o2.p.evaluate(INJECT);
  const pub=await o2.p.evaluate(async()=>{ sessionStorage.clear(); let urls=[]; window.fetch=async(u)=>{urls.push(u);return {ok:true,status:200,text:async()=>'{}'};}; for(const pa of ['/auth/forgot','/auth/reset','/rows?table=X']){ try{ await workerFetch({workerUrl:'https://w'},pa,{method:'POST',body:'{}'}); }catch(e){} } return urls; });
  ok(pub.length===2&&pub.every(u=>/\/auth\//.test(u)),'/auth/forgot และ /auth/reset ยิงได้โดยไม่ต้องมีบัตรผ่าน แต่ path อื่นยังถูกบล็อก');
  ok(errs.length===0,'ไม่มี pageerror '+errs.join('|'));
  await b.close(); await o2.b.close(); done();
})();
