/* ตีกลับ → ผู้ประเมินแก้ผล หรือ "ยืนยันผลเดิม" พร้อมเหตุผล → ส่งต่อตามสายเดิม (L1–L4) (#258) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const out={}; const cy=getCurrentEvalCycleYear();
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'});
    __emp('A1',{name:'พนง.เอ'}); __emp('A2',{name:'พนง.บี'});
    __draft('A1','Submitted',70); __draft('A2','L1Reviewed',70); __draft('A3x','L2Reviewed',70);
    __login(adm);
    const k1='A1|'+cy+'|of', k2='A2|'+cy+'|of';
    const st=k=>getDrafts().find(d=>draftKey(d)===k).slice(-1)[0];
    // 1) ใบที่ตีกลับ + ไม่ใส่เหตุผล (prompt ว่าง) → ไม่ส่งต่อ
    markNeedsReconfirm(k1);
    window.prompt=()=> ''; 
    document.body.insertAdjacentHTML('beforeend','<input type="checkbox" class="reviewl1-chk" value="'+k1+'" checked>');
    await approveReviewL1Selected();
    out.noReasonStatus=st(k1); out.noReasonFlag=needsReconfirm(k1);
    // 2) ใส่เหตุผล → ส่งต่อ + ปลดธง + เก็บเหตุผลในความเห็น
    window.prompt=()=> 'ตรวจทานแล้วคะแนนเหมาะสมตามผลงานจริง';
    await approveReviewL1Selected();
    out.withReasonStatus=st(k1); out.withReasonFlag=needsReconfirm(k1);
    const cm=(getEvalComments('A1',cy).L1Reviewed||[])[0];
    out.commentHasReason=!!(cm && cm.dev.includes('ตรวจทานแล้วคะแนนเหมาะสมตามผลงานจริง'));
    // 3) ไม่ถูกตีกลับ → ไม่ถามเหตุผล
    let asked=0; window.prompt=()=>{asked++; return 'x';};
    document.body.insertAdjacentHTML('beforeend','<input type="checkbox" class="review-chk" value="'+k2+'" checked>');
    await approveReviewSelected();
    out.normalAsked=asked; out.normalStatus=st(k2);
    return out;
  });
  ok(r.noReasonStatus==='Submitted' && r.noReasonFlag, 'ตีกลับ + ไม่ใส่เหตุผล → ไม่ส่งต่อ ธงยังอยู่');
  ok(r.withReasonStatus!=='Submitted' && !r.withReasonFlag, 'ใส่เหตุผล → ส่งต่อตามสายเดิม และปลดธง');
  ok(r.commentHasReason, 'เหตุผลถูกบันทึกในความเห็นของขั้นนั้น');
  ok(r.normalAsked===0 && r.normalStatus!=='L1Reviewed', 'ใบปกติ (ไม่ถูกตีกลับ) ไม่ถามเหตุผล');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
