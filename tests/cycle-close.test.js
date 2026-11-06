/* #277: ปิดรอบ = export + ล็อกแก้ไข, เปิดรอบอีกครั้งต้องมีเหตุผล */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.isWorkerConfigured=()=>false; window.isMs365Configured=()=>false;
    const out={}; window.confirm=()=>true; let why='แก้คะแนนผิดคน';
    window.prompt=()=>why;
    let csv=null; window.downloadCsv=(f,h,rows)=>{ csv={f,h,rows}; };
    const cy=getCurrentEvalCycleYear();
    cyclesList=[{id:'T1',name:'ประเมินทดสอบ',year:cy,start:'',end:'',status:'Active'}];
    const adm=__emp('A1',{name:'แอดมิน',role:'admin',level:'mgr'});
    __emp('E1',{name:'พนงหนึ่ง',role:'emp',level:'of'}); __emp('E2',{name:'พนงสอง',role:'emp',level:'of'});
    __draft('E1','Submitted',80); __draft('E2','Approved',90);
    // ไม่ใช่ admin ปิดไม่ได้
    __login(__emp('U9',{name:'หัวหน้า',role:'l1',level:'ldr'}));
    await closeCycle('T1'); out.nonAdminStill=cyclesList[0].status;
    __login(adm);
    out.lockedBefore=isCycleLocked(cy);
    await closeCycle('T1');
    out.status=cyclesList[0].status; out.lockedAfter=isCycleLocked(cy);
    out.csvOk=!!csv && csv.rows.some(r=>r[1]==='E1'&&r[7]==='Submitted'&&r[12]==='') && csv.rows.some(r=>r[1]==='E2'&&r[7]==='Approved'&&r[12]!=='');
    out.csvName=csv&&csv.f;
    // ล็อกจริง
    out.guard=(await guardFreshStatus(['E1|'+cy+'|of'],'Submitted')).length;
    updateDraftStatus(['E1|'+cy+'|of'],'L1Reviewed');
    out.statusKept=getDrafts().find(d=>d[0]==='E1')[22];
    const rr=await saveEvaluationToMs365('Draft'); out.saveBlocked=!!(rr&&rr.blocked);
    await deleteDraftByKey('E1|'+cy+'|of'); out.delKept=getDrafts().some(d=>d[0]==='E1');
    // แก้รอบที่ปิดผ่านฟอร์มไม่ได้
    editCycleFromList('T1'); saveCycleFromModal(); out.formStatus=cyclesList[0].status;
    // เปิดอีกครั้ง
    why='abc'; await reopenCycle('T1'); out.shortWhy=cyclesList[0].status;
    why='แก้คะแนนผิดคน'; await reopenCycle('T1');
    out.reopened=cyclesList[0].status; out.unlocked=!isCycleLocked(cy);
    out.guard2=(await guardFreshStatus(['E1|'+cy+'|of'],'Submitted')).length;
    out.audit=getAuditLog().filter(e=>/ปิดรอบ|เปิดรอบ/.test(e.action||'')).length;
    return out;
  });
  ok(r.nonAdminStill==='Active','ไม่ใช่ Admin ปิดรอบไม่ได้');
  ok(!r.lockedBefore && r.status==='Closed' && r.lockedAfter,'ปิดรอบ → ล็อก');
  ok(r.csvOk,'export CSV ทั้งรอบ (เกรดเฉพาะใบที่ Calibrate แล้ว)');
  ok(/ปิดรอบ_/.test(r.csvName||''),'ชื่อไฟล์ปิดรอบ');
  ok(r.guard===0,'guardFreshStatus ไม่ผ่านใบของรอบที่ปิด');
  ok(r.statusKept==='Submitted','updateDraftStatus ไม่แตะใบรอบที่ปิด');
  ok(r.saveBlocked,'บันทึก/ส่งแบบประเมินไม่ได้');
  ok(r.delKept,'ลบใบไม่ได้');
  ok(r.formStatus==='Closed','แก้รอบที่ปิดผ่านฟอร์มไม่ได้');
  ok(r.shortWhy==='Closed','เหตุผลสั้นไป = ไม่เปิดรอบ');
  ok(r.reopened==='Active' && r.unlocked && r.guard2===1,'เปิดรอบอีกครั้ง → ปลดล็อก');
  ok(r.audit>=2,'Audit Log ปิด/เปิดรอบ');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
