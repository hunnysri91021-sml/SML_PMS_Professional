/* SystemStatus: เฉพาะ Admin เขียนขึ้น Excel (#261) — กัน 403 บนเครื่องพนักงาน */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    window.isMs365Configured=()=>true;
    const adds=[]; window.graphAddTableRow=async(t,row)=>{ adds.push(t); return 'ok'; };
    const emp=__emp('ST1',{role:'emp'}); const adm=__emp('ST2',{role:'admin'});
    __login(emp); await pushSystemStatusToMs365('x',1);
    const empAdds=adds.length;
    __login(adm); await pushSystemStatusToMs365('x',1);
    return {empAdds, adminAdds:adds.length-empAdds, table:adds[adds.length-1]};
  });
  ok(r.empAdds===0,'พนักงานทั่วไปไม่เขียน SystemStatus (ไม่ยิง 403)');
  ok(r.adminAdds===1&&r.table==='SystemStatus','Admin ยังเขียน SystemStatus ได้');
  ok(errs.length===0,'ไม่มี pageerror '+errs.join('|'));
  await b.close(); done();
})();
