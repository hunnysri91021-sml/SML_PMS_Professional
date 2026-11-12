/* Regression: หน้า "ตั้งค่ารอบประเมิน" ไม่มีป้าย FY2026/PMS v3 ตายตัวและไม่มีตัวเลือกปลอม (#309) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(()=>{ const a=MASTER_USERS.find(u=>u[2]==='sysadmin'&&u[12]==='active'); CURRENT_SESSION_USER=a; applySession(a); });
  await p.evaluate(()=>document.querySelector('.nav-item[data-pg="cyclesetup"]').click());
  const t=await p.evaluate(()=>({h:document.getElementById('csHeroCycle').textContent,a:document.getElementById('csCycleName').textContent,b:document.getElementById('csCycleName2').textContent,sec:document.getElementById('pg-cyclesetup').innerText}));
  ok(t.h!=='—'&&t.a!=='—'&&t.b!==('—'),'ชื่อรอบแสดงจากข้อมูลจริง '+t.a);
  ok(!/PMS Standard SML v3|PMS v3|LINE OA \+ Email/.test(t.sec),'ไม่มีตัวเลือกปลอมค้างอยู่');
  ok(/Cron/.test(t.sec)&&/ส่ง Reminder/.test(t.sec),'อธิบายเตือนอัตโนมัติ (Cron) และปุ่มส่งเอง');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
