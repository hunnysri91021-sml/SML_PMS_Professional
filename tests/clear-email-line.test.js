/* ล้างอีเมล/LINE User ID ในฟอร์มแก้ไขพนักงาน → ล้างในเว็บ + push ค่าว่างขึ้น Excel + ดึงกลับแล้วล้างในเครื่องอื่น (#322) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(async()=>{
    window.smlToast=()=>{}; window.isMs365Configured=()=>true;
    const pushed=[]; window.graphUpsertTableRow=async(t,c,k,row)=>{ pushed.push([t,row]); return 'updated'; };
    const u=MASTER_USERS.find(x=>x[12]==='active');
    u[15]='a@b.co'; u[21]='Uabc123';
    openM('mAddUser'); fillUserFormFields(u);
    const before=[document.getElementById('mu_email').value, document.getElementById('mu_lineid').value];
    document.getElementById('mu_email').value=''; document.getElementById('mu_lineid').value='';
    await saveUserFromModal();
    const e=MASTER_USERS.find(x=>x[0]===u[0]);
    const emp=pushed.find(x=>x[0]==='Employees'||/Employees/i.test(x[0]));
    const set=pushed.find(x=>/Settings/i.test(x[0]));
    // อีกเครื่อง: มี LINE ID เดิม แล้วดึงแถว EmployeeSettings ที่ LineUserId ว่าง
    e[21]='Uold';
    applyEmployeeSettingsRows([[u[0],'','', '', '', '']]);
    const afterPull=e[21];
    // คอลัมน์ไม่มีอยู่ (แถวสั้น) = ไม่แตะ
    e[21]='Ukeep'; applyEmployeeSettingsRows([[u[0],'','']]); const keep=e[21];
    return {before, email:e[15], line:'', setRow:set&&set[1], empHasEmail:emp&&emp[1].includes('a@b.co'), afterPull, keep};
  });
  ok('ฟอร์มเติมค่าเดิม', r.before[0]==='a@b.co' && r.before[1]==='Uabc123');
  ok('ล้างอีเมลในเว็บ', r.email==='');
  ok('push EmployeeSettings คอลัมน์ LineUserId เป็นค่าว่าง', r.setRow && r.setRow[5]==='');
  ok('push Employees ไม่มีอีเมลเดิม', r.empHasEmail===false);
  ok('ดึงแถวที่ LineUserId ว่าง → ล้างในเครื่องอื่น', r.afterPull==='');
  ok('แถวสั้น (ไม่มีคอลัมน์) ไม่แตะ', r.keep==='Ukeep');
  ok('ไม่มี pageerror', errs.length===0);
  await b.close(); done();
})();
