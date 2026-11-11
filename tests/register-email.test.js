/* พนักงานลงทะเบียนอีเมลเอง → Excel → HR กดส่ง PIN (#304) */
const crypto=require('crypto'); const path=require('path');
const {ok,done,open,INJECT}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com'};
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
let EMPS=[
  ['N1','ใหม่ไม่มีอีเมล','emp','','','','','','','','','','','','','active'],
  ['N2','มีอีเมลแล้ว','emp','','','','','','','n2@x.com','','','','','','active'],
  ['H1','มี PIN แล้ว','emp','','','','','','','','','','','','','active'],
  ['R1','ลาออก','emp','','','','','','','','','','','','','resigned'],
];
let SETS=[['H1',sha('1111'),'','','0','']];
const patches=[];
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
    if(u.includes("/range(address=")&&m==='PATCH'){ patches.push({u:decodeURIComponent(u),v:JSON.parse(opt.body).values[0]}); return j({}); }
    return j({value:[]});
  };
}
(async()=>{
  mockFetch();
  const mod=await import(W+'?'+Math.random()); const w=mod.default;
  const call=async(p,body,env)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env||ENV); let j={}; try{j=await r.json();}catch(e){} return {s:r.status,j}; };

  ok((await call('/auth/register-email',{code:'N1',email:'bad'})).s===400,'อีเมลรูปแบบผิด → ปฏิเสธ');
  const r=await call('/auth/register-email',{code:'N1',email:'n1@x.com'});
  ok(r.s===200&&patches.length===1&&patches[0].u.includes('Employees!J2:J2')&&patches[0].v[0]==='n1@x.com','ลงทะเบียน → เขียนเฉพาะคอลัมน์ J ของแถวพนักงาน');
  ok(!JSON.stringify(r.j).includes('n1@x.com'),'คำตอบไม่คืนอีเมลเต็ม');
  for(const c of ['N2','H1','R1','ZZ']){
    const n=patches.length; const x=await call('/auth/register-email',{code:c,email:'a@x.com'});
    ok(x.s===400&&patches.length===n,'ลงไม่ได้: '+c+' (มีอีเมล/มี PIN/ลาออก/ไม่พบ) และไม่เขียนอะไร');
  }
  // domain
  const E2=Object.assign({},ENV,{REGISTER_EMAIL_DOMAINS:'x.com'});
  const d=await call('/auth/register-email',{code:'N1',email:'a@gmail.com'},E2);
  ok(d.s===400&&/@x\.com/.test(d.j.error),'ตั้ง REGISTER_EMAIL_DOMAINS แล้วอีเมลนอกโดเมนถูกปฏิเสธ');
  // forgot ต้องไม่ทำงานกับบัญชีที่ยังไม่มี PIN (กัน takeover ผ่านอีเมลที่ลงเอง)
  EMPS[0][9]='n1@x.com';
  const f=await call('/auth/forgot',{code:'N1'});
  ok(f.s===400,'บัญชีไม่มี PIN → "ลืม PIN" ใช้ไม่ได้ (ต้องให้ HR ส่ง PIN)');
  // rate limit
  let last; for(let i=0;i<5;i++) last=await call('/auth/register-email',{code:'ZZ9',email:'a@x.com'});
  ok(last.s===429,'ลองถี่เกินไป → 429');

  // UI
  const {b:browser,p:page,errs:errors}=await open();
  await page.evaluate(()=>{ window.__calls=[]; window.workerFetch=async(c,p,o)=>{ window.__calls.push({p,b:JSON.parse(o.body)}); return {ok:true,maskedEmail:'n1***@x.com'}; }; window.useServerAuth=()=>true; });
  await page.evaluate(()=>openRegEmail());
  ok(await page.evaluate(()=>getComputedStyle(document.getElementById('regEmailGate')).display==='flex'),'เปิดหน้าลงทะเบียนอีเมล');
  await page.fill('#regCode','N1'); await page.fill('#regEmail','n1@x.com'); await page.fill('#regEmail2','other@x.com');
  await page.evaluate(()=>registerEmailSubmit());
  ok(await page.evaluate(()=>window.__calls.length===0&&/ไม่ตรงกัน/.test(document.getElementById('regErr').textContent)),'อีเมลสองช่องไม่ตรง → ไม่ส่ง');
  await page.fill('#regEmail2','N1@x.com');
  await page.evaluate(()=>registerEmailSubmit());
  await page.waitForTimeout(100);
  ok(await page.evaluate(()=>window.__calls.length===1&&window.__calls[0].p==='/auth/register-email'&&window.__calls[0].b.code==='N1'&&/รอ HR/.test(document.getElementById('regErr').textContent)),'ส่งลงทะเบียนสำเร็จ + แจ้งรอ HR');

  // HR ส่ง PIN
  const res=await page.evaluate(async()=>{
    const sent=[]; let conf='';
    window.ms365SyncEmployees=async()=>{}; window.ms365SyncEmployeeSettingsSilent=async()=>{};
    window.isWorkerConfigured=()=>true;
    window.tryEmailPin=async(emp,pin)=>{ if(emp[0]==='BAD') return {sent:false,reason:'x'}; sent.push([emp[0],pin]); return {sent:true}; };
    window.pushSingleEmployeeSettings=async()=>{}; window.confirm=m=>{conf=m;return true;}; window.alert=()=>{};
    const base=MASTER_USERS[0].slice();
    const mk=(id,email,pin,st)=>{const u=base.slice();u[0]=id;u[1]='T'+id;u[12]=st||'active';u[15]=email;u[17]=pin||'';return u;};
    MASTER_USERS.push(mk('T1','t1@x.com'),mk('T2','t2@x.com','hash'),mk('T3',''),mk('T4','t4@x.com','','resigned'),mk('BAD','bad@x.com'));
    CURRENT_SESSION_USER=MASTER_USERS.find(u=>u[2]==='admin')||MASTER_USERS[0];
    window.isAdminOrSysadmin=()=>true;
    await sendPinToRegistered();
    const get=id=>MASTER_USERS.find(u=>u[0]===id);
    return {sent:sent.map(s=>s[0]),conf,t1:!!get('T1')[17],bad:!!get('BAD')[17],t2:get('T2')[17]};
  });
  ok(res.sent.includes('T1')&&!res.sent.includes('T2')&&!res.sent.includes('T3')&&!res.sent.includes('T4'),'ส่ง PIN เฉพาะคนมีอีเมล+ไม่มี PIN+active');
  ok(res.t1&&!res.bad&&res.t2==='hash','ส่งสำเร็จ = ตั้ง PIN, ส่งไม่ได้ = ไม่ตั้ง PIN, คนมี PIN เดิมไม่ถูกแตะ');
  ok(/t1@x\.com/.test(res.conf),'confirm แสดงอีเมลให้ HR ตรวจก่อน');
  ok(errors.length===0,'ไม่มี JS error: '+errors.join('|'));
  await browser.close(); done();
})();
