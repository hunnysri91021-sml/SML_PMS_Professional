/* Regression: KPI และสูตร X=Y+Z+KPI (CLAUDE.md #184-#187) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(()=>{
    const out={};
    out.up=[computeKpiAchievementPct({targetVal:100,actualVal:70,direction:'up'}),computeKpiAchievementPct({targetVal:100,actualVal:150,direction:'up'})];
    out.down=[computeKpiAchievementPct({targetVal:2,actualVal:4,direction:'down'}),computeKpiAchievementPct({targetVal:0,actualVal:0,direction:'down'})];
    out.blank=computeKpiAchievementPct({targetVal:'',actualVal:'',direction:'up'});
    const cy=getCurrentEvalCycleYear();
    goalKpiData=[
      {id:'T1',name:'a',pct:50,scope:'person',empCode:'KP1',status:'active',year:cy,targetVal:100,actualVal:100,direction:'up'},
      {id:'T2',name:'b',pct:50,scope:'person',empCode:'KP1',status:'active',year:cy,targetVal:100,actualVal:50,direction:'up'},
      {id:'T3',name:'c',pct:50,scope:'person',empCode:'KP1',status:'active',year:'1999',targetVal:100,actualVal:0,direction:'up'},
      {id:'T4',name:'d',pct:50,scope:'dept',empCode:'KP1',status:'active',year:cy,targetVal:100,actualVal:0,direction:'up'}];
    const k=computeKpiScoreForEmp('KP1',cy);
    out.kpi=[k.hasKpi,Math.round(k.pct)];
    out.none=computeKpiScoreForEmp('NOBODY',cy).hasKpi;
    // baseline kpct=0 → X = Y + Z (ไม่มี KPI มาปน)
    const x=computeEvalXWithKpi('of','KP1',cy,10,20,20);
    const w=getScoreWeightsFor('of',cy);
    out.base=[w.kpct,Math.abs(x.X-(x.Y+x.Z))<1e-9,x.KPI];
    out.noKpiRedistribute=Math.abs(computeEvalXWithKpi('of','NOBODY',cy,20,20,0).Y-(w.ypct+w.kpct))<1e-9;
    // #231 กล่อง KPI บนใบพิมพ์
    out.boxPerson=buildKpiPrintBoxHtml('KP1',cy,'of');
    out.boxNone=buildKpiPrintBoxHtml('NOBODY',cy,'of');
    return out;
  });
  ok(r.boxPerson.includes('KPI รายบุคคล')&&r.boxPerson.includes('75.0%')&&r.boxPerson.includes('>a<')&&!r.boxPerson.includes('>d<'),'ใบพิมพ์แสดง KPI รายบุคคล (เฉพาะ person ของคนนี้ ผลจริง 75%)');
  ok(r.boxNone==='','ไม่มี KPI และ kpct=0 → ไม่แสดงกล่อง');
  ok(r.up[0]===70&&r.up[1]===100,'KPI ยิ่งมากยิ่งดี capped 100: '+r.up);
  ok(r.down[0]===50&&r.down[1]===100,'KPI ยิ่งน้อยยิ่งดี: '+r.down);
  ok(r.blank===null,'ไม่มีค่าจริง → null ไม่เดา');
  ok(r.kpi[0]&&r.kpi[1]===75,'KPI รวมถ่วงน้ำหนัก เฉพาะ person/ปีนี้/active: '+r.kpi);
  ok(!r.none,'พนักงานไม่มี KPI → hasKpi=false');
  ok(r.base[0]===0&&r.base[1]&&r.base[2]===0,'ค่าเริ่มต้น kpct=0 ไม่กระทบสูตรเดิม');
  ok(r.noKpiRedistribute,'ไม่มี KPI → คืนสัดส่วนให้ Y');
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
