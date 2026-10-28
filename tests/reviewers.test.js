/* Regression: ผู้สอบทานตามสายบังคับบัญชา/scope/ข้ามขั้น (CLAUDE.md #86, #88, #92, #128, #145, #158) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(()=>{
    const out={}; const cy=getCurrentEvalCycleYear();
    // สายครบ: emp → unit → l1(แผนก) ; L3(u[19])=ผจก.ส่วน(l2) ; L4(u[11])=GM
    const gm=__emp('R-GM',{name:'จีเอ็ม',role:'gm'});
    const l2=__emp('R-L2',{name:'ผจกส่วน',role:'l2'});
    const l1=__emp('R-L1',{name:'หัวหน้าแผนก',role:'l1'});
    const un=__emp('R-UN',{name:'หัวหน้าหน่วย',role:'unit',l1:'หัวหน้าแผนก'});
    const e1=__emp('R-E1',{name:'ลูกน้องเต็มสาย',l1:'หัวหน้าหน่วย',l3:'ผจกส่วน',l4:'จีเอ็ม'});
    const e2=__emp('R-E2',{name:'ลูกน้องไม่มีสาย'});
    const e3=__emp('R-E3',{name:'ลูกน้องชื่อมีเว้นวรรค',l1:'หัวหน้าแผนก ',l3:'ผจกส่วน',l4:'จีเอ็ม'});
    out.l1viaUnit=resolveL1Reviewer(e1)===l1;           // ไล่ผ่านหัวหน้าหน่วยไปหาหัวหน้าแผนก
    out.l1direct=resolveL1Reviewer(e3)===l1;           // trim ชื่อ
    out.l2=resolveL2Reviewer(e1)===l2; out.gm=resolveGmReviewer(e1)===gm;
    out.topNull=[resolveL1Reviewer(l1),resolveL2Reviewer(l2),resolveGmReviewer(gm)].every(x=>x===null);
    // #158: GM ไม่จำเป็นต้อง role gm
    const e4=__emp('R-E4',{name:'ลูกน้อง4',l4:'ผจกส่วน'}); out.gmAnyRole=resolveGmReviewer(e4)===l2;
    // #128: ไม่มีผู้สอบทานเลย → ถูกบล็อก, GM ไม่ถูกบล็อก
    out.blocked=!hasAnyRealReviewer(e2); out.gmNotBlocked=hasAnyRealReviewer(gm); out.chain=getRealReviewChain(e1).map(x=>x.stage).join();
    // ข้ามขั้น: e5 มีแค่ GM → Submitted ข้ามไป L2Reviewed (ไม่มี L1/L2) แล้วหยุดรอ GM
    const e5=__emp('R-E5',{name:'ลูกน้อง5',l4:'จีเอ็ม'}); __draft('R-E5','Submitted',70);
    skipEmptyReviewStages('R-E5',cy,'of'); out.skip=getDrafts().find(d=>d[0]==='R-E5').slice(-1)[0];
    // scope
    const set=u=>{ CURRENT_SESSION_USER=u; return [...getMyScopedEmpCodes()].sort().join(); };
    out.scopeUnit=set(un); out.scopeL1=set(l1); out.scopeL2=set(l2); out.scopeGM=set(gm);
    CURRENT_SESSION_USER=MASTER_USERS.find(u=>u[2]==='admin')||l1;
    out.adminNull=(CURRENT_SESSION_USER[2]==='admin')?getMyScopedEmpCodes()===null:true;
    return out;
  });
  ok(r.l1viaUnit,'L1: ไล่ผ่านหัวหน้าหน่วยไปหาหัวหน้าแผนก');
  ok(r.l1direct,'L1: ชื่อมีช่องว่างท้ายยังจับคู่ได้ (#86)');
  ok(r.l2&&r.gm,'L2=u[19] ผู้ตรวจ MGR, GM=u[11] ผู้อนุมัติ (#145)');
  ok(r.topNull,'ระดับสูงสุดของแต่ละขั้นไม่ต้องมีผู้สอบทานเหนือตน');
  ok(r.gmAnyRole,'#158 ผู้อนุมัติ GM ไม่จำเป็นต้อง role gm');
  ok(r.blocked&&r.gmNotBlocked,'#128 ไม่มีผู้สอบทานเลย → บล็อก ยกเว้น GM');
  ok(r.chain==='L1Reviewed,L2Reviewed,GMApproved','สายจริงครบ 3 ขั้น: '+r.chain);
  ok(r.skip==='L2Reviewed','#128 ข้ามขั้นที่ไม่มีผู้สอบทานแล้วหยุดรอ GM: '+r.skip);
  ok(r.scopeUnit==='R-E1,R-UN','scope unit = ทีมตัวเอง+ตัวเอง: '+r.scopeUnit);
  ok(r.scopeL1.includes('R-E1')&&r.scopeL1.includes('R-UN')&&r.scopeL1.includes('R-E3')&&!r.scopeL1.includes('R-E2'),'scope l1 รวมทีมของหัวหน้าหน่วย (#92): '+r.scopeL1);
  ok(r.scopeL2.includes('R-E1')&&r.scopeL2.includes('R-E3')&&!r.scopeL2.includes('R-E2'),'scope l2 ตาม u[19] (#145): '+r.scopeL2);
  ok(r.scopeGM.includes('R-E1')&&r.scopeGM.includes('R-E5')&&r.scopeGM.includes('R-E3')&&r.scopeGM.includes('R-E4')===false,'scope gm ตาม u[11]: '+r.scopeGM);
  ok(r.adminNull,'admin ไม่ถูกจำกัด scope');
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
