/* ล้างข้อมูลเลือกส่วนได้: ผลประเมิน / สถิติเวลา / Audit Log แยกกัน (ทั้ง Worker, ในเครื่อง, และตราให้เครื่องอื่น) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.isWorkerConfigured=()=>true; window.isMs365Configured=()=>true;
    const calls=[]; window.workerFetch=async(cfg,path,o)=>{ const body=JSON.parse(o.body); calls.push({path,table:body.table,dry:!!body.dryRun});
      if(path==='/admin/clear-columns') return {rows:2};
      return body.dryRun?{total:3}:{deleted:3,remaining:0}; };
    window.graphListTableRows=async()=>[Array(24).fill('a')];
    const csvs=[]; window.downloadCsv=(n)=>{csvs.push(n);};
    const upserts=[]; window.graphUpsertTableRow=async(t,k,key)=>{ upserts.push(key); return 'ok'; };
    window.confirm=()=>true; window.prompt=()=>'ล้างข้อมูล';
    const sys=__emp('SYS9',{role:'sysadmin'}); __emp('E9',{role:'emp'}); __login(sys);
    const out={};
    const seed=()=>{ __draft('E9','Submitted',80); ATTENDANCE['E9']={absentDay:1}; saveAttendance(); appendAuditLog('data','x','E9','y'); };
    // 1) ล้างเฉพาะผลประเมิน
    seed(); calls.length=0; csvs.length=0; upserts.length=0;
    await resetTestData(['eval']);
    out.evalTables=calls.filter(c=>!c.dry&&c.path==='/admin/clear-table').map(c=>c.table).join();
    out.evalCols=calls.filter(c=>!c.dry&&c.path==='/admin/clear-columns').length;
    out.evalDrafts=getDrafts().length; out.evalAtt=Object.keys(ATTENDANCE).length;
    out.evalAuditKept=JSON.parse(localStorage.getItem(AUDIT_LOG_KEY)||'[]').length>0;
    out.evalRows=upserts.join();
    // 2) ล้างเฉพาะสถิติเวลา
    seed(); calls.length=0; upserts.length=0;
    await resetTestData(['att']);
    out.attTables=calls.filter(c=>!c.dry&&c.path==='/admin/clear-table').map(c=>c.table).join();
    out.attCols=calls.filter(c=>!c.dry&&c.path==='/admin/clear-columns').length;
    out.attDrafts=getDrafts().length; out.attAtt=Object.keys(ATTENDANCE).length;
    out.attRows=upserts.join();
    // 3) ไม่เลือกส่วนใดเลยผ่านหน้าต่าง → ไม่ทำอะไร
    openResetDataModal(); ['eval','att','audit'].forEach(s=>document.getElementById('rst_'+s).checked=false);
    calls.length=0; submitResetModal(); out.noneCalls=calls.length;
    // 4) ผ่านหน้าต่าง: ติ๊ก Audit Log อย่างเดียว
    openResetDataModal(); document.getElementById('rst_audit').checked=true; calls.length=0; seed();
    submitResetModal(); await new Promise(r=>setTimeout(r,200));
    out.auditTables=calls.filter(c=>!c.dry&&c.path==='/admin/clear-table').map(c=>c.table).join();
    // 5) เครื่องอื่น: ตราแยกส่วน
    seed();
    localStorage.setItem(RESET_APPLIED_PREFIX+'att','2000-01-01T00:00:00Z');
    applyResetEpochRows([['__reset__att',JSON.stringify({at:'2030-01-01T00:00:00Z'}),'x']]);
    out.otherAtt=Object.keys(ATTENDANCE).length; out.otherDrafts=getDrafts().length;
    __draft('E9','Submitted',70); ATTENDANCE['E9']={absentDay:2}; saveAttendance();
    applyResetEpochRows([['__reset__att',JSON.stringify({at:'2030-01-01T00:00:00Z'}),'x']]);
    out.sameKeepsAtt=Object.keys(ATTENDANCE).length;
    localStorage.setItem(RESET_APPLIED_PREFIX+'eval','2000-01-01T00:00:00Z');
    applyResetEpochRows([['__reset__eval',JSON.stringify({at:'2030-01-01T00:00:00Z'}),'x']]);
    out.otherEvalDrafts=getDrafts().length; out.otherEvalAttKept=Object.keys(ATTENDANCE).length;
    // 6) ล้างครบทุกส่วน → เขียนตาเดิม __reset__ ด้วย
    seed(); upserts.length=0; await resetTestData(); out.allRows=upserts.join();
    return out;
  });
  ok(r.evalTables==='Appraisals,Approvals,IDP'&&r.evalCols===0,'ล้างเฉพาะผลประเมิน → ไม่แตะ AuditLog/Attendance ที่ Worker ('+r.evalTables+')');
  ok(r.evalDrafts===0&&r.evalAtt===1&&r.evalAuditKept,'ผลประเมินหาย แต่เวลา/Audit Log ในเครื่องยังอยู่');
  ok(r.evalRows==='__reset__eval','เขียนตา __reset__eval อย่างเดียว ('+r.evalRows+')');
  ok(r.attTables==='AttendanceDetail'&&r.attCols===1,'ล้างเฉพาะสถิติเวลา → Attendance คอลัมน์ + AttendanceDetail ('+r.attTables+')');
  ok(r.attDrafts===1&&r.attAtt===0,'เวลาหาย แต่ใบประเมินยังอยู่');
  ok(r.attRows==='__reset__att','เขียนตา __reset__att อย่างเดียว');
  ok(r.noneCalls===0,'ไม่ติ๊กส่วนใด → ไม่เรียก Worker');
  ok(r.auditTables==='AuditLog','ติ๊ก Audit Log อย่างเดียว → ล้างเฉพาะ AuditLog ('+r.auditTables+')');
  ok(r.otherAtt===0&&r.otherDrafts>=1,'เครื่องอื่นเจอ __reset__att → ล้างเฉพาะเวลา ใบประเมินยังอยู่');
  ok(r.sameKeepsAtt===1,'ตราเดิมซ้ำ → ไม่ล้างข้อมูลใหม่');
  ok(r.otherEvalDrafts===0&&r.otherEvalAttKept===1,'เครื่องอื่นเจอ __reset__eval → ล้างเฉพาะผลประเมิน เวลาไม่ถูกแตะ');
  ok(r.allRows.split(',').includes('__reset__')&&r.allRows.includes('__reset__eval'),'ล้างครบ → เขียนทั้งตาแยกและ __reset__ เดิม ('+r.allRows+')');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
