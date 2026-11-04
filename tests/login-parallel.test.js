/* #263: login ดึงข้อมูลขนาน + ตารางรองโหลดตามหลัง */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(async()=>{
    const log=[]; const D=150;
    const names=['ms365SyncEmployees','ms365SyncEmployeeSettingsSilent','ms365SyncAttendance','ms365SyncAppraisals','ms365SyncFormWeights','ms365SyncCycleSetup','ms365SyncCyclesList','ms365SyncKpiGoals','ms365SyncIdp','ms365SyncAuditLog','ms365SyncOrgMaster','ms365SyncApprovalSignatures','ms365SyncStageSigners','ms365SyncDisputes','ms365SyncHrNotes','ms365SyncEvalComments','ms365SyncAckChannel'];
    names.forEach(n=>{ window[n]=async()=>{ log.push('s:'+n); await new Promise(r=>setTimeout(r,D)); log.push('e:'+n); }; });
    const t0=performance.now();
    await runLoginSyncsCritical();
    const crit=performance.now()-t0;
    const doneAtCrit=log.filter(x=>x.startsWith('e:')).length;
    const empEndIdx=log.indexOf('e:ms365SyncEmployees');
    const othersStartBeforeEmp=log.slice(0,empEndIdx).some(x=>x.startsWith('s:')&&x!=='s:ms365SyncEmployees');
    const bgStartedInCrit=log.includes('s:ms365SyncKpiGoals');
    const t1=performance.now();
    await runLoginSyncsBackground();
    const bg=performance.now()-t1;
    return {crit,bg,doneAtCrit,othersStartBeforeEmp,bgStartedInCrit,total:log.filter(x=>x.startsWith('e:')).length};
  });
  ok(!r.othersStartBeforeEmp,'Employees เสร็จก่อน ตารางอื่นค่อยเริ่ม');
  ok(r.crit<150*2+200,'ขั้นจำเป็นใช้เวลา ~2 รอบ ไม่ใช่ 7 รอบเรียงกัน ('+Math.round(r.crit)+'ms)');
  ok(r.doneAtCrit===7,'ขั้นจำเป็น = 7 ตาราง');
  ok(!r.bgStartedInCrit,'ตารางรองไม่ถูกเรียกในขั้นจำเป็น');
  ok(r.bg<150+250,'ตารางรอง 10 ตัวขนานกัน ('+Math.round(r.bg)+'ms)');
  ok(r.total===17,'ครบทั้ง 17 ตาราง');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
