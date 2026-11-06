/* #280: OrgMaster newer-wins (ลบข้ามเครื่องได้) + IDP วันที่เป็น serial */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.isMs365Configured=()=>true; window.confirm=()=>true;
    const out={};
    ORG_MASTER.positions=['A','B','C']; saveOrgMaster(); touchOrgMasterAt('positions','2026-01-01T00:00:00.000Z');
    // remote ใหม่กว่า และลบ B → ต้องหายจากเครื่องนี้
    window.graphListTableRows=async()=>[['positions',JSON.stringify(['A','C']),'2026-02-01T00:00:00.000Z']];
    await ms365SyncOrgMaster(true); out.afterDelete=ORG_MASTER.positions.slice();
    // เครื่องนี้แก้เองใหม่กว่า remote → คงของเครื่องนี้
    ORG_MASTER.positions=['A','C','D']; saveOrgMaster(); touchOrgMasterAt('positions','2026-03-01T00:00:00.000Z');
    window.graphListTableRows=async()=>[['positions',JSON.stringify(['A']),'2026-02-01T00:00:00.000Z']];
    await ms365SyncOrgMaster(true); out.localNewer=ORG_MASTER.positions.slice();
    // ไม่เคยแก้เอง → union เหมือนเดิม
    ORG_MASTER.sections=['S1']; saveOrgMaster(); localStorage.removeItem(ORG_MASTER_AT_KEY);
    window.graphListTableRows=async()=>[['sections',JSON.stringify(['S2']),'2026-02-01T00:00:00.000Z']];
    await ms365SyncOrgMaster(true); out.union=ORG_MASTER.sections.slice();
    // IDP
    out.due=[idpDueIn('46023'),idpDueIn('2026-05-01'),idpDueIn('')];
    window.graphListTableRows=async()=>[['E1','ชื่อ','แผนก','B','แผน','46023','owner','metric','pending']];
    await ms365SyncIdp(true); out.idp=idpData[0]&&idpData[0].due;
    return out;
  });
  ok(JSON.stringify(r.afterDelete)==='["A","C"]','Excel ใหม่กว่า → รับการลบ');
  ok(JSON.stringify(r.localNewer)==='["A","C","D"]','เครื่องนี้ใหม่กว่า → ไม่ถูกทับ');
  ok(JSON.stringify(r.union)==='["S1","S2"]','ไม่เคยแก้เอง → union เดิม');
  ok(r.due[0]==='2026-01-01'&&r.due[1]==='2026-05-01'&&r.due[2]==='','IDP แปลง serial เป็นวันที่');
  ok(r.idp==='2026-01-01','sync IDP ใช้วันที่แปลงแล้ว');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
