/* สิทธิ์เมนู/สิทธิ์บทบาท sync ข้ามเครื่อง (#316) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(async()=>{
    localStorage.clear(); const pushes=[]; window.isMs365Configured=()=>true;
    window.graphUpsertTableRow=async(t,k,v,row)=>{ pushes.push(row.slice()); return 'ok'; };
    // ตั้งสิทธิ์เมนู: ให้ emp เห็น 'org'
    const sa=MASTER_USERS.find(u=>u[2]==='sysadmin')||MASTER_USERS[0]; CURRENT_SESSION_USER=sa; document.getElementById('roleSel').value='sysadmin'; const pg='org'; renderNavPermEditor();
    const cb=document.getElementById('np_'+pg+'_emp'); cb.checked=true; saveNavPermsFromForm();
    ROLE_PERMS.emp.name='ชื่อทดสอบ'; saveRolePerms(); await new Promise(r=>setTimeout(r,50));
    const nav=pushes.find(x=>x[0]==='__navperms__'), role=pushes.find(x=>x[0]==='__roleperms__');
    // เครื่องใหม่
    localStorage.clear(); loadNavPerms(); loadRolePerms();
    const before=[NAV_PERMS.org.includes('emp'), ROLE_PERMS.emp.name];
    applyPermSettingRows([nav,role]);
    const after=[NAV_PERMS.org.includes('emp'), ROLE_PERMS.emp.name];
    // ค่าเก่ากว่าไม่ทับ
    localStorage.setItem('smlPmsNavPermsAt','2999-01-01T00:00:00Z');
    const old=[nav[0],JSON.stringify({perms:{org:['admin']},at:'2020-01-01T00:00:00Z'}),''];
    applyPermSettingRows([old]);
    return {hasRows:!!nav&&!!role,before,after,keep:NAV_PERMS.org.includes('emp')};
  });
  ok(r.hasRows,'บันทึกแล้ว push __navperms__/__roleperms__');
  ok(r.before[0]===false&&r.before[1]!=='ชื่อทดสอบ','เครื่องใหม่ยังเป็นค่าเริ่มต้น');
  ok(r.after[0]===true&&r.after[1]==='ชื่อทดสอบ','ดึงจาก Excel แล้วได้ค่าที่ Admin ตั้งไว้');
  ok(r.keep,'ค่าในเครื่องที่ใหม่กว่าไม่ถูกทับ');
  ok(errs.length===0,'ไม่มี pageerror '+errs.join(';'));
  await b.close(); done();
})();
