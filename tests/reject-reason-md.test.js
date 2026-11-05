/* #265: MD ตีกลับ + HR ตีกลับหลัง Calibration ต้องมีเหตุผล; auto-sync 30 วิ รีเฟรชธงตีกลับ */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'}); __login(adm);
    __emp('M1',{name:'พนง'}); __emp('M2',{name:'พนง2'});
    const st=k=>getDrafts().find(d=>d[0]===k)[getDrafts().find(d=>d[0]===k).length-1];
    const out={};
    // MD ตีกลับ
    __draft('M1','CalibChecked',80);
    window.prompt=()=>'';
    await rejectApproveAll(); out.mdNoReason=st('M1');
    window.prompt=()=>'คะแนนสูงเกินจริง ตรวจใหม่';
    await rejectApproveAll(); out.mdWith=st('M1'); out.mdFlag=needsReconfirm(draftKey(getDrafts().find(d=>d[0]==='M1')));
    out.mdInfo=(getRejectInfo(draftKey(getDrafts().find(d=>d[0]==='M1')))||{}).reason;
    // HR ตีกลับหลัง Calibration
    __draft('M2','Calibrated',80);
    const cy=getCurrentEvalCycleYear();
    renderCalibCheckQueue&&renderCalibCheckQueue();
    const chk=document.querySelector('.calib-chk[value="M2|'+cy+'|of"]'); if(chk) chk.checked=true;
    window.prompt=()=>'';
    await rejectCalibCheckSelected(); out.hrNoReason=st('M2');
    window.prompt=()=>'ปรับเกรดไม่เหมาะสม';
    await rejectCalibCheckSelected(); out.hrWith=st('M2');
    // auto-sync เรียก ms365SyncRejectFlags
    let n=0; const orig=window.ms365SyncRejectFlags; window.ms365SyncRejectFlags=()=>{n++;};
    stopEvalAutoSync(); startEvalAutoSync(); out.syncOnStart=n; stopEvalAutoSync();
    window.ms365SyncRejectFlags=orig;
    return out;
  });
  ok(r.mdNoReason==='CalibChecked','MD ตีกลับโดยไม่ใส่เหตุผล → ไม่ตีกลับ');
  ok(r.mdWith==='Calibrated','MD ใส่เหตุผล → ตีกลับไป Calibrated');
  ok(r.mdInfo==='คะแนนสูงเกินจริง ตรวจใหม่','เหตุผลถูกเก็บไว้');
  ok(r.mdFlag===false,'ขั้น MD ไม่ตั้งธง reconfirm');
  ok(r.hrNoReason==='Calibrated','HR ตีกลับหลัง Calibration ไม่ใส่เหตุผล → ไม่ตีกลับ');
  ok(r.hrWith==='Acknowledged','HR ใส่เหตุผล → ตีกลับ');
  ok(r.syncOnStart>=1,'auto-sync เรียก ms365SyncRejectFlags');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
