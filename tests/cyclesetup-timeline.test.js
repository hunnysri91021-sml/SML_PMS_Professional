/* Regression: ไทม์ไลน์ในหน้า "ตั้งค่ารอบประเมิน" ดึงจากกำหนดการจริง (CLAUDE.md #237) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(()=>{ const a=MASTER_USERS.find(u=>u[2]==='sysadmin'&&u[12]==='active'); CURRENT_SESSION_USER=a; applySession(a); });
  await p.evaluate(()=>document.querySelector('.nav-item[data-pg="cyclesetup"]').click());
  const n=await p.evaluate(()=>document.querySelectorAll('#cycleSetupTimeline .cycle-step').length);
  ok(n>0,'ไทม์ไลน์มีขั้นตอนจากข้อมูลจริง ('+n+')');
  ok(await p.evaluate(()=>parseInt(document.getElementById('csStepBadge').textContent)===document.querySelectorAll('#cycleSetupTimeline .cycle-step').length),'badge จำนวนขั้นตอนตรงกับไทม์ไลน์');
  await p.evaluate(()=>{ const cid=(cyclesList.find(c=>String(c.year)===String(getCurrentEvalCycleYear()))||cyclesList[0]).id; const s=getCycleSteps(cid)||defaultCycleSteps(); s[0].name='ชื่อทดสอบ'; s[0].status='done'; putCycleSteps(cid,s); });
  ok(await p.evaluate(()=>document.querySelector('#cycleSetupTimeline .cycle-step.done b')?.textContent==='ชื่อทดสอบ'),'แก้ที่หน้า "รอบประเมิน" แล้วไทม์ไลน์อัปเดตตาม');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
