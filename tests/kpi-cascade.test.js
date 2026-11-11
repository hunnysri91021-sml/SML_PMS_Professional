const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    const cy=getCurrentEvalCycleYear();
    __emp('C1',{name:'ปฏิบัติ',role:'emp',level:'op',dept:'D1'});
    __emp('C2',{name:'สำนักงาน',role:'emp',level:'of',dept:'D1'});
    __emp('C3',{name:'ฝ่ายอื่น',role:'emp',level:'of',dept:'D2'});
    __emp('C4',{name:'หัวหน้า',role:'l1',level:'ldr',dept:'D1'});
    goalKpiData.push({id:'KC',name:'Zero Accident',unit:'ครั้ง',pct:10,target:'0',type:'ความปลอดภัย',scope:'org',year:cy,status:'active',targetVal:10,actualVal:8,direction:'up'});
    const out={};
    out.before=['C1','C2'].map(c=>computeKpiScoreForEmp(c,cy).hasKpi);
    __login(MASTER_USERS.find(u=>u[2]==='admin')||MASTER_USERS[0]);
    document.getElementById('mCascadeKpiId').innerHTML='<option value="KC">x</option>';
    document.getElementById('mCascadeLevel').value='emp';
    document.getElementById('mCascadeDept').innerHTML='<option value="D1">D1</option>';
    document.getElementById('mCascadeDept').value='D1';
    document.getElementById('mCascadeWeight').value='20';
    saveCascadeKpi();
    out.after=['C1','C2','C3','C4'].map(c=>{const r=computeKpiScoreForEmp(c,cy);return r.hasKpi?Math.round(r.pct):null;});
    out.persisted=JSON.parse(localStorage.getItem('smlPmsKpiCascade')).list.length;
    out.printBox=buildKpiPrintBoxHtml('C2',cy,'of').includes('Zero Accident');
    // duplicate blocked
    saveCascadeKpi(); out.dup=cascadeData.length;
    return out;
  });
  ok(r.before.every(x=>!x),'ก่อน Cascade ไม่นับ KPI org '+JSON.stringify(r.before));
  ok(r.after[0]===80&&r.after[1]===80,'ปฏิบัติการ+สำนักงาน (ฝ่าย D1) ได้ 80% '+JSON.stringify(r.after));
  ok(r.after[2]===null&&r.after[3]===null,'ฝ่ายอื่น/หัวหน้าไม่ได้ '+JSON.stringify(r.after));
  ok(r.persisted===1&&r.dup===1,'บันทึกถาวร + กันซ้ำ');
  ok(r.printBox,'ใบพิมพ์แสดง KPI ที่ Cascade');
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
