/* ตีกลับต้องใส่เหตุผล + ธงตีกลับข้ามเครื่อง (#259) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const out={}; const cy=getCurrentEvalCycleYear();
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'});
    __emp('R1',{name:'พนง.อาร์'}); __draft('R1','Submitted',70); __login(adm);
    const k='R1|'+cy+'|of'; const st=()=>getDrafts().find(d=>draftKey(d)===k).slice(-1)[0];
    const tick=()=>document.body.insertAdjacentHTML('beforeend','<input type="checkbox" class="reviewl1-chk" value="'+k+'" checked>');
    const pushes=[]; window.graphAddTableRow=async(t,row)=>{pushes.push(row.slice());};
    window.isMs365Configured=()=>true;
    // 1) ไม่ใส่เหตุผล → ไม่ตีกลับ
    window.prompt=()=>''; tick(); await rejectReviewL1Selected();
    out.noReason=st(); out.noFlag=!needsReconfirm(k);
    // 2) มีเหตุผล
    window.prompt=()=>'คะแนนวินัยสูงเกินจริง ให้ทบทวนใหม่'; await rejectReviewL1Selected();
    out.status=st(); out.flag=needsReconfirm(k);
    out.info=(getRejectInfo(k)||{}).reason;
    out.pushedReason=pushes.some(x=>x[3]==='RejectedL1Review' && x[6].includes('คะแนนวินัยสูงเกินจริง'));
    out.html=rejectInfoHtml(k).includes('คะแนนวินัยสูงเกินจริง');
    // 3) ข้ามเครื่อง: ล้างธง/ข้อมูลในเครื่องนี้ แล้ว sync จากแถว Approvals
    const at=new Date().toISOString();
    window.graphListTableRows=async()=>[['R1','x',cy,'RejectedL1Review','ผู้ตีกลับ',at,'| เหตุผลตีกลับ: จากเครื่องอื่น']];
    localStorage.removeItem(EVAL_NEEDS_RECONFIRM_KEY); localStorage.removeItem(EVAL_RECONFIRM_CLEARED_KEY); localStorage.removeItem(EVAL_REJECT_INFO_KEY);
    await ms365SyncRejectFlags(true);
    out.syncFlag=needsReconfirm(k); out.syncReason=(getRejectInfo(k)||{}).reason;
    // 4) ปลดธงแล้ว sync อีกรอบ → ไม่ตั้งซ้ำ
    clearNeedsReconfirm(k); await ms365SyncRejectFlags(true); out.noReadd=!needsReconfirm(k);
    // 5) ใบถูกส่งต่อไปแล้ว (สถานะไม่ตรงปลายทางตีกลับ) → ไม่ตั้งธง
    localStorage.removeItem(EVAL_RECONFIRM_CLEARED_KEY);
    updateDraftStatus([k],'L1Reviewed'); await ms365SyncRejectFlags(true); out.advancedNoFlag=!needsReconfirm(k);
    return out;
  });
  ok(r.noReason==='Submitted' && r.noFlag,'ไม่ใส่เหตุผล → ไม่ตีกลับ');
  ok(r.status==='Draft' && r.flag,'ใส่เหตุผล → ตีกลับ + ตั้งธง');
  ok(r.info && r.html,'เก็บและแสดงเหตุผลตีกลับ');
  ok(r.pushedReason,'เหตุผลอยู่ในแถว Approvals');
  ok(r.syncFlag && r.syncReason==='จากเครื่องอื่น','ธงตีกลับข้ามเครื่องจาก Approvals');
  ok(r.noReadd,'ปลดธงแล้วไม่ตั้งซ้ำ');
  ok(r.advancedNoFlag,'ใบที่ส่งต่อไปแล้วไม่ถูกตั้งธง');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
