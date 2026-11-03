/* พนักงานไม่ยอมรับผลประเมิน → ขอหารือ/นัดวัน/HR ปิดเรื่อง (#255) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const adds=[]; window.graphAddTableRow=async(t,row)=>{ adds.push({t,row}); return 'ok'; };
    const out={};
    __emp('GM1',{name:'จีเอ็ม',role:'gm'});
    __emp('L2X',{name:'ผจก',role:'l2',l4:'จีเอ็ม'});
    __emp('L1X',{name:'หน.แผนก',role:'l1',l3:'ผจก',l4:'จีเอ็ม'});
    const e=__emp('E1',{name:'สมชาย',role:'emp',l1:'หน.แผนก',l2:'หน.แผนก',l3:'ผจก',l4:'จีเอ็ม'});
    __emp('OTHER',{name:'คนอื่น',role:'l1'});
    const cy=getCurrentEvalCycleYear(); __draft('E1','ResultSent',80);
    const key='E1|'+cy+'|of';
    // 1) พนักงานขอหารือ
    __login(e); renderMyResult();
    out.btnShown=/ไม่ยอมรับผล/.test(document.getElementById('myResultBannerText').innerHTML);
    openDisputeModal('E1',cy);
    document.getElementById('dpReason').value='สั้น'; await submitDispute();
    out.shortRejected=!hasOpenDispute('E1',cy);
    document.getElementById('dpReason').value='คะแนนข้อ 3 ไม่ตรงกับผลงานจริง';
    document.getElementById('dpD1').value='2099-01-10'; document.getElementById('dpD2').value='2099-01-12';
    await submitDispute();
    out.open=hasOpenDispute('E1',cy);
    out.pushed=adds.some(a=>a.t==='Approvals'&&a.row[3]==='DisputeRaised'&&a.row[0]==='E1'&&a.row[6].includes('| DISPUTE:'));
    out.ackBlocked=(await acknowledgeMyResult('E1',cy), getDrafts().find(d=>d[0]==='E1')[22]==='ResultSent');
    renderMyResult();
    out.noAckBtn=!/acknowledgeMyResult/.test(document.getElementById('myResultBannerText').innerHTML);
    // 2) ผู้เกี่ยวข้องเห็นสีแดง, คนนอกสายไม่เห็น
    __login(MASTER_USERS.find(u=>u[0]==='L1X')); renderNavBadges();
    out.l1Banner=document.getElementById('disputeBanner').style.display!=='none' && /1 ราย/.test(document.getElementById('disputeBanner').textContent);
    out.l1Notif=getNotifications().some(n=>n.red);
    __login(MASTER_USERS.find(u=>u[0]==='OTHER')); renderNavBadges();
    out.otherNone=document.getElementById('disputeBanner').style.display==='none';
    // 3) หัวหน้ายืนยันวัน
    __login(MASTER_USERS.find(u=>u[0]==='L1X')); openDisputeList();
    document.getElementById('dpSel_E1').value='1'; await confirmDisputeDate('E1',cy);
    const rec=getDispute('E1',cy);
    out.scheduled=rec.status==='scheduled' && rec.scheduledDate==='2099-01-12';
    // 4) หัวหน้า (ไม่ใช่ admin) ปิดเรื่องไม่ได้
    await resolveDispute('E1',cy); out.nonAdminBlocked=getDispute('E1',cy).status==='scheduled';
    // 5) admin ปิดเรื่อง: ประเมินใหม่ → ใบกลับ Submitted
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'}); __login(adm); openDisputeList();
    document.getElementById('dpOut_E1').value='redo'; document.getElementById('dpNote_E1').value='ตกลงให้ประเมินข้อ 3 ใหม่';
    await resolveDispute('E1',cy);
    out.resolved=getDispute('E1',cy).status==='resolved';
    out.redoStatus=getDrafts().find(d=>d[0]==='E1')[22];
    // 6) ซิงก์กลับ: เครื่องอื่นที่ไม่มีข้อมูล รับ event ล่าสุดจาก Approvals
    const evs=adds.filter(a=>a.row[3].startsWith('Dispute')).map(a=>a.row);
    saveDisputes({}); window.isMs365Configured=()=>true; window.graphListTableRows=async()=>evs;
    await ms365SyncDisputes(true);
    out.synced=getDispute('E1',cy)&&getDispute('E1',cy).status==='resolved';
    return out;
  });
  ok(r.btnShown,'ปุ่ม "ไม่ยอมรับผล" แสดงให้พนักงาน');
  ok(r.shortRejected,'เหตุผลสั้นเกินไปถูกปฏิเสธ');
  ok(r.open&&r.pushed,'บันทึกข้อโต้แย้ง + push Approvals (DisputeRaised)');
  ok(r.ackBlocked&&r.noAckBtn,'ระหว่างหารือ รับทราบไม่ได้และปุ่มหาย');
  ok(r.l1Banner&&r.l1Notif,'ผู้ประเมินในสายเห็นแถบแดง+กระดิ่งแดง');
  ok(r.otherNone,'คนนอกสายไม่เห็น');
  ok(r.scheduled,'หัวหน้ายืนยันวันนัดจากที่พนักงานเสนอ');
  ok(r.nonAdminBlocked,'ไม่ใช่ HR ปิดเรื่องไม่ได้');
  ok(r.resolved&&r.redoStatus==='Submitted','HR ปิดเรื่อง "ประเมินใหม่" → ใบกลับ Submitted');
  ok(r.synced,'ซิงก์กลับจาก Approvals ได้');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
