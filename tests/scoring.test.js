/* Regression: สูตรคะแนน/สถานะ/ชนิดข้อมูลจาก Excel (CLAUDE.md #99, #103, #117, #160, #170, #78, #61) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(()=>{
    const out={};
    // #99: สาย+กลับก่อน 8 ครั้ง = 1 วัน, ตัดเศษ
    out.late=[0,7,8,15,16,23,24].map(n=>computeZDays({lateCount:n}));
    out.mix=computeZDays({absentDay:1,sickDay:2,personalDay:1,lateCount:8});
    // #103: ช่วง 0-5 วัน ได้คะแนนเต็ม ทั้ง 3 ระดับ
    out.zFlat=['emp','ldr','mgr'].map(k=>Z_TABLE[k].slice(0,6).every(v=>v===Z_TABLE[k][0]));
    out.zMax=[Z_TABLE.emp[0],Z_TABLE.ldr[0],Z_TABLE.mgr[0]];
    out.zDrop=['emp','ldr','mgr'].map(k=>Z_TABLE[k][6]<Z_TABLE[k][5]);
    // #61: สถานะ
    out.final=[isFinalStatus('Approved'),isFinalStatus('Calibrated')];
    out.vis=[hasVisibleResult('Submitted'),hasVisibleResult('GMApproved'),hasVisibleResult('Approved')];
    out.rank=evalStatusRank('Submitted')<evalStatusRank('L1Reviewed')&&evalStatusRank('L2Reviewed')<evalStatusRank('GMApproved')&&evalStatusRank('Acknowledged')<evalStatusRank('Calibrated')&&evalStatusRank('Calibrated')<evalStatusRank('Approved');
    // #160/#170: Graph ส่ง EmpID/รอบ เป็น number
    const row=normalizeAppraisalRow([90526,'x',2569,'of',1,2,3,4,5,6,7,8,9,10,null,null,null,null,50,20,70]);
    out.norm=[typeof row[0],typeof row[2],typeof row[3],typeof row[4]];
    // #161/#170: getDrafts self-heal ชนิดข้อมูลที่ cache ไว้เก่า
    localStorage.setItem(MS365_LOCAL_DRAFT_KEY,JSON.stringify([[90526,'x',2569,'of',1,2,3,4,5,6,7,8,9,10,0,0,0,0,50,20,70,'B','Submitted']]));
    const d=getDrafts()[0]; out.heal=[typeof d[0],typeof d[2]];
    // #78: Excel serial date
    out.serial=[excelSerialDateToThaiString('41519'),excelSerialDateToThaiString('16/07/2559'),excelSerialDateToThaiString('')];
    return out;
  });
  ok(JSON.stringify(r.late)==='[0,0,1,1,2,2,3]','late ÷8 floor: '+r.late);
  ok(r.mix===2+1+3+1,'mixed days = '+r.mix);
  ok(r.zFlat.every(Boolean),'Z flat 0-5 days');
  ok(JSON.stringify(r.zMax)==='[30,20,10]','Z max 30/20/10: '+r.zMax);
  ok(r.zDrop.every(Boolean),'Z drops at day 6');
  ok(r.final[0]&&!r.final[1],'isFinalStatus only Approved');
  ok(!r.vis[0]&&r.vis[1]&&r.vis[2],'hasVisibleResult from GMApproved');
  ok(r.rank,'status order');
  ok(r.norm.join()==='string,string,string,number','normalizeAppraisalRow types: '+r.norm);
  ok(r.heal.join()==='string,string','getDrafts self-heal: '+r.heal);
  ok(r.serial[0]==='2/9/2556'&&r.serial[1]===null&&r.serial[2]===null,'serial date: '+r.serial);
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
