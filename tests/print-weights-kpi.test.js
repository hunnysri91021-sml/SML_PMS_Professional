/* #301: ใบพิมพ์/ป้ายสัดส่วนต้องตามค่าที่ Admin ตั้ง (Y/Z/KPI ต่อรอบ) และแสดงคะแนน KPI */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(()=>{
    const out={}; const cy=getCurrentEvalCycleYear();
    __login(MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('T-SYS',{role:'sysadmin'}));
    saveScoreWeightsForLevelSilent('of',50,30,20);
    __emp('PK1',{name:'มี KPI'}); __emp('PK2',{name:'ไม่มี KPI'});
    goalKpiData=[{id:'P1',name:'ยอดขาย',unit:'บาท',pct:100,target:'≥100',type:'ปริมาณ',scope:'person',empCode:'PK1',status:'active',year:cy,targetVal:100,actualVal:80,direction:'up',note:''}];
    saveKpiData();
    __draft('PK1','Submitted',70); __draft('PK2','Submitted',70);
    const ds=getDrafts();
    const set=(c,Y,Z,X)=>{const d=ds.find(x=>x[0]===c); d[d.length-5]=Y; d[d.length-4]=Z; d[d.length-3]=X;};
    set('PK1',30,25,71); set('PK2',45,25,70);
    saveDrafts(ds);
    const pg1=buildEvalPrintPage(getDrafts().find(d=>d[0]==='PK1'),'1/1/2569');
    const pg2=buildEvalPrintPage(getDrafts().find(d=>d[0]==='PK2'),'1/1/2569');
    out.p1=[pg1.includes('Y (50%)'),pg1.includes('KPI (20%)'),pg1.includes('+ KPI 16.00')];
    out.p2=[pg2.includes('Y (70%)'),!pg2.includes('KPI (20%)')];
    // ป้ายแบบฟอร์ม
    out.cfg=SML_FORMS.of.kpct===20;
    return out;
  });
  ok(r.p1.every(Boolean),'ใบพิมพ์คนมี KPI แสดง Y50/KPI20/สูตร: '+JSON.stringify(r.p1));
  ok(r.p2.every(Boolean),'คนไม่มี KPI: Y รวมส่วน KPI (70%) และไม่มีช่อง KPI: '+JSON.stringify(r.p2));
  ok(r.cfg,'SML_FORMS ได้ kpct จากที่ตั้ง');
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
