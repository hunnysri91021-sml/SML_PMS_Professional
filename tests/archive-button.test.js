/* #267: ปุ่มเก็บถาวร — export ก่อนลบ, ยกเลิก = ไม่ลบ, ไม่ใช่ Admin = ปฏิเสธ */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.isWorkerConfigured=()=>true; window.isMs365Configured=()=>true;
    const old=new Date(Date.now()-400*86400000).toISOString(), nw=new Date().toISOString();
    window.graphListTableRows=async()=>[[old,'u','a','b','c','d',''],[nw,'u','a','b','c','d','']];
    const calls=[]; window.workerFetch=async(cfg,path,o)=>{ const body=JSON.parse(o.body); calls.push({path,dry:!!body.dryRun});
      return body.dryRun?{count:1,total:2}:{deleted:1,remaining:0}; };
    let csv=null; window.downloadCsv=(n,h,rows)=>{ csv={n,rows:rows.length}; };
    const out={};
    window.prompt=()=>new Date(Date.now()-200*86400000).toISOString().slice(0,10);
    // ไม่ใช่ Admin
    const emp=__emp('X1',{role:'emp'}); __login(emp);
    await ms365ArchiveOldRows('AuditLog'); out.nonAdminCalls=calls.length;
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'}); __login(adm);
    // ยกเลิกตอน confirm → export แล้วแต่ไม่ลบ
    window.confirm=()=>false;
    await ms365ArchiveOldRows('AuditLog');
    out.cancelDeleted=calls.filter(c=>!c.dry).length; out.cancelCsv=csv&&csv.rows;
    // ยืนยัน → ลบ
    window.confirm=()=>true; csv=null; calls.length=0;
    await ms365ArchiveOldRows('AuditLog');
    out.okDeleted=calls.filter(c=>!c.dry).length; out.okCsv=csv&&csv.rows; out.path=calls[0]&&calls[0].path;
    return out;
  });
  ok(r.nonAdminCalls===0,'ไม่ใช่ Admin → ไม่เรียก Worker');
  ok(r.cancelCsv===1&&r.cancelDeleted===0,'ยกเลิก confirm → export แล้วแต่ไม่ลบ');
  ok(r.okCsv===1&&r.okDeleted===1&&r.path==='/admin/list-archive','ยืนยัน → export 1 แถว แล้วเรียกลบ');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
