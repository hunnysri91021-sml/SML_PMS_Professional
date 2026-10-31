const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    __emp('C1',{name:'มีเวลา',role:'emp'}); __emp('C2',{name:'ไม่มีเวลา',role:'emp'});
    ATTENDANCE['C1']={lateCount:9,earlyCount:7,personalDay:1,sickDay:2,absentDay:0}; delete ATTENDANCE['C2'];
    const e1=MASTER_USERS.find(x=>x[0]==='C1'), e2=MASTER_USERS.find(x=>x[0]==='C2');
    const d=['C1','x','2569','op',1,2,3,4,5,6,7,8,9,10,11,12,13,50,20,70,'B','Acknowledged'];
    window.buildTierRoster=()=>[{emp:e1,draft:d,state:'ready'},{emp:e2,draft:null,state:'pending'}];
    window.getCalibScopedRoster=()=>[{emp:e1,draft:d,state:'ready'}];
    let t=null,s=null; window.downloadCsv=(n,h,rows)=>{ if(n.startsWith('CalibTable'))t={h,rows}; else s={h,rows}; };
    exportCalibTableList(); exportCalibScopedList();
    return {t,s};
  });
  for(const k of ['t','s']){
    ok(r[k].h.includes('วันลารวม (สูตร Z)'),k+' has leave cols');
    ok(!r[k].h.some(x=>String(x).includes('ชั่วคราว')),k+' no provisional header');
    ok(r[k].rows[0].every(x=>x!=='B'),k+' provisional grade B not exported');
  }
  ok(r.t.rows[1].includes('ไม่มีข้อมูลเวลา'),'pending flagged no attendance');
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
