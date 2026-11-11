const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    const cy=getCurrentEvalCycleYear();
    const u=__emp('K1',{name:'พนงK',role:'emp',level:'of'});
    __emp('K2',{name:'พนงN',role:'emp',level:'of'});
    // สัดส่วน Y60/Z30/KPI10 ของรอบนี้
    const w=getScoreWeightsFor('of',cy); w.kpct=10; w.ypct=60; w.zpct=30;
    window.getScoreWeightsFor=()=>({ypct:60,zpct:30,kpct:10});
    goalKpiData.push({id:'KP1',name:'Zero Accident',unit:'ครั้ง',pct:100,target:'0',type:'ความปลอดภัย',scope:'person',empCode:'K1',targetVal:'10',actualVal:'8',direction:'up',year:cy,status:'active'});
    const mk=(c,st)=>[c,'n',cy,'of',2,2,2,2,2,2,2,2,2,2,null,null,null,null,50,30,20,58,'B',st];
    saveDrafts([mk('K1','ResultSent'),mk('K2','ResultSent')]);
    const out={};
    __login(u); renderMyResult();
    out.withKpi=document.getElementById('myResultBreakdownArea').textContent.replace(/\s+/g,' ');
    out.sub=document.getElementById('myResultXSub').textContent;
    __login(MASTER_USERS.find(x=>x[0]==='K2')); renderMyResult();
    out.noKpi=document.getElementById('myResultBreakdownArea').textContent.replace(/\s+/g,' ');
    out.subNo=document.getElementById('myResultXSub').textContent;
    return out;
  });
  ok(r.withKpi.includes('คะแนน KPI')&&r.withKpi.includes('Zero Accident')&&r.withKpi.includes('Y + Z + KPI'),'มีช่อง KPI '+r.withKpi);
  ok(r.sub.includes('Y+Z+KPI'),'sub '+r.sub);
  ok(r.withKpi.includes('8.00 / 10'),'KPI = X-Y-Z');
  ok(!r.noKpi.includes('KPI')&&r.subNo.includes('(Y+Z)')&&!r.subNo.includes('KPI'),'ไม่มี KPI ไม่โชว์ '+r.noKpi);
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
