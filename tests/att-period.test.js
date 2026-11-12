const { chromium } = require('playwright'); const path=require('path');
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.resolve(__dirname,'../SML_PMS_v14.html')); await p.waitForTimeout(500);
  const r=await p.evaluate(async()=>{
    localStorage.removeItem('smlPmsAttPeriod');
    const none=attPeriodLabel();
    CURRENT_SESSION_USER=MASTER_USERS.find(u=>u[2]==='sysadmin')||MASTER_USERS[0];
    window.isAdminOrSysadmin=()=>true;
    const pushed=[]; window.isMs365Configured=()=>true;
    window.graphUpsertTableRow=async(t,k,v,row)=>{pushed.push(row);};
    document.getElementById('attPeriodFrom').value='2025-12-01';
    document.getElementById('attPeriodTo').value='2026-11-30';
    await saveAttPeriod();
    const lab=attPeriodLabel(); const head=document.getElementById('attPeriodHead').textContent;
    // bad range rejected
    document.getElementById('attPeriodTo').value='2025-01-01'; const before=localStorage.getItem('smlPmsAttPeriod'); await saveAttPeriod();
    const same=before===localStorage.getItem('smlPmsAttPeriod');
    // sync from remote newer
    window.graphListTableRows=async()=>[['__attperiod__',JSON.stringify({from:'2026-01-01',to:'2026-12-31',at:'2999-01-01T00:00:00Z'}),'']];
    await ms365SyncFormWeights(true);
    return {none,lab,head,same,pushedKey:pushed[0]&&pushed[0][0],synced:attPeriodLabel(),
      print:typeof printEvalForm};
  });
  console.log(JSON.stringify(r));
  const ok=r.none==='ยังไม่ระบุช่วงข้อมูล'&&r.lab.includes('1 ธ.ค. 2568')&&r.lab.includes('30 พ.ย. 2569')&&r.head===r.lab&&r.same&&r.pushedKey==='__attperiod__'&&r.synced.includes('31 ธ.ค. 2569')&&!errs.length;
  console.log(ok?'PASS att-period':'FAIL att-period',errs);
  await b.close(); process.exit(ok?0:1);
})();
