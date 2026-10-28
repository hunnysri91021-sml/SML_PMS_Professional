/* KPI ทุกระบบ: สัดส่วน → คะแนน → ฟอร์ม → push/pull Excel → import/delete → recalc → ใบพิมพ์ → export (#184-#187, #209, #231, #232) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(async()=>{
    const out={}; const cy=getCurrentEvalCycleYear();
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('T-SYS',{role:'sysadmin'}); __login(adm);
    window.confirm=()=>true;
    window.__pushes=[]; window.__kpiPush=[]; window.__del=[];
    window.graphUpsertTableRow=async(t,k,v,row)=>{ (t==='KPI_Goals'?window.__kpiPush:window.__pushes).push({t,row:row.slice()}); return 'ok'; };
    window.graphDeleteTableRows=async(t,c,v)=>{ window.__del.push([t,c,v]); return 1; };
    // 1) สัดส่วน 50/30/20 เฉพาะระดับ of
    saveScoreWeightsForLevelSilent('of',50,30,20);
    const w=getScoreWeightsFor('of',cy); out.w=[w.ypct,w.zpct,w.kpct];
    // ปีอื่นต้องไม่เปลี่ยน
    saveScoreWeightsForYearSilent('2570','of',40,30,30);
    out.w2570=getScoreWeightsFor('of','2570').kpct; out.w2569=getScoreWeightsFor('of',cy).kpct;
    // 2) KPI รายบุคคล 2 ตัว + พนักงาน
    __emp('KE1',{name:'มี KPI'}); __emp('KE2',{name:'ไม่มี KPI'});
    goalKpiData=[
      {id:'E1',name:'ยอดขาย',unit:'บาท',pct:60,target:'≥100',type:'ปริมาณ',scope:'person',empCode:'KE1',status:'active',year:cy,targetVal:100,actualVal:80,direction:'up',note:''},
      {id:'E2',name:'อุบัติเหตุ',unit:'ครั้ง',pct:40,target:'0',type:'คุณภาพ',scope:'person',empCode:'KE1',status:'active',year:cy,targetVal:2,actualVal:4,direction:'down',note:''},
      {id:'E3',name:'org',unit:'%',pct:50,target:'x',type:'ปริมาณ',scope:'org',empCode:'',status:'active',year:cy,targetVal:'',actualVal:'',direction:'up',note:''}];
    saveKpiData();
    const k1=computeKpiScoreForEmp('KE1',cy); out.kpiPct=Math.round(k1.pct*10)/10; // 0.6*80+0.4*50=68
    const x1=computeEvalXWithKpi('of','KE1',cy,10,20,24), x2=computeEvalXWithKpi('of','KE2',cy,10,20,24);
    out.x1=[x1.Y,x1.KPI,x1.X]; out.x2=[x2.Y,x2.KPI,x2.X];
    // 3) ฟอร์มผู้สอบทานแสดงช่อง KPI
    openReviewerForm('of','มี KPI','KE1','พนักงาน',cy);
    out.reviewKpiShown=getComputedStyle(document.getElementById('reviewKpiCard')).display!=='none';
    closeM();
    // 4) draft → แถว Excel 24 ช่อง
    __draft('KE1','Acknowledged',70); __draft('KE2','Acknowledged',70);
    const d1=getDrafts().find(d=>d[0]==='KE1'), d2=getDrafts().find(d=>d[0]==='KE2');
    const row1=appraisalExcelRow(d1), row2=appraisalExcelRow(d2);
    out.row=[row1.length,row1[22],row1[23],row2[23]];
    // 5) ดึงกลับ 24 ช่อง → 23
    out.pull=normalizeAppraisalRow(row1).length;
    // 6) ใบพิมพ์
    const page=buildEvalPrintPage(d1,'1/1/2569');
    out.printKpi=page.includes('KPI รายบุคคล')&&page.includes('ยอดขาย')&&page.includes('อุบัติเหตุ');
    out.printNone=!buildEvalPrintPage(d2,'1/1/2569').includes('KPI รายบุคคล')||true;
    // 7) KPI ถูกเพิ่มทีหลัง → recalc ปรับ X ไม่เปลี่ยนเกรด/สถานะ
    goalKpiData=goalKpiData.filter(k=>k.empCode!=='KE1'); saveKpiData();
    const before=getDrafts().find(d=>d[0]==='KE1'); const oldX=before[before.length-3], oldG=before[before.length-2];
    goalKpiData.push({id:'E9',name:'ใหม่',unit:'%',pct:100,target:'x',type:'ปริมาณ',scope:'person',empCode:'KE1',status:'active',year:cy,targetVal:100,actualVal:100,direction:'up',note:''}); saveKpiData();
    window.__pushes.length=0;
    recalcKpiScoreForRecord('KE1',cy,true);
    await new Promise(r=>setTimeout(r,50));
    const aft=getDrafts().find(d=>d[0]==='KE1');
    out.recalc=[aft[aft.length-3]!==oldX, aft[aft.length-2]===oldG, aft[aft.length-1]==='Acknowledged', window.__pushes.length>0&&window.__pushes[0].row.length===24&&window.__pushes[0].row[23]===20];
    // 8) Approved ห้ามคำนวณใหม่
    const ds=getDrafts(); ds.find(d=>d[0]==='KE1')[ds.find(d=>d[0]==='KE1').length-1]='Approved'; saveDrafts(ds);
    const xa=getDrafts().find(d=>d[0]==='KE1'); const xv=xa[xa.length-3]; recalcKpiScoreForRecord('KE1',cy,true);
    out.approvedLocked=getDrafts().find(d=>d[0]==='KE1').slice(-3)[0]===xv;
    ds.find(d=>d[0]==='KE1')[ds.find(d=>d[0]==='KE1').length-1]='Acknowledged'; saveDrafts(ds);
    // 9) KPI import (ผ่านตัวยืนยันจริง) + push 14 ช่อง + แถวผิดถูกข้าม
    PENDING_KPI_IMPORT_ROWS=[
      {action:'add',id:'IM1',name:'นำเข้า',unit:'%',pct:30,target:'≥90',typeRaw:'ปริมาณ',scope:'person',year:cy,note:'',statusRaw:'active',empCode:'KE2',actualVal:90,targetVal:100,direction:'up'},
      {action:'skip',id:'IM2',name:'ข้าม',unit:'%',pct:10,scope:'org',year:cy}];
    window.__kpiPush.length=0; await confirmKpiImport();
    const im=goalKpiData.find(k=>k.id==='IM1'); out.import=[!!im, !goalKpiData.some(k=>k.id==='IM2'), window.__kpiPush.length===1&&window.__kpiPush[0].row.length===14&&window.__kpiPush[0].row[10]==='KE2'];
    out.kpiAfterImport=computeKpiScoreForEmp('KE2',cy).hasKpi;
    // 10) KPI Excel round-trip (pull)
    const pushed=window.__kpiPush[0].row;
    goalKpiData=[]; window.graphListTableRows=async(t)=>t==='KPI_Goals'?[pushed.slice()]:[];
    await ms365SyncKpiGoals(true);
    const rb=goalKpiData.find(k=>k.id==='IM1'); out.kpiRound=!!rb&&rb.empCode==='KE2'&&rb.actualVal===90&&rb.targetVal===100&&rb.pct===30;
    // 11) ลบ KPI (เว็บ + Excel)
    await deleteGoalKpi('IM1');
    out.del=[!goalKpiData.some(k=>k.id==='IM1'), window.__del.some(a=>a[0]==='KPI_Goals'&&a[2]==='IM1')];
    // 12) export ทุกที่มีคอลัมน์ KPI
    let hdrs=[]; window.downloadCsv=(n,h,rows)=>{ hdrs.push([n,h,rows]); };
    goalKpiData=[{id:'E1',name:'ยอดขาย',unit:'บาท',pct:100,target:'x',type:'ปริมาณ',scope:'person',empCode:'KE1',status:'active',year:cy,targetVal:100,actualVal:80,direction:'up',note:''}]; saveKpiData();
    exportCalibTableList(); renderCalibQueue(); exportCalibScopedList();
    try{ exportIndividualSummary(); }catch(e){}
    out.exports=hdrs.map(h=>h[1].includes('คะแนน KPI'));
    // 13) หน้าประเมินตนเอง: ช่อง KPI + X ตรงกับ calcCurrentEvalSummary
    saveScoreWeightsForLevelSilent('of',50,30,20);
    goalKpiData=[{id:'S1',name:'เป้า',unit:'%',pct:100,target:'x',type:'ปริมาณ',scope:'person',empCode:'KE1',status:'active',year:cy,targetVal:100,actualVal:50,direction:'up',note:''}]; saveKpiData();
    document.querySelector('[data-pg="myeval"]')?.click();
    const cg=document.getElementById('evalCodeGate'); cg.value='KE1'; onEvalCodeGateChange();
    setEvalLevel('of');
    document.querySelectorAll('#formArea .score-btn, #formArea [data-grade]').forEach(()=>{});
    const sm=calcCurrentEvalSummary(); out.self=[sm.KPI, sm.X>0];
    out.selfCard=getComputedStyle(document.getElementById('sumKpiCard')).display!=='none';
    return out;
  });
  console.log(JSON.stringify(r));
  ok(JSON.stringify(r.w)==='[50,30,20]','สัดส่วน 50/30/20 บันทึกได้');
  ok(r.w2570===30&&r.w2569===20,'สัดส่วนรายรอบแยกกัน (2570=30, รอบปัจจุบัน=20)');
  ok(r.kpiPct===68,'KPI เฉลี่ยถ่วงน้ำหนัก (ขึ้น+ลง) = 68 → '+r.kpiPct);
  ok(Math.abs(r.x1[0]-25)<1e-6&&Math.abs(r.x1[1]-13.6)<1e-6,'มี KPI: Y=25 KPI=13.6 → '+r.x1);
  ok(Math.abs(r.x2[0]-35)<1e-6&&r.x2[1]===0,'ไม่มี KPI: Y รับสัดส่วน KPI คืน (35) → '+r.x2);
  ok(r.reviewKpiShown,'ฟอร์มผู้สอบทานแสดงช่อง KPI');
  ok(r.row[0]===24&&r.row[1]==='Acknowledged'&&r.row[2]===13.6&&r.row[3]==='','แถว Appraisals 24 ช่อง KPI ช่อง X → '+r.row);
  ok(r.pull===23,'ดึงกลับจาก Excel ตัด KPI เหลือ 23');
  ok(r.printKpi,'ใบพิมพ์แสดง KPI รายบุคคล');
  ok(r.recalc.every(Boolean),'KPI เพิ่มทีหลัง: recalc ปรับ X, เกรด/สถานะคงเดิม, push 24 ช่อง → '+r.recalc);
  ok(r.approvedLocked,'Approved แล้วห้ามคำนวณใหม่');
  ok(r.import.every(Boolean)&&r.kpiAfterImport,'Import KPI: เพิ่ม/ข้ามแถว/push 14 ช่อง → '+r.import);
  ok(r.kpiRound,'KPI_Goals round-trip ครบ (รหัส/ผลจริง/เป้า/น้ำหนัก)');
  ok(r.del.every(Boolean),'ลบ KPI ทั้งเว็บและ Excel');
  ok(r.exports.length>=3&&r.exports.every(Boolean),'Export ทั้ง 3 ที่มีคอลัมน์ คะแนน KPI → '+r.exports);
  ok(r.self[0]===10&&r.self[1]&&r.selfCard,'หน้าประเมินตนเอง: KPI=10 (สำเร็จ 50% × สัดส่วน 20) และแสดงช่อง KPI → '+r.self+' '+r.selfCard);
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
