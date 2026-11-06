/* #284: ดึง Attendance จาก Excel อ่านทศนิยม .5 และคอลัมน์ดิบ วัน/ชม./นาที (L–Q) ได้ + push ส่งคอลัมน์ดิบ */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __emp('A1'); __emp('A2'); __emp('A3');
    isMs365Configured=()=>true;
    const rows=[
      ['A1','x',2569,'','',3,'1,5','','','','', '','','','','',''],        // ไม่มีคอลัมน์ดิบ ทศนิยมจุลภาค
      ['A2','x',2569,2,'','3','1.5','','','','m', 1,4,'',3,'',''],         // มีคอลัมน์ดิบ → ใช้ดิบ
      ['A3','x',2569,'','','','','','','','', '','','','','','']
    ];
    graphListTableRows=async()=>rows;
    await ms365SyncAttendance(true);
    const o={a1:{...ATTENDANCE.A1},a2:{...ATTENDANCE.A2}};
    ATTENDANCE.B9={personalDay:1,personalHr:4,personalMin:0,sickDay:3,sickHr:0,sickMin:0};
    o.row=buildAttendanceExcelRow('B9',ATTENDANCE.B9);
    return o;
  });
  ok(r.a1.personalDay===1.5&&r.a1.sickDay===3,'ทศนิยม "1,5"/3 อ่านถูก');
  ok(r.a2.personalDay===1&&r.a2.personalHr===4&&r.a2.sickDay===3&&r.a2.sickMin===0,'มีคอลัมน์ดิบ → ใช้ วัน/ชม./นาที ดิบ');
  ok(r.row.length===17&&r.row[11]===1&&r.row[12]===4&&r.row[14]===3&&r.row[13]==='','push ส่งคอลัมน์ดิบ 17 ช่อง ('+r.row.join('|')+')');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
