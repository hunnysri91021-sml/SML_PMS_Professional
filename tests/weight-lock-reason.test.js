const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    __login(MASTER_USERS.find(u=>u[2]==='sysadmin')||MASTER_USERS.find(u=>u[2]==='admin')||MASTER_USERS[0]);
    showTplDetail('op');
    const out={};
    out.zRO=document.getElementById('wZ_op').readOnly;
    const set=(id,v)=>{const e=document.getElementById(id+'_op');e.value=v;e.oninput&&e.oninput();};
    set('wK',10); out.y=Number(document.getElementById('wY_op').value);
    // no drafts -> no prompt
    let prompted=0; window.prompt=()=>{prompted++;return '';};
    saveScoreWeightsFromForm('op'); out.promptNoDraft=prompted;
    // with drafts -> prompt, short reason refused
    const cyc=getCurrentEvalCycleYear();
    const d=Array(23).fill(0); d[0]='X1';d[2]=cyc;d[3]='op';d[22]='Submitted'; saveDrafts([d]);
    showTplDetail('op'); set('wK',20);
    saveScoreWeightsFromForm('op'); out.promptWithDraft=prompted;
    window.prompt=()=>{prompted++;return 'นโยบายใหม่ปีนี้';};
    saveScoreWeightsFromForm('op');
    out.log=JSON.stringify(getAuditLog()[0]||{});
    out.saved=getScoreWeightsFor('op',cyc).kpct;
    return out;
  });
  ok(r.zRO,'Z ล็อกเป็นค่าเริ่มต้น');
  ok(r.y===60,'Y ลดตาม KPI (Z คงที่): '+r.y);
  ok(r.promptNoDraft===0,'ไม่มีใบประเมิน = ไม่ถามเหตุผล');
  ok(r.promptWithDraft===1,'มีใบประเมิน = ถามเหตุผล');
  ok(r.log.includes('เหตุผล: นโยบายใหม่ปีนี้')&&r.saved===20,'บันทึกพร้อมเหตุผลใน log: '+r.log);
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
