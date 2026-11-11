const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    const cy=getCurrentEvalCycleYear();
    __emp('A1',{name:'คนหนึ่ง',role:'emp',level:'op',dept:'D1'});
    __emp('A2',{name:'คนสอง',role:'emp',level:'of',dept:'D1'});
    __emp('A3',{name:'คนสาม',role:'emp',level:'of',dept:'D1'});
    goalKpiData.push({id:'KA',name:'ผลผลิต',unit:'ชิ้น',pct:10,target:'100',type:'ปริมาณ',scope:'dept',year:cy,status:'active',targetVal:100,actualVal:50,direction:'up'});
    __login(MASTER_USERS.find(u=>u[2]==='admin')||MASTER_USERS[0]);
    cascadeData.length=0;
    cascadeData.push({kpiId:'KA',kpiName:'ผลผลิต',kpiYear:cy,level:'emp',dept:'D1',target:'',weight:20});
    renderCascadeRows();
    openCascadeActuals(0);
    const rows=[...document.querySelectorAll('#cascadeActualsRows .cas-act')].map(i=>i.dataset.code);
    document.querySelector('.cas-act[data-code="A1"]').value='90';
    document.querySelector('.cas-act[data-code="A2"]').value='abc';
    const blocked=document.querySelector('.cas-act[data-code="A2"]').value===''; // type=number ไม่รับตัวอักษร
    saveCascadeActuals();
    const pc=c=>{const x=computeKpiScoreForEmp(c,cy);return x.hasKpi?Math.round(x.pct):null;};
    return {rows,blocked,saved:cascadeData[0].actuals,a1:pc('A1'),a2:pc('A2'),a3:pc('A3'),persisted:JSON.parse(localStorage.getItem('smlPmsKpiCascade')).list[0].actuals};
  });
  ok(r.rows.includes('A1')&&r.rows.includes('A3'),'modal แสดงพนักงานที่ตรงเงื่อนไข');
  ok(r.blocked,'ช่องไม่รับตัวอักษร');
  ok(r.a1===90,'A1 ใช้ผลรายคน 90 '+r.a1);
  ok(r.a2===50&&r.a3===50,'คนที่เว้นว่างใช้ค่ากลุ่ม 50 '+r.a2+','+r.a3);
  ok(r.persisted&&r.persisted.A1===90,'บันทึกถาวร');
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
