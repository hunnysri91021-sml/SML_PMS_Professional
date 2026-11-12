/* Regression: หน้าตั้งค่ารอบ มีสวิตช์เตือนอัตโนมัติ (เฉพาะ Admin) บันทึกที่ FormWeights __autoremind__ + ดูผลทดลอง (CLAUDE.md #310) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(()=>{ const a=MASTER_USERS.find(u=>u[2]==='sysadmin'&&u[12]==='active'); CURRENT_SESSION_USER=a; applySession(a); });
  await p.evaluate(()=>document.querySelector('.nav-item[data-pg="cyclesetup"]').click());
  await p.waitForTimeout(300);
  ok(await p.evaluate(()=>document.getElementById('autoRemindBox').style.display!=='none'),'Admin เห็นสวิตช์เตือนอัตโนมัติ');
  const saved=await p.evaluate(async()=>{
    window.__w=null; window.isMs365Configured=()=>true; window.isWorkerConfigured=()=>true;
    window.graphUpsertTableRow=async(t,k,v,row)=>{ window.__w={t,k,v,row}; };
    document.getElementById('arOn').value='1'; document.getElementById('arLine').checked=false;
    await saveAutoRemind(); return window.__w;
  });
  ok(saved&&saved.t==='FormWeights'&&saved.v==='__autoremind__','บันทึกลง FormWeights แถว __autoremind__');
  const st=saved&&JSON.parse(saved.row[1]);
  ok(st&&st.on===true&&st.email===true&&st.line===false,'เก็บสวิตช์/ช่องทางถูกต้อง');
  await p.evaluate(()=>{ window.workerFetch=async()=>({date:'2026-11-12',items:[{step:'ประเมินตนเอง',days:3,end:'2026-11-15',pending:5,selfRecipients:5,adminRecipients:1}],channels:{email:true,line:false}}); });
  await p.evaluate(()=>previewAutoRemind());
  ok(await p.evaluate(()=>/ประเมินตนเอง/.test(document.getElementById('arResult').innerText)&&/ค้าง 5/.test(document.getElementById('arResult').innerText)),'ปุ่มดูผลทดลองแสดงรายการที่จะส่ง');
  await p.evaluate(()=>{ const u=MASTER_USERS.find(x=>x[2]==='emp'&&x[12]==='active'); CURRENT_SESSION_USER=u; loadAutoRemindUi(); });
  ok(await p.evaluate(()=>document.getElementById('autoRemindBox').style.display==='none'),'ไม่ใช่ Admin → ซ่อนสวิตช์');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
