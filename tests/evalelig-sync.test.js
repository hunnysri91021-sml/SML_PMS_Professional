/* สิทธิ์ประเมินตนเอง sync ข้ามเครื่อง (#316) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    localStorage.removeItem('smlPmsEvalEligibility');
    const pushes=[]; window.isMs365Configured=()=>true;
    window.graphUpsertTableRow=async(t,k,v,row)=>{ pushes.push(row.slice()); return 'ok'; };
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||MASTER_USERS[0]; CURRENT_SESSION_USER=adm;
    renderEvalEligibilityPage();
    document.getElementById('evalElig_mode').value='restricted';
    const chk=[...document.querySelectorAll('.evalelig-dept-chk')][0];
    if(chk) chk.checked=true;
    const dept=chk&&chk.value;
    EVAL_ELIGIBILITY.emps=['X1']; // หลัง render (render จะ reload จาก storage — ดู #62)
    saveEvalEligibilitySettings(); await new Promise(r=>setTimeout(r,50));
    const row=pushes[pushes.length-1];
    // เครื่องใหม่: ล้าง local แล้ว pull
    localStorage.removeItem('smlPmsEvalEligibility'); loadEvalEligibility();
    const before=JSON.stringify(EVAL_ELIGIBILITY.depts);
    applyEvalEligibilityRows([row]);
    return {dbg:[document.querySelectorAll('.evalelig-dept-chk').length,JSON.stringify(EVAL_ELIGIBILITY)],row0:row&&row[0],dept,before,after:EVAL_ELIGIBILITY.depts,emps:EVAL_ELIGIBILITY.emps,hasAt:!!EVAL_ELIGIBILITY.at,n:pushes.length};
  });
  ok(r.n===1&&r.row0==='__evalelig__','บันทึกแล้ว push แถว __evalelig__ ขึ้น Excel');
  ok(r.before==='[]','เครื่องใหม่เริ่มว่าง');
  ok(r.dept && r.after.includes(r.dept) && r.emps.includes('X1') && r.hasAt,'ดึงจาก Excel แล้วได้แผนก+รายบุคคลที่ตั้งไว้คืน');
  const r2=await p.evaluate(()=>{ // local ใหม่กว่า → ไม่ถูกทับ
    localStorage.setItem('smlPmsEvalEligibility',JSON.stringify({mode:'all',depts:[],emps:[],at:'2999-01-01T00:00:00Z'}));
    applyEvalEligibilityRows([['__evalelig__',JSON.stringify({mode:'restricted',depts:['Z'],emps:[],at:'2020-01-01T00:00:00Z'}),'']]);
    return loadEvalEligibility().mode; });
  ok(r2==='all','ค่าในเครื่องที่ใหม่กว่าไม่ถูกทับด้วยค่าเก่าจาก Excel');
  ok(errs.length===0,'ไม่มี pageerror '+errs.join(';'));
  await b.close(); done();
})();
