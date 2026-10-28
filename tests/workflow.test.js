/* Regression: workflow สถานะ/ตีกลับชนกับ auto-sync/ลายเซ็นในใบพิมพ์ (CLAUDE.md #134, #176, #124, #180, #224) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(async()=>{
    const out={};
    const admin=MASTER_USERS.find(u=>u[2]==='admin'&&u[12]==='active')||__emp('T-ADM',{role:'admin'});
    __login(admin);
    // #134: ตีกลับ → push ยังไม่เสร็จ → sync ดึงแถวเก่า ต้องไม่ทับ
    __emp('RJ1'); const d=__draft('RJ1','L1Reviewed',80);
    const old=d.slice();
    window.__remote=[old];
    let release; const gate=new Promise(r=>release=r);
    window.graphUpsertTableRow=async()=>{ await gate; return 'ok'; };
    const _skip=window.skipEmptyReviewStages; window.skipEmptyReviewStages=()=>{}; /* กันการข้ามขั้นอัตโนมัติ (#128) ปน */
    updateDraftStatus([draftKey(d)],'Submitted');
    await ms365SyncAppraisals(true);
    out.afterRaceSync=getDrafts().find(x=>x[0]==='RJ1')[22];
    window.skipEmptyReviewStages=_skip; release(); await new Promise(r=>setTimeout(r,50));
    out.pendingCleared=pendingPushKeys.size===0;
    // #224: guardFreshStatus ข้ามใบที่สถานะไม่ตรงขั้นที่คาด
    __emp('GF1'); __emp('GF2'); const a=__draft('GF1','Submitted',70), c=__draft('GF2','L1Reviewed',70);
    window.__remote=getDrafts().map(x=>x.slice());
    const okKeys=await guardFreshStatus([draftKey(a),draftKey(c)],'Submitted');
    out.guard=okKeys.length===1&&okKeys[0]===draftKey(a);
    // #176: ลายเซ็นจริงต่อขั้น + ใบพิมพ์
    const cy=getCurrentEvalCycleYear();
    __emp('SG1',{name:'พนักงาน ทดสอบ'}); const sd=__draft('SG1','GMApproved',85);
    recordStageSigner('SG1',cy,'L1Reviewed','L1X','หัวหน้า หนึ่ง');
    recordStageSigner('SG1',cy,'GMApproved','GMX','จีเอ็ม สอง');
    const html=buildEvalPrintPage(sd,'วันนี้');
    out.signL1=html.includes('หัวหน้า หนึ่ง'); out.signGM=html.includes('จีเอ็ม สอง');
    out.tick=html.includes('✓')&&!html.includes('○');
    // #180: ยังไม่ Calibrated → ส่วนเกรดหลัง Calibration แสดง placeholder ไม่ใช่เกรด
    out.calibPlaceholder=html.includes('ยังไม่ถึงขั้นตอน Calibration');
    // #124/#156: เกรดล็อกจนกว่า Approved สำหรับ employee — _sign ไม่เดาชื่อ
    const s=_sign('ผู้ประเมิน','หัวหน้า',false,'','');
    out.unsigned=!s.includes('ยืนยันแล้ว');
    return out;
  });
  ok(r.afterRaceSync==='Submitted','#134 sync ระหว่าง push ไม่ทับการตีกลับ ('+r.afterRaceSync+')');
  ok(r.pendingCleared,'pendingPushKeys เคลียร์หลัง push เสร็จ');
  ok(r.guard,'#224 guardFreshStatus ข้ามใบที่ไม่ตรงขั้น');
  ok(r.signL1&&r.signGM,'#176 ใบพิมพ์แสดงชื่อผู้ลงนามจริงของแต่ละขั้น');
  ok(r.tick,'#124 ใช้ ✓ ไม่ใช่ ○');
  ok(r.calibPlaceholder,'#180 ก่อน Calibration แสดง placeholder');
  ok(r.unsigned,'ช่องที่ยังไม่ลงนามไม่ขึ้น "ยืนยันแล้ว"');
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
