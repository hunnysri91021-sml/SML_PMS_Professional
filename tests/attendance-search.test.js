/* #325: ค้นหารายชื่อที่มีข้อมูลเวลาด้วยรหัส (หรือชื่อ) — พิมพ์ในช่องค้นหาจริง ตารางต้องกรอง/นับ/ล้างได้ */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  await p.evaluate(()=>{
    const s=__emp('SYS9',{role:'sysadmin'});
    __emp('90040',{name:'นายภูวดล ปาราลิตร์'}); __emp('90057',{name:'นายทวี กัณหา'}); __emp('91021',{name:'นางสาวสมศรี ใจดี'});
    ['90040','90057','91021'].forEach(c=>{ ATTENDANCE[c]={absentDay:0,lateCount:1,earlyCount:0,personalDay:1,sickDay:0}; });
    saveAttendance(); __login(s); document.querySelector('.nav-item[data-pg="import"]').click();
  });
  const codes=()=>p.$$eval('#attRows tr td:first-child b',els=>els.map(e=>e.textContent));
  const all=await codes();
  ok(all.length>=3 && ['90040','90057','91021'].every(c=>all.includes(c)),'เริ่มต้นแสดงครบทุกคน ('+all.length+')');
  await p.fill('#attSearch','9005');
  let r=await codes();
  ok(r.length===1 && r[0]==='90057','พิมพ์ "9005" → เหลือ 90057 ('+r.join(',')+')');
  ok((await p.textContent('#attCount')).includes('1/'),'ตัวนับแสดง 1/ทั้งหมด ('+await p.textContent('#attCount')+')');
  ok(await p.isVisible('#attSearchClear'),'ปุ่มล้างปรากฏเมื่อมีคำค้น');
  await p.fill('#attSearch','  90040 ');
  r=await codes(); ok(r.length===1&&r[0]==='90040','ตัดช่องว่างหน้า-หลัง');
  await p.fill('#attSearch','สมศรี');
  r=await codes(); ok(r.length===1&&r[0]==='91021','ค้นด้วยชื่อได้ด้วย (อ่านชื่อจาก MASTER_USERS)');
  await p.fill('#attSearch','zzz');
  const empty=await p.textContent('#attRows'); ok(/ไม่พบ/.test(empty),'ไม่เจอ → ข้อความ "ไม่พบ" ('+empty.trim().slice(0,40)+')');
  // แถวที่กำลังแก้ไขอยู่ต้องไม่หาย แม้ไม่ตรงคำค้น
  await p.fill('#attSearch','');
  await p.evaluate(()=>editAttendanceRow('90040'));
  await p.fill('#attSearch','90057');
  r=await codes(); ok(r.includes('90040')&&r.includes('90057'),'แถวที่กำลังแก้ไขยังแสดงอยู่ ('+r.join(',')+')');
  await p.evaluate(()=>cancelEditAttendanceRow());
  await p.click('#attSearchClear');
  r=await codes(); ok(r.length>=3 && !(await p.isVisible('#attSearchClear')),'กดล้าง → กลับมาครบและปุ่มล้างหาย');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
