const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p}=await open();
  const r=await p.evaluate(async()=>{
    const toasts=[]; window.smlToast=(m)=>toasts.push(m);
    window.isMs365Configured=()=>true;
    const u=MASTER_USERS.find(x=>x[12]==='active');
    // Worker ตอบ added (หาแถวเดิมไม่เจอ)
    window.graphUpsertTableRow=async()=>{ window._lastUpsertInfo={result:'added',scanned:50,sampleKeys:['SML-001','SML-002']}; return 'added'; };
    const r1=await pushSingleEmployeeToExcel(u[0]);
    const reason1=window._lastEmpPushReason;
    window.graphUpsertTableRow=async()=>{ window._lastUpsertInfo={result:'updated',matched:1}; return 'updated'; };
    const r2=await pushSingleEmployeeToExcel(u[0]);
    const logs=JSON.parse(localStorage.getItem(MS365_SYNC_LOG_KEY)||'[]').map(x=>JSON.stringify(x));
    return {r1,reason1,r2,logs};
  });
  ok(r.r1===false && /แถวใหม่/.test(r.reason1) && /ไม่พบรหัส/.test(r.reason1),'หาแถวเดิมไม่เจอ → รายงานว่าเพิ่มแถวใหม่ + เหตุผล');
  ok(r.r2===true,'อัปเดตแถวเดิม → สำเร็จ');
  ok(r.logs.some(l=>/เพิ่มแถวใหม่ ไม่ได้แก้แถวเดิม/.test(l)) && r.logs.some(l=>/อัปเดตแถวเดิม/.test(l)),'Sync Log แยก 2 กรณีชัดเจน');
  await b.close(); done();
})();
