const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(async()=>{
    const toasts=[]; window.smlToast=(m,t)=>toasts.push(m);
    window.isMs365Configured=()=>true;
    const u=MASTER_USERS.find(x=>x[12]==='active');
    const fill=()=>{ openM('mAddUser'); fillUserFormFields(u); };
    // ล้มเหลว
    window.graphUpsertTableRow=async()=>{ throw new Error('forbidden: เฉพาะ Admin'); };
    fill(); await saveUserFromModal();
    const fail=toasts.slice();
    toasts.length=0;
    // สำเร็จ
    window.graphUpsertTableRow=async()=>'ok';
    fill(); await saveUserFromModal();
    const good=toasts.slice();
    // บทบาท
    toasts.length=0; window.pushSettingRow=undefined;
    return {fail,good};
  });
  ok(r.fail.some(m=>/ขึ้น Excel ไม่สำเร็จ.*forbidden/.test(m)),'ล้มเหลว → แจ้งเหตุผลจริง');
  ok(!r.fail.some(m=>/✅ ขึ้น Excel แล้ว/.test(m)),'ล้มเหลว → ไม่อ้างว่าขึ้นแล้ว');
  ok(r.good.some(m=>/✅ ขึ้น Excel แล้ว/.test(m)),'สำเร็จ → แจ้งว่าขึ้น Excel แล้ว');
  await b.close(); done();
})();
