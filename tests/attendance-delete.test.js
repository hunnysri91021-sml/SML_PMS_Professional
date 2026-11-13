/* ลบข้อมูลเวลา: ลบทั้งเว็บและ Excel (Attendance + AttendanceDetail) — ล้มเหลวแล้วไม่ลบในเว็บ (#321) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(async()=>{
    const out={}; window.confirm=()=>true; window.__del=[];
    window.isMs365Configured=()=>true;
    window.graphDeleteTableRows=async(t,c,v)=>{ window.__del.push([t,c,v]); return 1; };
    ATTENDANCE['X1']={lateCount:1}; ATTENDANCE['X2']={lateCount:2};
    await deleteAttendanceRow('X1');
    out.left=Object.keys(ATTENDANCE).filter(k=>k.startsWith('X')); out.del=window.__del.slice();
    window.graphDeleteTableRows=async()=>{ throw new Error('boom'); };
    await deleteAttendanceRow('X2');
    out.keep=!!ATTENDANCE['X2'];
    window.isMs365Configured=()=>false; window.__del=[];
    await deleteAttendanceRow('X2');
    out.localOnly=!ATTENDANCE['X2'];
    return out;
  });
  ok('ลบในเว็บ X1', JSON.stringify(r.left)==='["X2"]');
  ok('ลบ Excel ทั้ง Attendance และ AttendanceDetail', JSON.stringify(r.del)==='[["Attendance",0,"X1"],["AttendanceDetail",0,"X1"]]');
  ok('Excel ล้มเหลว = ไม่ลบในเว็บ', r.keep===true);
  ok('ไม่ตั้ง MS365 = ลบเฉพาะในเครื่อง', r.localOnly===true);
  ok('ไม่มี pageerror', errs.length===0);
  await b.close(); done();
})();
