/* เว็บ: ล็อกอินผ่าน Worker + แนบบัตรผ่าน (#260) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    window.__pushes=[];
    const out={}; sessionStorage.clear();
    const emp=__emp('SV1',{name:'ทดสอบ',role:'emp'}); emp[17]='';
    // ไม่มีกุญแจ API ฝังในโค้ดแล้ว
    out.noKey=!('workerApiKey' in DEFAULT_MS365_CONFIG) || !DEFAULT_MS365_CONFIG.workerApiKey;
    out.cfgOk=isWorkerConfigured({workerUrl:'https://w'})===true && isWorkerConfigured({workerUrl:''})===false;
    // workerFetch: ไม่มีบัตร → ไม่ยิงเครือข่าย
    let called=0; const realFetch=window.fetch;
    window.fetch=async(url,opt)=>{ called++; out.lastUrl=url; out.lastHeaders=opt.headers; return {ok:true,status:200,text:async()=>JSON.stringify({rows:[]})}; };
    let threw=false; try{ await workerFetch({workerUrl:'https://w'},'/rows?table=Employees'); }catch(e){ threw=e.status===401; }
    out.noTokenBlocked=threw && called===0;
    sessionStorage.setItem(WORKER_TOKEN_KEY,'TOK123');
    await workerFetch({workerUrl:'https://w'},'/rows?table=Employees');
    out.sendsBearer=out.lastHeaders['Authorization']==='Bearer TOK123' && !out.lastHeaders['X-Api-Key'];
    window.fetch=realFetch;
    // doLogin ผ่าน Worker (ตั้ง MS365+Proxy)
    sessionStorage.removeItem(WORKER_TOKEN_KEY);
    window.isMs365Configured=()=>true;
    window.isWorkerConfigured=()=>true;
    window.ms365SyncEmployees=async()=>0; window.ms365SyncEmployeeSettingsSilent=async()=>0;
    const loginCalls=[];
    window.workerFetch=async(cfg,path,opt)=>{ loginCalls.push({path,body:opt&&opt.body}); if(path==='/auth/login'){ const b=JSON.parse(opt.body); if(b.pin==='1234') return {token:'T-OK'}; const e=new Error('รหัสพนักงานหรือ PIN ไม่ถูกต้อง'); e.status=401; throw e; } return {rows:[]}; };
    const tryLogin=async pin=>{ CURRENT_SESSION_USER=null; document.getElementById('loginCode').value='SV1'; document.getElementById('loginPin').value=pin; await doLogin(); };
    localStorage.removeItem(LOGIN_FAIL_KEY);
    await tryLogin('0000');
    out.wrongBlocked=CURRENT_SESSION_USER===null && /ไม่ถูกต้อง/.test(document.getElementById('loginErr').textContent) && !getWorkerToken();
    await tryLogin('1234');
    out.okLogin=!!CURRENT_SESSION_USER && CURRENT_SESSION_USER[0]==='SV1' && getWorkerToken()==='T-OK';
    out.loginSentPin=loginCalls.some(c=>c.path==='/auth/login'&&JSON.parse(c.body).code==='SV1');
    // ไม่ใช้ PIN ในเครื่องเมื่อ server ยืนยันแล้ว (hash ว่างก็เข้าได้เพราะ server ตรวจแล้ว)
    out.noLocalPinNeeded=out.okLogin;
    // ล็อกเอาต์ล้างบัตร
    clearWorkerToken(); out.cleared=!getWorkerToken();
    // เซสชันค้างแต่ไม่มีบัตร → ไม่คืนสถานะ (ต้องล็อกอินใหม่)
    out.useServerAuth=useServerAuth()===true;
    return out;
  });
  ok(r.noKey,'ไม่มีกุญแจ API ฝังใน DEFAULT_MS365_CONFIG');
  ok(r.cfgOk,'isWorkerConfigured ดูแค่ URL');
  ok(r.noTokenBlocked,'ไม่มีบัตรผ่าน → workerFetch ไม่ยิงเครือข่าย (401)');
  ok(r.sendsBearer,'แนบ Authorization: Bearer และไม่ใช้ X-Api-Key');
  ok(r.wrongBlocked,'PIN ผิดที่ Worker → เข้าไม่ได้ ไม่เก็บบัตร');
  ok(r.okLogin,'PIN ถูกที่ Worker → เข้าได้และเก็บบัตรผ่าน');
  ok(r.loginSentPin,'ส่งรหัส+PIN ไปที่ /auth/login');
  ok(r.cleared,'clearWorkerToken ล้างบัตร');
  ok(r.useServerAuth,'useServerAuth จริงเมื่อตั้ง MS365+Proxy');
  ok(errs.length===0,'ไม่มี pageerror '+errs.join('|'));
  await b.close(); done();
})();
