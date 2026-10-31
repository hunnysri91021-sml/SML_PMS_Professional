const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    __emp('M1',{name:'ผจก',role:'l1'});
    __emp('T1',{name:'มีเวลา',role:'emp',l1:'ผจก'});
    __emp('T2',{name:'ไม่มีเวลา',role:'emp',l1:'ผจก'});
    ATTENDANCE['T1']={lateCount:9,earlyCount:7,personalDay:1,sickDay:2,absentDay:0};
    delete ATTENDANCE['T2'];
    const m=MASTER_USERS.find(x=>x[0]==='M1'); __login(m);
    renderTeamFromMaster();
    let cap=null; window.downloadCsv=(n,h,rows)=>{cap={h,rows};};
    exportTeamListToExcel();
    return cap;
  });
  console.log(JSON.stringify(r));
  ok(r&&r.h.includes('คะแนน Z ที่ได้')&&r.h.includes('วันลารวม (สูตร Z)'),'headers added');
  const t1=r.rows.find(x=>x[0]==='T1'), t2=r.rows.find(x=>x[0]==='T2');
  ok(t1&&t1[t1.length-1]!=='' ,'T1 has Z score '+(t1&&t1[t1.length-1]));
  ok(t2&&t2[t2.length-1]===''&&t2.includes('ไม่มีข้อมูลเวลา'),'T2 blank + flagged');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
