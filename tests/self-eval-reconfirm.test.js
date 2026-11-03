/* ตีกลับแล้วพนักงานต้องยืนยัน/แก้คะแนนก่อนส่งใหม่ — หน้าประเมินตนเอง (#253) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const out={};
    __emp('SE1',{name:'พนง.ตีกลับ',level:'of'});
    const emp=MASTER_USERS.find(u=>u[0]==='SE1');
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'});
    __login(adm); // admin ผ่านสิทธิ์ประเมินตนเองเสมอ
    // draft ที่มีคะแนนจริง (m0..m9 = 3,3,3,2,2,2,2,1,1,1 ตรงกับเกรด Ap)
    localStorage.setItem(EVAL_ELIGIBILITY_KEY, JSON.stringify({mode:'all',depts:[],emps:[]})); loadEvalEligibility();
    const cy=getCurrentEvalCycleYear();
    const a=getDrafts(); a.push(['SE1','n',cy,'of',3,3,3,2,2,2,2,1,1,1,null,null,null,null,50,10,60,'C','Draft']); saveDrafts(a);
    const open_=()=>{ document.getElementById('evalCodeGate').value='SE1'; onEvalCodeGateChange(); };
    // 1) ไม่ถูกตีกลับ → ส่งได้ปกติ
    open_();
    out.noFlagDisabled=document.getElementById('evalBtnSubmit').disabled;
    out.noFlagNote=!!document.getElementById('evalReconfirmNote');
    // 2) ถูกตีกลับ → ปุ่มล็อก + banner, คะแนนเดิมยังติ๊ก
    markNeedsReconfirm('SE1|'+cy+'|of');
    open_();
    out.lockedDisabled=document.getElementById('evalBtnSubmit').disabled;
    out.lockedNote=!!document.getElementById('evalReconfirmNote');
    out.restoredStill=Object.keys(evalScores).length>0;
    // ลองกดส่งตรงๆ ต้องไม่เปิด modal
    openSubmitConfirmModal();
    out.modalOpened=!!document.querySelector('#mSubmit.on, #mSubmit.show, .md.on #mSubmitX');
    // 3) กดยืนยัน → ปลดล็อก + เคลียร์ flag
    confirmEvalReconfirm();
    out.afterConfirmDisabled=document.getElementById('evalBtnSubmit').disabled;
    out.flagCleared=!needsReconfirm('SE1|'+cy+'|of');
    // 4) ตีกลับอีกครั้ง → แก้คะแนนจริง 1 ข้อ ปลดล็อกเอง
    markNeedsReconfirm('SE1|'+cy+'|of'); open_();
    out.relocked=document.getElementById('evalBtnSubmit').disabled;
    const btn=document.querySelector('#row-m0 button'); btn.click();
    out.afterEditDisabled=document.getElementById('evalBtnSubmit').disabled;
    out.afterEditFlag=!needsReconfirm('SE1|'+cy+'|of');
    return out;
  });
  ok(!r.noFlagDisabled && !r.noFlagNote, 'ไม่ถูกตีกลับ: ปุ่มส่งใช้ได้ ไม่มี banner');
  ok(r.lockedDisabled && r.lockedNote, 'ถูกตีกลับ: ปุ่มส่งล็อก + มี banner');
  ok(r.restoredStill, 'คะแนนเดิมยังแสดง (ไม่ถูกล้าง)');
  ok(!r.modalOpened, 'กดส่งตรงๆ ตอนล็อก modal ไม่เปิด');
  ok(!r.afterConfirmDisabled && r.flagCleared, 'กดยืนยัน → ปลดล็อกและเคลียร์ flag');
  ok(r.relocked, 'ตีกลับซ้ำ → ล็อกอีก');
  ok(!r.afterEditDisabled && r.afterEditFlag, 'แก้คะแนนจริง → ปลดล็อกเอง');
  ok(errs.length===0, 'ไม่มี page error');
  await b.close(); done();
})();
