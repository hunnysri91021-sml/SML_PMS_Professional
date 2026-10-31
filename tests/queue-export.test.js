const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    __emp('Q1',{name:'มีเวลา',role:'emp'}); __emp('Q2',{name:'ไม่มีเวลา',role:'emp'});
    ATTENDANCE['Q1']={lateCount:9,earlyCount:7,personalDay:1,sickDay:2,absentDay:0}; delete ATTENDANCE['Q2'];
    const e1=MASTER_USERS.find(x=>x[0]==='Q1'), e2=MASTER_USERS.find(x=>x[0]==='Q2');
    const d=['Q1','x','2569','op',1,2,3,4,5,6,7,8,9,10,11,12,13,50,20,70,'B','Submitted'];
    _queueExportRows.review=[{emp:e1,draft:d,state:'ready'},{emp:e2,draft:null,state:'pending'}];
    let cap=null; window.downloadCsv=(n,h,rows)=>{cap={n,h,rows};};
    exportQueueToExcel('review'); const l3=cap;
    _queueExportRows.reviewl1=[{emp:e1,draft:d,state:'ready'}];
    exportQueueToExcel('reviewl1'); const l2=cap;
    return {l3,l2,btns:['reviewl1','review','gmapprove'].map(k=>!!document.querySelector(`[onclick="exportQueueToExcel('${k}')"]`))};
  });
  ok(r.btns.every(x=>x),'3 buttons exist');
  ok(r.l3.rows.length===2&&r.l3.rows[0][9]===70&&!r.l3.h.includes('เกรดชั่วคราว'),'L3 no grade col, X=70');
  ok(r.l3.rows[1][6]==='ยังไม่ส่งแบบประเมิน'&&r.l3.rows[1].includes('ไม่มีข้อมูลเวลา'),'pending + no attendance flagged');
  ok(r.l2.h.includes('เกรดชั่วคราว'),'L2 has grade col');
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
