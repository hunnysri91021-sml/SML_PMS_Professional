/* Regression: แบนเนอร์ Attendance หน้า Calibration + export รายละเอียดเวลา (CLAUDE.md #229) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(async()=>{
    const out={};
    const admin=MASTER_USERS.find(u=>u[2]==='admin'&&u[12]==='active')||__emp('T-ADM',{role:'admin'});
    __login(admin);
    window.confirm=()=>true;
    __emp('AT1',{group:'ATG'}); __emp('AT2',{group:'ATG'}); __emp('AT3',{group:'ATG'});
    __draft('AT1','Acknowledged',90); __draft('AT2','Acknowledged',80); __draft('AT3','Acknowledged',70);
    // AT1: มีข้อมูลเวลา ตรงกับ Z ที่บันทึก (ไม่มีวันลา → Z เต็ม) ; AT2: ข้อมูลมาทีหลัง ทำให้ Z ไม่ตรง ; AT3: ไม่มีข้อมูล
    ATTENDANCE['AT1']={name:'x',lateCount:0,earlyCount:0,sickDay:0,personalDay:0,absentDay:0};
    const zFull=computeZScore('of','AT1').score;
    getDrafts().forEach(()=>{}); const ds=getDrafts(); ds.forEach(d=>{ if(['AT1','AT2','AT3'].includes(d[0])) d[d.length-4]=zFull; }); saveDrafts(ds);
    ATTENDANCE['AT2']={name:'y',lateCount:16,earlyCount:0,sickDay:5,personalDay:5,absentDay:2}; // วันลารวม 18 → Z ต่ำลงมาก
    renderCalibQueue();
    const bn=document.getElementById('calibAttBanner').textContent;
    out.bannerMissing=/1 คน/.test(bn)&&bn.includes('ยังไม่มีข้อมูลเวลา');
    out.bannerStale=bn.includes('ไม่ตรงกับ Attendance');
    // คำนวณ Z ใหม่ให้คนที่ไม่ตรง
    recalcStaleAttendanceZ();
    const d2=getDrafts().find(d=>d[0]==='AT2');
    out.zFixed=Math.abs(d2[d2.length-4]-computeZScore('of','AT2').score)<0.01 && d2[d2.length-4]<zFull;
    renderCalibQueue();
    out.staleGone=!document.getElementById('calibAttBanner').textContent.includes('ไม่ตรงกับ Attendance');
    out.missingStays=document.getElementById('calibAttBanner').textContent.includes('ยังไม่มีข้อมูลเวลา');
    // export: คอลัมน์ครบ + ไม่ใช้ค่าตัวอย่างกับคนที่ไม่มีข้อมูล
    let hdr=null,rows=null; window.downloadCsv=(n,h,r)=>{hdr=h;rows=r;};
    exportAttendanceList();
    out.hdr=hdr;
    const row2=rows.find(x=>x[0]==='AT2'), row3=rows.find(x=>x[0]==='AT3');
    out.row2=row2.slice(3,12); out.row3=row3.slice(3,12);
    // แก้วันลาผ่านเว็บ → push ขึ้น Excel แบบไม่แตะคอลัมน์สูตร (#101/#106)
    let call=null; window.graphUpsertTableRowPartial=async(t,k,v,row,prot)=>{ call={t,v,row:row.slice(),prot}; return 'ok'; };
    writeAttendanceRecord('AT3',{absentDay:1,lateCount:9,earlyCount:2,personalDay:3,sickDay:4,medCert:''});
    await new Promise(r=>setTimeout(r,30));
    out.push=call;
    return out;
  });
  ok(r.push&&r.push.t==='Attendance'&&r.push.v==='AT3'&&JSON.stringify(r.push.prot)==='[8,9]'&&r.push.row[3]===9&&r.push.row[4]===2&&r.push.row[5]===4&&r.push.row[6]===3&&r.push.row[7]===1,'แก้ผ่านเว็บ → push Excel (สาย9/กลับก่อน2/ป่วย4/กิจ3/ขาด1) ไม่แตะคอลัมน์สูตร 8,9');
  ok(r.bannerMissing,'แบนเนอร์เตือนคนที่ไม่มีข้อมูลเวลา');
  ok(r.bannerStale,'แบนเนอร์เตือน Z ไม่ตรง Attendance ล่าสุด');
  ok(r.zFixed,'ปุ่มคำนวณ Z ใหม่ แก้เฉพาะคนที่ไม่ตรง');
  ok(r.staleGone&&r.missingStays,'หลังคำนวณ: เตือน Z หายไป แต่ยังเตือนคนไม่มีข้อมูล');
  ok(['สาย (ครั้ง)','กลับก่อน (ครั้ง)','ลากิจ (วัน)','ลาป่วย (วัน)','ขาดงาน (วัน)'].every(h=>r.hdr.includes(h)),'export มี สาย/กลับก่อน/กิจ/ป่วย/ขาด');
  ok(r.row2[0]===16&&r.row2[2]===16&&r.row2[3]===2&&r.row2[4]===5&&r.row2[5]===5&&r.row2[6]===2,'แถวมีข้อมูล: สาย16 รวม16 เทียบ2วัน กิจ5 ป่วย5 ขาด2 → '+r.row2);
  ok(r.row3.slice(0,8).every(v=>v==='')&&r.row3[8]==='ไม่มีข้อมูลเวลา','คนไม่มีข้อมูล: เว้นว่าง ไม่ใช้ค่าตัวอย่าง → '+r.row3);
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
