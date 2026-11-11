const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    cyclesList.push({id:'FY2570-ANNUAL',name:'ประเมินประจำปี 2570',year:'2570',start:'',end:'',status:'Draft'});
    goalKpiData.push({id:'KX',name:'เก่า',unit:'ครั้ง',pct:5,target:'0',type:'ปริมาณ',scope:'org',year:'2501',status:'active'});
    populateKpiYearSelects();
    const vals=id=>[...document.getElementById(id).options].map(o=>o.value);
    const cur=getCurrentEvalCycleYear();
    const out={add:vals('mKpiYear'),act:vals('mKpiActivateYear'),flt:vals('goalFilterYear'),cur,
      actSel:document.getElementById('mKpiActivateYear').value,
      label:[...document.getElementById('mKpiYear').options].find(o=>o.value===cur).textContent,
      banner:document.getElementById('goalCycleBanner').textContent};
    editGoalKpi('KX');
    out.editYear=document.getElementById('mKpiYear').value;
    return out;
  });
  ok(r.add.includes('2570')&&r.add.includes(r.cur)&&r.add[0]==='','add form from real cycles '+JSON.stringify(r.add));
  ok(r.act.includes('2570')&&r.actSel===r.cur,'activate default=current '+r.actSel);
  ok(r.flt.includes('draft')&&r.flt.includes('2570'),'filter from cycles');
  ok(r.label.includes('รอบปัจจุบัน'),'label '+r.label);
  ok(r.banner.includes('FY'+r.cur),'banner '+r.banner);
  ok(r.editYear==='2501','edit keeps legacy year '+r.editYear);
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
