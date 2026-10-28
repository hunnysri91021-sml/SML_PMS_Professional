/* Regression: Calibration / Bell Curve (CLAUDE.md #155, #197, #199, #202, #203/204, #216) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(async()=>{
    const out={};
    const admin=MASTER_USERS.find(u=>u[2]==='admin'&&u[12]==='active')||__emp('T-ADM',{role:'admin'});
    __login(admin);
    saveBellCurveGroupField('group');
    const xs=[95,88,82,75,65,40];
    xs.forEach((x,i)=>{ __emp('BC'+i,{group:'BCG'}); __draft('BC'+i,'Acknowledged',x); });
    renderCalibQueue();
    runBellCurveCalculation();
    out.grades=xs.map((x,i)=>bellCurveResult.byKey[Object.keys(bellCurveResult.byKey).find(k=>k.startsWith('BC'+i+'|'))].grade).join('');
    out.cellsFilled=document.querySelectorAll('.calib-bc-cell').length>0&&![...document.querySelectorAll('.calib-bc-cell')].some(c=>c.textContent.includes('ยังไม่คำนวณ'));
    // #202: auto-sync re-render ต้องไม่ล้างผลที่คำนวณแล้ว
    renderWorkflowPages();
    out.survive=!!bellCurveResult&&![...document.querySelectorAll('.calib-bc-cell')].some(c=>c.textContent.includes('ยังไม่คำนวณ'));
    // แก้คะแนนจริง → ต้อง invalidate
    const inp=document.querySelector('.calib-adj'); inp.value=String(Number(inp.value)+1); inp.dispatchEvent(new Event('input',{bubbles:true}));
    out.invalidated=!bellCurveResult;
    // #203: export ก่อนยืนยัน ต้องเป็นเกรด Bell Curve ไม่ใช่เกรดเดิม
    runBellCurveCalculation();
    let csv=null; const orig=window.downloadCsv; window.downloadCsv=(name,h,rows)=>{ csv=rows; };
    exportCalibTableList(); window.downloadCsv=orig;
    out.exportHasBC=!!csv&&csv.some(r=>String(r[10]).endsWith("/6"))&&csv.some(r=>/^[ABCDE]$/.test(r[9]));
    // ยืนยัน → Calibrated + push Excel
    window.__pushes.length=0;
    await confirmCalibration();
    const after=getDrafts().filter(d=>d[0].startsWith('BC'));
    out.status=[...new Set(after.map(d=>d[d.length-1]))].join();
    out.finalGrades=after.sort((a,c)=>c[c.length-3]-a[a.length-3]).map(d=>d[d.length-2]).join('');
    out.pushed=window.__pushes.filter(d=>d[0].startsWith('BC')).length;
    return out;
  });
  ok(r.grades==='ABCCDE','Bell Curve n=6 → '+r.grades);
  ok(r.cellsFilled,'ช่องเกรดถูกเติมหลังคำนวณ');
  ok(r.survive,'#202 ผลคำนวณรอดการ re-render จาก auto-sync');
  ok(r.invalidated,'แก้คะแนนแล้วผลถูก invalidate');
  ok(r.exportHasBC,'#203 export ก่อนยืนยันใช้เกรด/อันดับ Bell Curve');
  ok(r.status==='Calibrated','ยืนยันแล้วสถานะ = Calibrated ('+r.status+')');
  ok(r.finalGrades.length===6&&/^[ABCDE]{6}$/.test(r.finalGrades),'เกรดสุดท้ายเป็นเกรด Bell Curve '+r.finalGrades);
  ok(r.pushed===6,'#205/206 push Appraisals ครบ 6 ใบ ('+r.pushed+')');
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
