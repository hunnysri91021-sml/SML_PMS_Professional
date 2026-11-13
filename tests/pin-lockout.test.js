/* ล็อก PIN ผิดซ้ำ (#258) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(()=>{ window.ensurePdpaAck=async()=>true; }); // ข้ามหน้าต่าง PDPA (ทดสอบแยกใน pdpa-ack.test.js)
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.isMs365Configured=()=>false;
    localStorage.removeItem(LOGIN_FAIL_KEY);
    const emp=__emp('LK1',{name:'ทดสอบ',role:'emp'}); emp[17]=await sha256Hex('1234');
    const out={}; const err=()=>document.getElementById('loginErr').textContent;
    const tryLogin=async pin=>{ CURRENT_SESSION_USER=null; document.getElementById('loginCode').value='LK1'; document.getElementById('loginPin').value=pin; await doLogin(); };
    for(let i=0;i<4;i++) await tryLogin('0000');
    out.warn=/เหลืออีก 1 ครั้ง/.test(err());
    await tryLogin('0000'); out.locked=/ล็อก/.test(err()) && loginLockRemainingMin('LK1')>0;
    await tryLogin('1234'); out.correctBlocked=CURRENT_SESSION_USER===null && /ลองใหม่ในอีก/.test(err());
    const f=_loginFails(); f.LK1.until=Date.now()-1000; localStorage.setItem(LOGIN_FAIL_KEY,JSON.stringify(f));
    await tryLogin('1234'); out.unlocked=!!CURRENT_SESSION_USER && !_loginFails().LK1;
    return out;
  });
  ok(r.warn,'เตือนจำนวนครั้งที่เหลือ'); ok(r.locked,'ผิดครบ 5 ครั้งถูกล็อก');
  ok(r.correctBlocked,'ระหว่างล็อก PIN ถูกก็เข้าไม่ได้'); ok(r.unlocked,'หมดเวลาล็อกแล้วเข้าได้และล้างตัวนับ');
  ok(errs.length===0,'ไม่มี pageerror '+errs.join('|'));
  await b.close(); done();
})();
