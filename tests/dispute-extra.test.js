/* ข้อโต้แย้ง: เตือนซ้ำเมื่อค้างเกินกำหนด + รับทราบพร้อมความเห็นต่าง (#255b) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true;
    const adds=[]; window.graphAddTableRow=async(t,row)=>{ adds.push(row); return 'ok'; };
    const sent=[]; window.isWorkerConfigured=()=>true;
    window.workerFetch=async(c,path,o)=>{ sent.push({path,body:JSON.parse(o.body)}); return {ok:true}; };
    const out={};
    __emp('GM1',{name:'จีเอ็ม',role:'gm',email:'gm@x.com'});
    __emp('L2X',{name:'ผจก',role:'l2',l4:'จีเอ็ม',email:'l2@x.com'});
    __emp('L1X',{name:'หน.แผนก',role:'l1',l3:'ผจก',l4:'จีเอ็ม',email:'l1@x.com'});
    const e=__emp('E1',{name:'สมชาย',role:'emp',l1:'หน.แผนก',l2:'หน.แผนก',l3:'ผจก',l4:'จีเอ็ม',email:'e@x.com'});
    const e2=__emp('E2',{name:'สมหญิง',role:'emp',l1:'หน.แผนก',l2:'หน.แผนก',l3:'ผจก',l4:'จีเอ็ม',email:'e2@x.com'});
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'}); adm[15]=adm[15]||'hr@x.com';
    const cy=getCurrentEvalCycleYear(); __draft('E1','ResultSent',80); __draft('E2','ResultSent',70);
    // A) ข้อโต้แย้งค้าง 8 วัน
    const old=new Date(Date.now()-8*86400000).toISOString();
    saveDisputes({['E1|'+cy]:{status:'open',reason:'ไม่เห็นด้วยกับคะแนนข้อสาม',proposed:['2099-01-10'],raisedAt:old,raisedBy:'สมชาย',scheduledDate:'',scheduledBy:'',scheduledAt:'',resolution:'',resolvedNote:'',resolvedBy:'',resolvedAt:''}});
    out.overdue=!!disputeOverdue(getDispute('E1',cy));
    __login(adm); renderNavBadges(); await new Promise(r=>setTimeout(r,600));
    out.reminded=!!getDispute('E1',cy).remindedAt && adds.some(a=>a[3]==='DisputeReminded');
    out.mails=sent.filter(s=>s.path==='/send-mail').length;
    out.bannerOd=/เกินกำหนด 1/.test(document.getElementById('disputeBanner').textContent);
    // ไม่ส่งซ้ำภายใน 24 ชม.
    const before=sent.length; _dpLastTry=0; await remindOverdueDisputes(); out.noRepeat=sent.length===before;
    // ยังไม่ครบ 7 วัน → ไม่ overdue
    out.freshNotOverdue=!disputeOverdue({status:'open',raisedAt:new Date().toISOString()});
    out.pastMeet=!!disputeOverdue({status:'scheduled',scheduledDate:'2000-01-01'});
    // B) รับทราบพร้อมความเห็นต่าง (E2)
    __login(e2); renderMyResult();
    out.btn=/รับทราบพร้อมความเห็นต่าง/.test(document.getElementById('myResultBannerText').innerHTML);
    openDisputeModal('E2',cy,'ack');
    out.datesHidden=document.getElementById('dpDatesBox').style.display==='none';
    document.getElementById('dpReason').value='สั้น'; await submitDispute();
    out.shortBlocked=getDrafts().find(d=>d[0]==='E2')[22]==='ResultSent';
    document.getElementById('dpReason').value='ขอบันทึกว่าไม่เห็นด้วยกับข้อสอง';
    await submitDispute();
    out.acked=getDrafts().find(d=>d[0]==='E2')[22]==='Acknowledged';
    out.noted=getDispute('E2',cy)&&getDispute('E2',cy).status==='noted';
    out.notBlocking=!hasOpenDispute('E2',cy);
    out.pushedNoted=adds.some(a=>a[3]==='DisputeNoted'&&a[0]==='E2');
    // ผู้ประเมินเห็นแถบส้ม (ไม่ใช่แดง) และไม่นับเป็นข้อโต้แย้งเปิด
    __login(MASTER_USERS.find(u=>u[0]==='L1X')); saveDisputes(Object.fromEntries(Object.entries(loadDisputes()).filter(([k])=>k.startsWith('E2')))); renderNavBadges();
    const bn=document.getElementById('disputeBanner');
    out.orange=bn.style.display!=='none' && /ความเห็นต่าง/.test(bn.textContent) && !getNotifications().some(n=>n.red);
    return out;
  });
  ok(r.overdue,'ค้างเกิน 7 วัน = เกินกำหนด');
  ok(r.reminded&&r.mails>=1,'admin เปิดระบบ → เตือนซ้ำ + บันทึก DisputeReminded');
  ok(r.bannerOd,'แถบแดงแสดง "เกินกำหนด"');
  ok(r.noRepeat,'ไม่เตือนซ้ำภายใน 24 ชม.');
  ok(r.freshNotOverdue&&r.pastMeet,'ยังไม่ครบกำหนดไม่เตือน / เลยวันนัดเตือน');
  ok(r.btn&&r.datesHidden,'มีปุ่ม "รับทราบพร้อมความเห็นต่าง" ไม่ต้องเสนอวัน');
  ok(r.shortBlocked,'ความเห็นสั้นเกินไปถูกปฏิเสธ');
  ok(r.acked&&r.noted&&r.notBlocking,'รับทราบเดินต่อ + บันทึกความเห็นต่าง ไม่บล็อก');
  ok(r.pushedNoted,'push DisputeNoted ขึ้น Approvals');
  ok(r.orange,'ผู้ประเมินเห็นแถบส้ม ไม่ใช่แดง');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
