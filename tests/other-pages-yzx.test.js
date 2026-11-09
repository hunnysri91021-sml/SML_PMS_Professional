const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    const cy=getCurrentEvalCycleYear();
    ['C1','C2'].forEach(c=>__emp(c,{name:'พนง'+c,role:'emp',level:'op'}));
    const mk=(c,y,z,st)=>[c,'x',cy,'op',1,2,3,4,5,6,7,8,9,10,11,y,z,y+z,'B',st];
    saveDrafts([mk('C1',40,20,'Acknowledged'),mk('C2',60,30,'Acknowledged')]);
    __login(MASTER_USERS.find(u=>u[2]==='admin')||MASTER_USERS[0]);
    renderCalibQueue();
    const calib=[...document.querySelectorAll('#calibRows tr:not(.org-grp-row)')].map(tr=>[...tr.children].map(c=>c.textContent.trim())).filter(x=>/พนงC/.test(x[0]));
    saveDrafts([mk('C1',40,20,'CalibChecked'),mk('C2',60,30,'CalibChecked')]);
    renderApproveQueue();
    const appr=[...document.querySelectorAll('#approveRows tr:not(.org-grp-row)')].map(tr=>[...tr.children].map(c=>c.textContent.trim())).filter(x=>/พนงC/.test(x[0]));
    saveDrafts([mk('C1',40,20,'Calibrated'),mk('C2',60,30,'Calibrated')]);
    renderCalibCheckQueue();
    const chk=[...document.querySelectorAll('#calibCheckRows tr')].map(tr=>[...tr.children].map(c=>c.textContent.trim()));
    return {calib,appr,chk,n:[...document.querySelectorAll('#pg-calib thead')].map(t=>t.querySelectorAll('th').length)};
  });
  ok(r.calib[0][0].includes('C2')&&r.calib[0][2]==='60.00'&&r.calib[0][3]==='30.00'&&r.calib[0][4]==='90','calib Y/Z/X sorted '+JSON.stringify(r.calib[0]));
  ok(r.appr[0][0].includes('C2')&&r.appr[0][2]==='60.00'&&r.appr[0][4].startsWith('90'),'approve Y/Z/X sorted '+JSON.stringify(r.appr[0]));
  ok(r.chk[0][1].includes('C2')&&r.chk[0][3]==='60.00'&&r.chk[0][5]==='90.00','calibcheck Y/Z/X sorted '+JSON.stringify(r.chk[0]));
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
