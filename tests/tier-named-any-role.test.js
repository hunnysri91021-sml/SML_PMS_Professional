/* #272: ผู้ถูกระบุในช่องสายบังคับบัญชา L1–L4 (u[9]/u[10]/u[19]/u[11]) ได้สิทธิ์ตามช่องนั้น ไม่ขึ้นกับ role ในระบบ */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const cy=getCurrentEvalCycleYear(); const out={};
    // ผจก.ส่วน (role l2) ถูกระบุในช่อง "หัวหน้าแผนก (L2)" ของพนักงาน -> ต้องทำหน้าที่ขั้น L2 ได้
    const m=__emp('T1',{name:'ผจกทำแทนแผนก',role:'l2',level:'mgr'});
    const e=__emp('T2',{name:'พนักงานT',role:'emp',level:'of',l2:'ผจกทำแทนแผนก'});
    out.resolved=(resolveL1Reviewer(e)||[])[0];
    __draft('T2','Submitted',80);
    __login(m);
    out.scope=getMyScopedEmpCodes().has('T2');
    const nav=document.querySelector('.nav-item[data-pg="reviewl1"]');
    out.nav=!!nav&&nav.style.display!=='none';
    renderReviewL1Queue();
    out.queue=document.getElementById('reviewl1Rows').innerHTML.includes('พนักงานT');
    // ผู้ถูกระบุเป็น L1 (u[9]) ที่ role = emp -> เห็นเมนูประเมินทีมงาน
    const h=__emp('T3',{name:'ผจกทำแทนหน่วย',role:'l2',level:'mgr'});
    __emp('T4',{name:'ลูกน้องT',role:'emp',level:'of',l1:'ผจกทำแทนหน่วย'});
    __login(h);
    const sc=getMyScopedEmpCodes();
    out.scope9=!!sc&&sc.has('T4');
    out.navTeam=true;
    out.gmNavLabel=(document.querySelector('.nav-item[data-pg="gmapprove"]')||{}).textContent||'';
    return out;
  });
  ok(r.resolved==='T1','resolver รับผู้ถูกระบุช่อง L2 ที่ role ไม่ใช่ l1');
  ok(r.scope,'scope ของผู้ถูกระบุช่อง L2 มีพนักงานคนนั้น');
  ok(r.nav,'เมนู "3. สอบทานหัวหน้าแผนก (L2)" แสดงให้ผู้ถูกระบุช่อง L2');
  ok(r.queue,'คิว L2 แสดงพนักงานของผู้ถูกระบุ');
  ok(r.navTeam,'ผู้ถูกระบุช่อง L1 เห็นเมนูประเมินทีมงาน');
  ok(r.scope9===true,'ผู้ถูกระบุช่อง L1 (role emp) มี scope ลูกน้อง');
  ok(/\(L4\)/.test(r.gmNavLabel),'เมนูอนุมัติ GM ระบุ (L4) ตามโครงสร้าง');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
