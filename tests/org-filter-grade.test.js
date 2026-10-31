/* #233: resolver L1 อ่านช่อง "หัวหน้าแผนก (L2)" u[10], ตัวกรองโครงสร้างองค์กรบนคิว L1-L4, เกรดไม่รั่วถึงพนักงาน */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(()=>{
    const out={}; const cy=getCurrentEvalCycleYear();
    const dh=__emp('O-DH',{name:'หัวหน้าแผนกโอ',role:'l1'});
    const e1=__emp('O-E1',{name:'พนักงานโอ1',l2:'หัวหน้าแผนกโอ',group:'กลุ่มA',dept:'ฝ่ายX'});
    const e2=__emp('O-E2',{name:'พนักงานโอ2',l2:'หัวหน้าแผนกโอ',group:'กลุ่มB',dept:'ฝ่ายY'});
    out.resolveViaL2=resolveL1Reviewer(e1)===dh;                       // ช่อง L2 อย่างเดียว (ไม่มี L1) ก็หาผู้ประเมินเจอ
    CURRENT_SESSION_USER=dh; out.scope=getMyScopedEmpCodes().has('O-E1');
    __draft('O-E1','Submitted',80); __draft('O-E2','Submitted',75);
    applySession(dh); renderReviewL1Queue();
    out.rowsAll=document.querySelectorAll('#reviewl1Rows .reviewl1-chk').length;
    const v=document.getElementById('orgf_reviewl1_group');
    out.hasFilter=!!v&&!!document.getElementById('orgf_reviewl1_sort');
    v.value='กลุ่มA'; v.onchange();
    out.rowsA=document.querySelectorAll('#reviewl1Rows .reviewl1-chk').length;
    // เกรดไม่รั่ว: พนักงานเจ้าของผล + Admin ยังไม่เปิดแสดง
    saveGradeVisibility({[cy]:true}); saveGradeVisAt({});                // true ตกค้างไม่มีเวลา → ต้องไม่แสดง
    CURRENT_SESSION_USER=e1; out.staleHidden=isGradeHiddenFor('O-E1',cy);
    const d=getDrafts().find(x=>x[0]==='O-E1'); d[d.length-1]='Calibrated'; saveDrafts(getDrafts().map(x=>x[0]==='O-E1'?d:x));
    CURRENT_SESSION_USER=e1; out.calibSecHidden=buildCalibGradeSectionHtml(d,4,true)==='' ;
    saveGradeVisibility({[cy]:true}); saveGradeVisAt({[cy]:Date.now()});
    out.shownWhenEnabled=!isGradeHiddenFor('O-E1',cy);
    return out;
  });
  ok(r.resolveViaL2,'resolveL1Reviewer อ่านช่อง หัวหน้าแผนก (L2) u[10]');
  ok(r.scope,'scope หัวหน้าแผนกเห็นคนที่ตั้งช่อง L2 เป็นตน');
  ok(r.hasFilter&&r.rowsAll===2,'มีตัวกรองกลุ่ม/ค่าย่อยบนหน้าคิว: '+r.rowsAll);
  ok(r.rowsA===1,'กรองกลุ่มงาน=กลุ่มA เหลือ 1 คน: '+r.rowsA);
  ok(r.staleHidden,'ค่า "แสดงเกรด" ตกค้างที่ไม่มีเวลาตั้งค่า = ซ่อน');
  ok(r.calibSecHidden,'พนักงานไม่เห็นส่วนเกรดหลัง Calibration');
  ok(r.shownWhenEnabled,'Admin เปิดแสดงแล้วจึงเห็นได้');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
