const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    __login(MASTER_USERS.find(u=>u[2]==='sysadmin')||MASTER_USERS.find(u=>u[2]==='admin')||MASTER_USERS[0]);
    showTplDetail('op');
    const set=(id,v)=>{const e=document.getElementById(id+'_op');e.value=v;e.oninput&&e.oninput();};
    const val=id=>Number(document.getElementById(id+'_op').value);
    const out={};
    set('wK',20); out.y1=val('wY'); out.z=val('wZ');
    set('wZ',10); out.y2=val('wY');
    out.sum=document.getElementById('wSum_op').textContent;
    saveScoreWeightsFromForm('op');
    out.log=JSON.stringify(getAuditLog()[0]||{});
    return out;
  });
  ok(r.y1===100-r.z-20,'Y เติมอัตโนมัติจาก KPI: '+r.y1);
  ok(r.y2===70,'Y ปรับตาม Z: '+r.y2);
  ok(/100%/.test(r.sum),'รวม 100');
  ok(r.log.includes('เดิม')&&r.log.includes('ใหม่ Y=70%'),'log เดิม→ใหม่: '+r.log);
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
