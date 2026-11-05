/* #268: MGR (l2) ที่มี GM เป็นผู้ประเมินคนเดียว — GM เห็นในหน้าทีม ให้คะแนนได้ และอนุมัติในฟอร์มได้ */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const cy=getCurrentEvalCycleYear();
    const gm=__emp('G1',{name:'จีเอ็ม',role:'gm'});
    const mgr=__emp('M1',{name:'เอ็มจีอาร์',role:'l2',level:'mgr',l4:'จีเอ็ม'});
    const l1p=__emp('H1',{name:'หัวหน้าแผนก',role:'l1',level:'ldr',l3:'เอ็มจีอาร์'});
    const out={};
    // ผจก.ส่วนดู: หัวหน้าแผนกที่ไม่มีหัวหน้าหน่วยคั่น ต้องอยู่ในหมวด __noL1__
    __login(mgr);
    populateTeamManagerSelect();
    const sel1=document.getElementById('teamManagerSelect');
    out.l2HasNoL1=[...sel1.options].some(o=>o.value==='__noL1__');
    sel1.value='__noL1__'; renderTeamFromMaster();
    out.l2SeesL1Role=document.getElementById('teamRows').textContent.includes('หัวหน้าแผนก');
    // GM ดู
    __login(gm);
    populateTeamManagerSelect();
    const sel=document.getElementById('teamManagerSelect');
    out.hasBucket=[...sel.options].some(o=>o.value==='__noL1L2__');
    sel.value='__noL1L2__'; renderTeamFromMaster();
    out.seesMgr=document.getElementById('teamRows').textContent.includes('เอ็มจีอาร์');
    // GM ให้คะแนนผ่านฟอร์ม
    const lv='mgr';
    openReviewerForm(lv,'เอ็มจีอาร์','M1','',cy,false);
    document.querySelectorAll('#reviewerFormArea .reviewer-table tbody tr').forEach(tr=>{ const btn=tr.querySelector('.rt button, .rt-btn, button'); if(btn) btn.click(); });
    await submitReviewerForm();
    const d1=getDrafts().find(d=>d[0]==='M1'); out.afterScore=d1&&d1[d1.length-1];
    // GM อนุมัติในฟอร์ม (ผู้ประเมินคนเดียว)
    renderGmApproveQueue();
    out.editBtn=document.getElementById('gmApproveRows').innerHTML.includes('ประเมิน/อนุมัติในฟอร์ม');
    openReviewerForm(lv,'เอ็มจีอาร์','M1','',cy,false);
    await submitReviewerForm();
    const d2=getDrafts().find(d=>d[0]==='M1'); out.afterGm=d2&&d2[d2.length-1];
    // GM ตีกลับ (ผู้ประเมินคนเดียว) ต้องไป Draft ไม่ใช่วนกลับ L2Reviewed
    __draft('M2x','L2Reviewed',80);
    __emp('M2',{name:'เอ็มจีอาร์2',role:'l2',level:'mgr',l4:'จีเอ็ม'}); __draft('M2','L2Reviewed',80);
    window.prompt=()=>'ให้ประเมินใหม่ทั้งหมด';
    renderGmApproveQueue();
    const ck=document.querySelector('.gm-chk[value="M2|'+cy+'|of"]'); if(ck) ck.checked=true;
    await rejectGmSelected();
    const d3=getDrafts().find(d=>d[0]==='M2'); out.afterReject=d3&&d3[d3.length-1];
    return out;
  });
  ok(r.l2HasNoL1&&r.l2SeesL1Role,'ผจก.ส่วนเห็นหัวหน้าแผนกที่ไม่มี L1 ในหมวด __noL1__');
  ok(r.hasBucket&&r.seesMgr,'GM เห็น MGR (l2) ในหมวดไม่มี L1/L2');
  ok(r.afterScore==='L2Reviewed','GM ให้คะแนน MGR → ข้าม L1/L2 ไปรอ GM ('+r.afterScore+')');
  ok(r.editBtn,'คิว GM มีปุ่มประเมิน/อนุมัติในฟอร์มสำหรับผู้ประเมินคนเดียว');
  ok(r.afterGm==='GMApproved','GM อนุมัติในฟอร์ม → GMApproved ('+r.afterGm+')');
  ok(r.afterReject==='Draft','GM ตีกลับ (ผู้ประเมินคนเดียว) → Draft ('+r.afterReject+')');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
