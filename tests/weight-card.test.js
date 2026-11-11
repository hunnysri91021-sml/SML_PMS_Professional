const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    __login(MASTER_USERS.find(u=>u[2]==='sysadmin')||MASTER_USERS.find(u=>u[2]==='admin')||MASTER_USERS[0]);
    showTplDetail('op');
    const sum=()=>document.getElementById('wSum_op').textContent;
    const out={card:!!document.querySelector('.wgt-card'),ids:['wY_op','wZ_op','wK_op'].every(i=>document.getElementById(i))};
    out.ok=sum();
    document.getElementById('wK_op').value=10; updateWeightSum('op'); out.bad=sum(); out.badCls=document.getElementById('wSum_op').className;
    out.barY=document.getElementById('wBar_op').children[0].style.width;
    return out;
  });
  ok(r.card&&r.ids,'การ์ดและช่องกรอกอยู่ครบ');
  ok(/100%/.test(r.ok)&&/บันทึกได้/.test(r.ok),'รวม 100 แสดงพร้อมบันทึก: '+r.ok);
  ok(/110%/.test(r.bad)&&/เกิน 10/.test(r.bad)&&/bad/.test(r.badCls),'เกิน 100 เตือนทันที: '+r.bad);
  ok(parseFloat(r.barY)>0,'แถบสัดส่วนอัปเดต');
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
