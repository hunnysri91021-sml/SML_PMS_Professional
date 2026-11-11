/* เปิดใช้งานครั้งแรกด้วยรหัสจาก HR + OTP อีเมล + ตั้ง PIN เอง (#303) */
const crypto=require('crypto'); const path=require('path');
const {ok,done,open,INJECT}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com'};
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
// Employees: id,name,role,group,section,division,dept,position,startDate,email,...,status(15)
let EMPS=[
  ['N1','ใหม่ไม่มีอีเมล','emp','','','','','','','','','','','','','active'],
  ['N2','ใหม่มีอีเมล','emp','','','','','','','n2@x.com','','','','','','active'],
  ['H1','มี PIN แล้ว','emp','','','','','','','h1@x.com','','','','','','active'],
  ['R1','ลาออก','emp','','','','','','','r1@x.com','','','','','','resigned'],
  ['A1','แอดมิน','admin','','','','','','','a1@x.com','','','','','','active'],
];
let SETS=[['H1',sha('1111'),'','','0',''],['A1',sha('9999'),'','','0','']];
const mails=[], emailPatches=[], setWrites=[];
function mockFetch(){
  global.fetch=async(url,opt={})=>{
    const u=String(url); const m=opt.method||'GET';
    const j=(o)=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)});
    if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
    if(u.includes('/drive/root:')) return j({id:'ITEM'});
    if(u.includes('/drive')&&!u.includes('/rows')&&!u.includes('/range')) return j({id:'DRV'});
    if(u.includes('/sites/')&&!u.includes('/rows')) return j({id:'SITE'});
    if(u.includes("tables('Employees')/rows")&&m==='GET'&&!u.includes('itemAt')) return j({value:EMPS.map((r,i)=>({index:i,values:[r]}))});
    if(u.includes("tables('EmployeeSettings')/rows")&&m==='GET'&&!u.includes('itemAt')) return j({value:SETS.map((r,i)=>({index:i,values:[r]}))});
    if(/itemAt\(index=\d+\)\/range$/.test(u)) { const i=+/index=(\d+)/.exec(u)[1]; return j({address:'Employees!A'+(i+2)+':P'+(i+2)}); }
    if(u.includes("/range(address=")&&m==='PATCH'){ emailPatches.push({u:decodeURIComponent(u),v:JSON.parse(opt.body).values[0]}); return j({}); }
    if(u.includes("tables('EmployeeSettings')/rows/itemAt")&&m==='PATCH'){ const v=JSON.parse(opt.body).values[0]; setWrites.push(v); SETS=SETS.filter(r=>r[0]!==v[0]).concat([v]); return j({}); }
    if(u.includes("tables('EmployeeSettings')/rows/add")&&m==='POST'){ const v=JSON.parse(opt.body).values[0]; setWrites.push(v); SETS.push(v); return j({}); }
    if(u.includes('/sendMail')){ mails.push(JSON.parse(opt.body)); return j({}); }
    return j({value:[]});
  };
}
(async()=>{
  mockFetch();
  const mod=await import(W+'?'+Math.random()); const w=mod.default;
  const call=async(p,body,tok)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method:'POST',headers:Object.assign({'content-type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:JSON.stringify(body)}),ENV); let j={}; try{j=await r.json();}catch(e){} return {s:r.status,j}; };
  const otpOf=()=>/คือ: (\d{6})/.exec(mails[mails.length-1].message.body.content)[1];
  const adm=(await call('/auth/login',{code:'A1',pin:'9999'})).j.token;

  // ออกรหัส: เฉพาะ Admin
  const anon=await call('/admin/activation-codes',{});
  ok(anon.s===401,'ไม่ล็อกอิน → ออกรหัสไม่ได้');
  const bulk=await call('/admin/activation-codes',{},adm);
  ok(bulk.s===200&&bulk.j.codes.map(c=>c.code).sort().join()==='N1,N2','ออกรหัสให้ทุกคนที่ยังไม่มี PIN (ไม่รวมคนมี PIN/ลาออก)');
  ok(bulk.j.codes.every(c=>/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c.activation)),'รูปแบบรหัส XXXX-XXXX-XXXX');
  ok((await call('/admin/activation-codes',{empCode:'H1'},adm)).s===400,'คนที่มี PIN แล้ว → ออกรหัสให้ไม่ได้');
  const one=await call('/admin/activation-codes',{empCode:'N1',days:7},adm);
  const A1code=one.j.codes[0].activation;

  // เริ่ม: ตรวจรหัส
  const bad=await call('/auth/activate/start',{code:'N1',activation:'AAAA-AAAA-AAAA',email:'n1@x.com'});
  ok(bad.s===401&&!mails.length,'รหัสเปิดใช้งานผิด → 401 ไม่ส่งอีเมล');
  ok((await call('/auth/activate/start',{code:'N2',activation:A1code,email:'n1@x.com'})).s===401,'รหัสของคนหนึ่งใช้กับรหัสพนักงานอื่นไม่ได้');
  ok((await call('/auth/activate/start',{code:'N1',activation:A1code,email:'ไม่ใช่อีเมล'})).s===400,'อีเมลรูปแบบผิด → ปฏิเสธ');
  const st=await call('/auth/activate/start',{code:'N1',activation:A1code,email:'n1@x.com'});
  ok(st.s===200&&st.j.challenge&&!st.j.usedOnFile&&/^n1\*\*\*@x\.com$|^n\*@x\.com$|\*/.test(st.j.maskedEmail),'รหัสถูก → ส่ง OTP ไปอีเมลที่กรอก (ยังไม่มีอีเมลในระบบ)');
  ok(mails[0].message.toRecipients[0].emailAddress.address==='n1@x.com'&&!JSON.stringify(st.j).includes(otpOf()),'OTP ส่งไปอีเมลที่กรอก และไม่อยู่ในคำตอบกลับ');
  const otp=otpOf();

  // จบ: OTP/PIN
  ok((await call('/auth/activate/finish',{code:'N1',activation:A1code,email:'n1@x.com',otp:'000000',challenge:st.j.challenge,newPin:'4321'})).s===401&&!setWrites.length,'OTP ผิด → ไม่เขียนอะไร');
  ok((await call('/auth/activate/finish',{code:'N1',activation:A1code,email:'evil@x.com',otp,challenge:st.j.challenge,newPin:'4321'})).s===401,'เปลี่ยนอีเมลหลังได้ OTP ไม่ได้ (OTP ผูกกับอีเมล)');
  ok((await call('/auth/activate/finish',{code:'N1',activation:A1code,email:'n1@x.com',otp,challenge:st.j.challenge,newPin:'12'})).s===400,'PIN ไม่ใช่ตัวเลข 4-6 หลัก → ปฏิเสธ');
  const fin=await call('/auth/activate/finish',{code:'N1',activation:A1code,email:'n1@x.com',otp,challenge:st.j.challenge,newPin:'4321'});
  ok(fin.s===200&&fin.j.emailRegistered===true,'สำเร็จ → ลงทะเบียนอีเมล + ตั้ง PIN');
  ok(emailPatches.length===1&&emailPatches[0].u.includes('Employees!J2:J2')&&emailPatches[0].v[0]==='n1@x.com','เขียนอีเมลเฉพาะคอลัมน์ J ของแถวพนักงาน (ไม่แตะคอลัมน์อื่น)');
  ok(setWrites.some(v=>v[0]==='N1'&&v[1]===sha('4321')),'เขียน PinHash ลง EmployeeSettings');
  ok((await call('/auth/login',{code:'N1',pin:'4321'})).s===200,'ล็อกอินด้วย PIN ใหม่ได้');
  ok((await call('/auth/activate/start',{code:'N1',activation:A1code,email:'n1@x.com'})).s===400,'รหัสเปิดใช้งานใช้ซ้ำไม่ได้หลังตั้ง PIN แล้ว');

  // คนที่ HR ลงอีเมลไว้แล้ว → ใช้อีเมลนั้น ไม่รับอีเมลที่กรอก
  mails.length=0; emailPatches.length=0;
  const c2=bulk.j.codes.find(c=>c.code==='N2').activation;
  const s2=await call('/auth/activate/start',{code:'N2',activation:c2,email:'attacker@evil.com'});
  ok(s2.s===200&&s2.j.usedOnFile&&mails[0].message.toRecipients[0].emailAddress.address==='n2@x.com','มีอีเมลใน Excel แล้ว → OTP ไปที่อีเมลนั้น ไม่ใช่อีเมลที่กรอก');
  const f2=await call('/auth/activate/finish',{code:'N2',activation:c2,email:'attacker@evil.com',otp:otpOf(),challenge:s2.j.challenge,newPin:'5555'});
  ok(f2.s===200&&f2.j.emailRegistered===false&&!emailPatches.length,'ไม่เขียนทับอีเมลที่ HR ลงไว้');

  // รหัสหมดอายุ
  const real=Date.now; Date.now=()=>real()+40*86400000;
  ok((await call('/auth/activate/start',{code:'N1',activation:A1code,email:'n1@x.com'})).s!==200,'ผ่านไป 40 วัน → ใช้ไม่ได้');
  Date.now=real;

  // กันเดารหัส
  EMPS.push(['N3','สาม','emp','','','','','','','','','','','','','active']);
  let last; for(let i=0;i<5;i++) last=await call('/auth/activate/start',{code:'N3',activation:'ZZZZ-ZZZZ-Z'+(i+2)+'ZZ',email:'n3@x.com'});
  const g=await call('/auth/activate/start',{code:'N3',activation:'AAAA-AAAA-AAAA',email:'n3@x.com'});
  ok(g.s===429,'ใส่รหัสผิด 5 ครั้ง → ล็อก');

  // ===== หน้าเว็บ =====
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    const out={}; sessionStorage.clear();
    out.links=!!document.getElementById('activateLink')&&!!document.getElementById('actBulkBtn')&&!!document.querySelector('[onclick^="issueActivationCodes(document"]');
    window.isMs365Configured=()=>true; window.isWorkerConfigured=()=>true;
    const calls=[];
    window.workerFetch=async(cfg,path,opt)=>{ const body=opt&&opt.body?JSON.parse(opt.body):{}; calls.push({path,body});
      if(path==='/auth/activate/start') return {challenge:'9.sig',maskedEmail:'n1***@x.com',usedOnFile:false,ttlMin:10};
      if(path==='/auth/activate/finish'){ if(body.otp==='111111') return {ok:true}; const e=new Error('รหัสยืนยันอีเมลไม่ถูกต้อง'); e.status=401; throw e; }
      if(path==='/admin/activation-codes') return {codes:[{code:'N1',name:'ทดสอบ',activation:'ABCD-EFGH-JKLM',days:14,email:''}]}; };
    document.getElementById('loginCode').value='N1';
    openActivate();
    out.opened=document.getElementById('activateGate').style.display==='flex'&&document.getElementById('actCode').value==='N1';
    const set=(id,v)=>document.getElementById(id).value=v;
    await activateStart(); out.needFields=/กรุณากรอก/.test(document.getElementById('actErr').textContent)&&!calls.length;
    set('actCodeAct','ABCD-EFGH-JKLM'); set('actEmail','n1@x.com'); await activateStart();
    out.step2=document.getElementById('actStep2').style.display==='block'&&/n1\*\*\*@x\.com/.test(document.getElementById('actNote').textContent)&&calls[0].body.activation==='ABCD-EFGH-JKLM'&&calls[0].body.email==='n1@x.com';
    set('actOtp','111111'); set('actPin1','12'); set('actPin2','12'); await activateFinish();
    out.shortPin=/4-6/.test(document.getElementById('actErr').textContent)&&calls.length===1;
    set('actPin1','5678'); set('actPin2','5679'); await activateFinish(); out.mismatch=/ไม่ตรงกัน/.test(document.getElementById('actErr').textContent)&&calls.length===1;
    set('actOtp','222222'); set('actPin2','5678'); await activateFinish(); out.badOtp=/ไม่ถูกต้อง/.test(document.getElementById('actErr').textContent)&&document.getElementById('activateGate').style.display==='flex';
    set('actOtp','111111'); await activateFinish();
    out.done=document.getElementById('loginGate').style.display==='flex'&&document.getElementById('loginCode').value==='N1'&&document.getElementById('actPin1').value==='';
    // admin ออกรหัส
    CURRENT_SESSION_USER=['A1','แอดมิน','admin']; let alertMsg=''; window.alert=m=>alertMsg=m;
    await issueActivationCodes('N1'); out.adminOne=/ABCD-EFGH-JKLM/.test(alertMsg)&&calls.filter(c=>c.path==='/admin/activation-codes').pop().body.empCode==='N1';
    let csv=null; window.downloadCsv=(f,h,rows)=>{csv={f,h,rows};}; window.confirm=()=>true;
    await issueActivationCodes(''); out.adminBulk=csv&&csv.rows[0][2]==='ABCD-EFGH-JKLM'&&/รหัสเปิดใช้งาน/.test(csv.f);
    CURRENT_SESSION_USER=['E9','พนง','emp']; calls.length=0; await issueActivationCodes('N1'); out.nonAdmin=calls.filter(c=>c.path==='/admin/activation-codes').length===0;
    return out;
  });
  ok(r.links,'มีลิงก์เปิดใช้งานที่หน้าล็อกอิน + ปุ่ม HR ออกรหัส (รายคน/ทั้งหมด)');
  ok(r.opened&&r.needFields,'เปิดหน้า + ต้องกรอกรหัสก่อนส่ง');
  ok(r.step2,'ส่งแล้วขึ้นช่อง OTP/PIN พร้อมอีเมลที่ปิดบังบางส่วน');
  ok(r.shortPin&&r.mismatch,'PIN สั้นไป/ไม่ตรงกัน → ไม่ยิงเซิร์ฟเวอร์');
  ok(r.badOtp,'OTP ผิด → แสดงข้อความ ยังอยู่หน้าเดิม');
  ok(r.done,'สำเร็จ → กลับหน้าล็อกอินพร้อมรหัสพนักงาน ล้างช่อง PIN');
ok(r.adminOne&&r.adminBulk,'Admin ออกรหัสรายคน (alert) และทั้งหมด (ดาวน์โหลดไฟล์)');
  ok(r.nonAdmin,'ไม่ใช่ Admin → ไม่ยิงเซิร์ฟเวอร์');
  ok(errs.length===0,'ไม่มี pageerror '+errs.join('|'));
  await b.close(); done();
})();
