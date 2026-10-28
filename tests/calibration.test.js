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
    // #230: ไม่มีข้อมูลเวลา → ห้ามยืนยัน
    window.__pushes.length=0;
    await confirmCalibration();
    out.blocked=getDrafts().filter(d=>d[0].startsWith('BC')).every(d=>d[d.length-1]==='Acknowledged')&&window.__pushes.length===0;
    // Admin ข้ามได้ต้องมีเหตุผล: ไม่กรอก → ยกเลิก
    const op=window.prompt; window.prompt=()=>''; renderCalibQueue(); runBellCurveCalculation(); await confirmCalibration();
    out.noReason=getDrafts().filter(d=>d[0].startsWith('BC')).every(d=>d[d.length-1]==='Acknowledged');
    window.prompt=()=>'รอข้อมูลจาก HRGO'; renderCalibQueue(); runBellCurveCalculation(); await confirmCalibration();
    out.override=getDrafts().filter(d=>d[0].startsWith('BC')).every(d=>d[d.length-1]==='Calibrated')&&getAuditLog().some(a=>String(a.detail).includes('รอข้อมูลจาก HRGO'));
    getDrafts().forEach(()=>{}); const dd=getDrafts(); dd.filter(d=>d[0].startsWith('BC')).forEach(d=>d[d.length-1]='Acknowledged'); saveDrafts(dd);
    window.prompt=op; window.__pushes.length=0;
    // มีข้อมูลเวลาครบแล้ว → ยืนยัน → Calibrated + push Excel
    xs.forEach((x,i)=>{ ATTENDANCE['BC'+i]={lateCount:0,earlyCount:0,sickDay:0,personalDay:0,absentDay:0}; });
    renderCalibQueue(); runBellCurveCalculation();
    await confirmCalibration();
    const after=getDrafts().filter(d=>d[0].startsWith('BC'));
    out.status=[...new Set(after.map(d=>d[d.length-1]))].join();
    out.finalGrades=after.sort((a,c)=>c[c.length-3]-a[a.length-3]).map(d=>d[d.length-2]).join('');
    out.pushed=window.__pushes.filter(d=>d[0].startsWith('BC')).length;
    // #228: ทุกขนาดกลุ่ม ≥5 ต้องมีครบ 5 เกรด และผลรวมเท่ากับ n
    out.dist={};
    [5,6,7,8,9,10,11,13,20,37].forEach(n=>{
      const ids=[...Array(n)].map((_,i)=>{ const c='DS'+n+'_'+i; __emp(c,{group:'DSG'+n}); __draft(c,'Acknowledged',99-i); return c; });
      saveBellCurveGroupField('group');
      const res=computeBellCurveGrades('DSG'+n);
      const cnt={A:0,B:0,C:0,D:0,E:0}; Object.values(res.byKey).forEach(v=>cnt[v.grade]++);
      out.dist[n]=cnt;
    });
    return out;
  });
  ok(Object.entries(r.dist).every(([n,c])=>Object.values(c).every(v=>v>=1)&&Object.values(c).reduce((a,b)=>a+b,0)==n),'#228 กลุ่ม ≥5 คนมีครบ 5 เกรดและรวมเท่า n: '+JSON.stringify(r.dist[5])+JSON.stringify(r.dist[10]));
  ok(JSON.stringify(Object.values(r.dist[10]))==='[1,2,4,2,1]','n=10 → 1/2/4/2/1');
  ok(r.grades==='ABCCDE','Bell Curve n=6 → '+r.grades);
  ok(r.cellsFilled,'ช่องเกรดถูกเติมหลังคำนวณ');
  ok(r.survive,'#202 ผลคำนวณรอดการ re-render จาก auto-sync');
  ok(r.invalidated,'แก้คะแนนแล้วผลถูก invalidate');
  ok(r.exportHasBC,'#203 export ก่อนยืนยันใช้เกรด/อันดับ Bell Curve');
  ok(r.blocked,'#230 ไม่มีข้อมูลเวลา → ยืนยันถูกบล็อก ไม่ push');
  ok(r.noReason,'#230 Admin ไม่ระบุเหตุผล → ยังบล็อก');
  ok(r.override,'#230 Admin ระบุเหตุผล → ยืนยันข้ามได้ + บันทึก Audit Log');
  ok(r.status==='Calibrated','ยืนยันแล้วสถานะ = Calibrated ('+r.status+')');
  ok(r.finalGrades.length===6&&/^[ABCDE]{6}$/.test(r.finalGrades),'เกรดสุดท้ายเป็นเกรด Bell Curve '+r.finalGrades);
  ok(r.pushed===6,'#205/206 push Appraisals ครบ 6 ใบ ('+r.pushed+')');
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
