/* #266: ธงตีกลับจากเครื่องอื่น ต้องถูกบังคับทันทีที่เปิดฟอร์ม/ก่อนส่งต่อ แม้เครื่องนี้ยังไม่เคย sync ธง */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.prompt=()=>'ตรวจแล้วถูกต้อง ยืนยันผลเดิม'; window.isWorkerConfigured=()=>false;
    window.isMs365Configured=()=>true;
    const cy=getCurrentEvalCycleYear();
    const l1=__emp('R1',{name:'หัวหน้า',role:'l1'});
    __emp('RE',{name:'พนักงาน',l1:'หัวหน้า'});
    __login(l1);
    __draft('RE','Submitted',80);
    const key='RE|'+cy+'|of';
    // เครื่องอื่นเป็นคนตีกลับ: มีแถว Approvals RejectedL1Review แต่เครื่องนี้ไม่มีธง
    window.__remote=[['RE','พนักงาน',cy,'RejectedL1Review','ผู้อื่น',new Date().toISOString(),'| เหตุผลตีกลับ: คะแนนไม่สมเหตุผล']];
    // ใบอยู่ปลายทางของการตีกลับ (Draft) → ให้ตรงเงื่อนไข ms365SyncRejectFlags
    const ds=getDrafts(); ds.find(d=>d[0]==='RE')[ds.find(d=>d[0]==='RE').length-1]='Draft'; saveDrafts(ds);
    const out={before:needsReconfirm(key)};
    openReviewerForm('of','พนักงาน','RE','พนักงาน',cy,false);
    await new Promise(r=>setTimeout(r,300));
    out.afterOpen=needsReconfirm(key);
    out.noteShown=!!document.getElementById('reviewerReconfirmNote');
    out.submitDisabled=document.getElementById('reviewerSubmitBtn').disabled;
    return out;
  });
  ok(r.before===false,'เครื่องนี้ยังไม่มีธง');
  ok(r.afterOpen===true,'เปิดฟอร์ม → sync ธงจาก Approvals ได้ธง');
  ok(r.noteShown&&r.submitDisabled,'banner แสดงและปุ่มส่งต่อถูกล็อกหลัง sync เสร็จ');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
