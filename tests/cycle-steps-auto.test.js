/* #282: สถานะขั้นตอนรอบประเมินคำนวณจากใบประเมินจริง */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    localStorage.removeItem('smlPmsCycleSteps');
    const yr=getCurrentEvalCycleYear(); const cyc=cyclesList.find(c=>String(c.year)===String(yr))||cyclesList[0];
    const parts=getEvalParticipants(); const steps=defaultCycleSteps();
    const st=()=>computeCycleStepStatuses(steps,cyc.year).map(x=>x.status).join();
    const out={n:parts.length}; out.empty=st();
    const mk=(u,status)=>{ const d=__draft(u[0],status,80); return d; };
    // ทุกคนส่งแล้ว: ขั้น 1 เสร็จ ขั้น 2 กำลังดำเนินการ
    parts.forEach(u=>__draft(u[0],'Submitted',80)); out.allSub=st();
    // ครึ่งหนึ่งถึง L1Reviewed: ขั้น 2 ยังไม่เสร็จ (active)
    parts.forEach((u,i)=>{ if(i<parts.length/2) __draft(u[0],'L1Reviewed',80); }); out.half=st();
    // ทุกคนถึง Approved: ทุกขั้นเสร็จ
    parts.forEach(u=>__draft(u[0],'Approved',80)); out.allApproved=st();
    // ขั้นที่ตั้งสถานะเอง
    const manual=[{name:'x',stage:'',status:'done'}]; out.manual=computeCycleStepStatuses(manual,cyc.year)[0].status;
    return out;
  });
  ok(r.n>0,'มีผู้เข้าร่วม '+r.n);
  const s0=r.empty.split(','); ok(s0[0]==='active'&&s0.slice(1).every(x=>x==='wait'),'ยังไม่มีใครส่ง: ขั้นแรก active ที่เหลือ wait ('+r.empty+')');
  const s1=r.allSub.split(','); ok(s1[0]==='done'&&s1[1]==='active'&&s1[2]==='wait','ทุกคนส่งแล้ว: 1 เสร็จ/2 active ('+r.allSub+')');
  const s2=r.half.split(','); ok(s2[0]==='done'&&s2[1]==='active','ครึ่งหนึ่งผ่านขั้น 2: ยัง active ('+r.half+')');
  ok(r.allApproved.split(',').every(x=>x==='done'),'ทุกคน Approved: ทุกขั้นเสร็จ ('+r.allApproved+')');
  ok(r.manual==='done','ขั้นที่ไม่ผูกใช้สถานะที่ตั้งเอง');
  await p.evaluate(()=>{ CURRENT_SESSION_USER=MASTER_USERS.find(u=>u[2]==='sysadmin')||MASTER_USERS[0]; CURRENT_SESSION_USER[2]='sysadmin'; document.querySelector('.nav-item[data-pg="cycle"]').click(); });
  await p.waitForTimeout(200);
  ok(await p.evaluate(()=>/\d+\/\d+ คน/.test(document.getElementById('cycleStepsRows').innerText)),'ตารางแสดงความคืบหน้า x/y คน');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
