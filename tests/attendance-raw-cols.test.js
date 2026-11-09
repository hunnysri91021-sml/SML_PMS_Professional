/* #286: ดึง Attendance อ่านทศนิยม .5 และค่าดิบ วัน/ชม./นาที จากตารางแยก AttendanceDetail (ไม่ใช่คอลัมน์ L–Q ของชีท — ชน Z_Table) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __emp('A1'); __emp('A2'); __emp('A3');
    isMs365Configured=()=>true;
    const att=[['A1','x',2569,'','',3,'1,5','','','',''],['A2','x',2569,2,'','3','1.5','','','','m'],['A3','x',2569,'','','','','','','','']];
    const det=[['A2','x',1,4,'',3,'',''],['A3','x','','','','','','']];
    let detMissing=false;
    graphListTableRows=async(t)=>{ if(t==='AttendanceDetail'){ if(detMissing) throw new Error('Table not found'); return det; } return att; };
    await ms365SyncAttendance(true);
    const o={a1:{...ATTENDANCE.A1},a2:{...ATTENDANCE.A2},a3:{...ATTENDANCE.A3}};
    detMissing=true; await ms365SyncAttendance(true); o.noTable=ATTENDANCE.A1.personalDay;
    ATTENDANCE.B9={personalDay:1,personalHr:4,personalMin:0,sickDay:3,sickHr:0,sickMin:0};
    o.row=buildAttendanceExcelRow('B9',ATTENDANCE.B9); o.det=buildAttendanceDetailRow('B9',ATTENDANCE.B9);
    return o;
  });
  ok(r.a1.personalDay===1.5&&r.a1.sickDay===3,'ทศนิยม "1,5"/3 อ่านถูก');
  ok(r.a2.personalDay===1&&r.a2.personalHr===4&&r.a2.sickDay===3,'มีแถวใน AttendanceDetail → ใช้ วัน/ชม./นาที ดิบ');
  ok(r.a3.personalDay===0&&r.a3.sickDay===0,'แถว Detail ว่างหมด → ไม่ทับ (ใช้ F/G)');
  ok(r.noTable===1.5,'ไม่มีตาราง AttendanceDetail → ไม่ error ใช้ F/G ตามเดิม');
  ok(r.row.length===11,'แถว Attendance 11 ช่อง ('+r.row.length+')');
  ok(r.det.length===8&&r.det[2]===1&&r.det[3]===4&&r.det[5]===3&&r.det[4]==='','แถว AttendanceDetail 8 ช่อง ('+r.det.join('|')+')');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
