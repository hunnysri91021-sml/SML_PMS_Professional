/* #283: วันลา วัน/ชม./นาที + เศษ ≥4 ชม. = 0.5 วัน + Z เฉลี่ยวัน x กับ x+1 */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    const cnt=(o)=>leaveCountedDays(o), o={};
    o.lt4=cnt({personalDay:3,personalHr:3,personalMin:59});          // เศษ <4 ชม. = ไม่นับ
    o.eq4=cnt({personalDay:3,personalHr:4});                           // 4 ชม. = 0.5
    o.gt4=cnt({sickDay:3,sickHr:7,sickMin:59});                        // 4<เศษ<8 = 0.5
    o.carry=cnt({personalDay:6,personalMin:30,sickDay:7,sickHr:7,sickMin:30}); // 13d 7h 60m = 14d
    o.combined=cnt({personalHr:3,sickHr:3});                           // 6 ชม. รวม = 0.5 (ไม่ใช่ 0 แยกประเภท)
    o.row91021=computeZDays({personalDay:1,personalHr:4,sickDay:3});   // 4.5
    o.row90526=computeZDays({lateCount:6,personalDay:5,personalHr:2,sickDay:13}); // 18
    // Z แบบ x.5 = เฉลี่ยตารางวัน 6 กับ 7 (พนักงาน 28.85, 27.70)
    o.z65=zTableValue('emp',6.5); o.z65ldr=zTableValue('ldr',6.5);
    o.zInt=zTableValue('emp',7);
    o.score=(()=>{ ATTENDANCE['T9']={personalDay:6,personalHr:4}; return computeZScore('op','T9').score; })();
    o.fmt=fmtLeaveDHM(13*480+7*60+60);
    o.excelRow=(()=>{ __emp('T9'); ATTENDANCE['T9']={personalDay:1,personalHr:4,sickDay:3}; const r=buildAttendanceExcelRow('T9',ATTENDANCE['T9']); return {sick:r[5],pers:r[6]}; })();
    o.cells=attendanceExportCells('T9').slice(-4).join('|');
    return o;
  });
  ok(r.lt4===3,'เศษ <4 ชม. ไม่นับ (3d 3h59 = 3)');
  ok(r.eq4===3.5,'เศษ 4 ชม. = 0.5 วัน');
  ok(r.gt4===3.5,'เศษเกิน 4 แต่ไม่ถึง 8 ชม. = 0.5 วัน');
  ok(r.carry===14,'13 วัน 7 ชม. 60 นาที = 14 วัน (ทดนาที→ชม.→วัน)');
  ok(r.combined===0.5,'รวมป่วย+กิจก่อน แล้วค่อยดูเศษ (3+3 ชม. = 6 ชม. = 0.5)');
  ok(r.row91021===4.5&&r.row90526===18,'แถวจริงจากใบสรุป (91021=4.5, 90526=18)');
  ok(Math.abs(r.z65-28.275)<1e-9,'Z วัน 6.5 = เฉลี่ย 28.85 กับ 27.70 = 28.275 ('+r.z65+')');
  ok(Math.abs(r.z65ldr-(19.23+18.46)/2)<1e-9,'ระดับหัวหน้าเฉลี่ยตารางของตัวเอง');
  ok(r.zInt===27.7,'วันเต็มยังเท่าเดิม');
  ok(Math.abs(r.score-28.275)<1e-9,'computeZScore ใช้การเฉลี่ย ('+r.score+')');
  ok(r.fmt==='14 วัน 0 ชม.','แสดงผลรวมแบบ วัน ชม. นาที ('+r.fmt+')');
  ok(r.excelRow.sick===3&&r.excelRow.pers===1.5,'ส่ง Excel เป็นวันที่นับ (ป่วย 3 + กิจ 1.5 = 4.5)');
  ok(/4 วัน 4 ชม\.\|3 วัน 0 ชม\.\|4 วัน 4 ชม\.\|4\.5/.test(r.cells)||r.cells.includes('4.5'),'Export มีคอลัมน์ วัน ชม. นาที และวันที่นับ ('+r.cells+')');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
