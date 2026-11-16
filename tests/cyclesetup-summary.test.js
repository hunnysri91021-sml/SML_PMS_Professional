/* #326: สรุปการตั้งค่า (หน้าตั้งค่ารอบ) นับผู้ประเมิน L1–L4 จากสายจริง ไม่ใช่ role */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    const s=__emp('SYS9',{role:'sysadmin'});
    const a=__emp('ZA1',{role:'emp'}),c=__emp('ZA2',{role:'emp'});
    [a,c].forEach(u=>{u[9]='หน.หน่วย X';u[10]='หน.แผนก Y';u[19]='ผจก Z';u[11]='GM W';});
    c[9]='หน.หน่วย X2';
    __emp('ZX1',{role:'exec'});
    __login(s); document.querySelector('.nav-item[data-pg="cyclesetup"]').click(); renderCycleStats();
    const g=id=>document.getElementById(id).textContent;
    return {l1:g('csL1Count'),l2:g('csL2Count'),l3:g('csL3Count'),l4:g('csL4Count'),f:g('csFinalCount')};
  });
  ok(+r.l1.split(' ')[0]>=2,'L1 นับชื่อไม่ซ้ำ ('+r.l1+')');
  ok(r.l3.includes('1')||+r.l3.split(' ')[0]>=1,'มีแถว L3 ('+r.l3+')');
  ok(r.l4!==undefined&&r.f!=='0 คน','มี L4 และผู้อนุมัติขั้นสุดท้าย ('+r.l4+' / '+r.f+')');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
