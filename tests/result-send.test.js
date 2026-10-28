/* Regression: GM ยืนยันส่งผลให้พนักงาน (ResultSent) + MD อนุมัติแล้วส่งผลให้ HR (CLAUDE.md #238) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(async()=>{
    const out={}; const cy=getCurrentEvalCycleYear();
    window.confirm=()=>true;
    const mail=[]; window.isWorkerConfigured=()=>true;
    window.workerFetch=async(c,path,o)=>{ mail.push({path,body:JSON.parse(o.body)}); return {ok:true}; };
    // L1/L2/GM chain
    const gm=__emp('G1',{role:'gm',name:'จีเอ็ม',email:'gm@x.com'});
    const l2=__emp('L2A',{role:'l2',name:'ผจก',l3:'จีเอ็ม',email:'l2@x.com'}); l2[11]='จีเอ็ม';
    const emp=__emp('E1',{name:'พนักงานหนึ่ง',email:'e1@x.com'}); emp[19]='ผจก'; emp[11]='จีเอ็ม';
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin'&&u[12]==='active'); adm[15]='hr@x.com'; __login(adm);
    // 1) GM อนุมัติ → GMApproved แต่พนักงานยังไม่เห็น/ไม่ถูกแจ้ง
    __draft('E1','L2Reviewed',82);
    renderWorkflowPages();
    const k=draftKey(getDrafts().find(d=>d[0]==='E1'));
    document.querySelector('.gm-chk[value="'+k+'"]').checked=true;
    await approveGmSelected();
    out.afterApprove=getDrafts().find(d=>d[0]==='E1').slice(-1)[0];
    out.mailAfterApprove=mail.filter(m=>m.body.toEmail==='e1@x.com').length;
    out.visibleBeforeSend=hasVisibleResult(out.afterApprove);
    out.rowShown=!!document.querySelector('.gmsend-chk[value="'+k+'"]');
    // พนักงานรับทราบก่อนส่งไม่ได้
    await acknowledgeMyResult('E1',cy); out.ackBlocked=getDrafts().find(d=>d[0]==='E1').slice(-1)[0]==='GMApproved';
    // 2) กดยืนยันส่ง → ResultSent + แจ้งพนักงาน
    document.querySelector('.gmsend-chk[value="'+k+'"]').checked=true;
    await sendResultToEmployeesSelected();
    out.afterSend=getDrafts().find(d=>d[0]==='E1').slice(-1)[0];
    out.mailAfterSend=mail.filter(m=>m.body.toEmail==='e1@x.com').length;
    out.visibleAfterSend=hasVisibleResult(out.afterSend);
    // 3) พนักงานรับทราบได้
    await acknowledgeMyResult('E1',cy); out.afterAck=getDrafts().find(d=>d[0]==='E1').slice(-1)[0];
    // 4) MD อนุมัติ → ไม่ส่งพนักงาน แต่ส่ง HR
    const d=getDrafts().find(x=>x[0]==='E1'); d[d.length-1]='CalibChecked'; saveDrafts(getDrafts().map(x=>x[0]==='E1'?d:x));
    mail.length=0; document.getElementById('mApproveSign').value='MD ทดสอบ';
    await approveAllFinal();
    out.final=getDrafts().find(x=>x[0]==='E1').slice(-1)[0];
    out.mailToEmp=mail.filter(m=>m.body.toEmail==='e1@x.com').length;
    out.mailToHr=mail.filter(m=>m.body.toEmail==='hr@x.com').length;
    out.hrBody=(mail.find(m=>m.body.toEmail==='hr@x.com')||{body:{}}).body.body||'';
    return out;
  });
  ok(r.afterApprove==='GMApproved','GM อนุมัติ → GMApproved ('+r.afterApprove+')');
  ok(r.mailAfterApprove===0,'อนุมัติ GM ไม่ส่งอีเมลพนักงานอัตโนมัติ');
  ok(!r.visibleBeforeSend,'พนักงานยังไม่เห็นผลก่อนกดยืนยันส่ง');
  ok(r.rowShown,'แถวขึ้นในตาราง "ยืนยันส่งผลให้พนักงาน"');
  ok(r.ackBlocked,'พนักงานกดรับทราบก่อน GM ส่งผลไม่ได้');
  ok(r.afterSend==='ResultSent','กดยืนยันส่ง → ResultSent ('+r.afterSend+')');
  ok(r.mailAfterSend===1,'ส่งอีเมลแจ้งพนักงาน 1 ฉบับเมื่อกดยืนยันส่ง');
  ok(r.visibleAfterSend,'พนักงานเห็นผลหลังส่ง');
  ok(r.afterAck==='Acknowledged','พนักงานรับทราบได้หลังส่งผล ('+r.afterAck+')');
  ok(r.final==='Approved','MD อนุมัติ → Approved');
  ok(r.mailToEmp===0,'ขั้น MD ไม่ส่งอีเมลให้พนักงาน');
  ok(r.mailToHr===1&&r.hrBody.includes('E1'),'ขั้น MD ส่งอีเมลแจ้ง HR พร้อมรายชื่อ');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
