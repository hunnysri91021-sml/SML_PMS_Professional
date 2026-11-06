/* #279: ตั้งค่ารอบแบบสั้นเก็บใน FormWeights แถว __cyclesetup__ (ไม่ใช้แถว CURRENT ของตาราง Cycles แล้ว) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.isMs365Configured=()=>true;
    const out={};
    localStorage.setItem('smlPmsCycleSetup',JSON.stringify({name:'FY2026 – ประจำปี 2569',year:'2569',status:'กำลังดำเนินการ',start:'2026-01-01',end:'2026-12-31',savedAt:'2026-05-01T00:00:00.000Z'}));
    let call=null; window.graphUpsertTableRow=async(t,k,v,vals)=>{ call={t,k,v,vals}; return 'ok'; };
    await pushCycleSetupToExcel();
    out.call=call;
    // ดึงกลับ: remote ใหม่กว่า → ทับ, เก่ากว่า → ไม่ทับ
    const mk=(name,at)=>[['__cyclesetup__',JSON.stringify({name,year:'2570',status:'x',start:'',end:'',savedAt:at}),at]];
    window.graphListTableRows=async()=>mk('รอบใหม่','2026-06-01T00:00:00.000Z');
    await ms365SyncCycleSetup(true); out.newer=getCycleSetupData().name+'|'+getCycleSetupData().year;
    window.graphListTableRows=async()=>mk('รอบเก่า','2026-01-01T00:00:00.000Z');
    await ms365SyncCycleSetup(true); out.older=getCycleSetupData().name;
    window.graphListTableRows=async()=>[['CURRENT','x','','','','','2025']];
    await ms365SyncCycleSetup(true); out.legacyIgnored=getCycleSetupData().name;
    return out;
  });
  ok(r.call&&r.call.t==='FormWeights'&&r.call.v==='__cyclesetup__'&&r.call.vals.length===3&&JSON.parse(r.call.vals[1]).year==='2569','push JSON ลง FormWeights __cyclesetup__');
  ok(r.newer==='รอบใหม่|2570','remote ใหม่กว่า → ใช้ของ remote');
  ok(r.older==='รอบใหม่','remote เก่ากว่า → ไม่ทับของในเครื่อง');
  ok(r.legacyIgnored==='รอบใหม่','ไม่อ่านแถว CURRENT เดิมอีก');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
