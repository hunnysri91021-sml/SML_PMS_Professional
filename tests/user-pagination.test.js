/* pagination จริงของรายชื่อผู้ใช้: แบ่งหน้า, ปุ่มก่อนหน้า/ถัดไป, ตัวกรองกลับหน้า 1, save/sync อยู่หน้าเดิม */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(()=>{
    const base=MASTER_USERS.length, out={};
    for(let i=0;i<130;i++){ const u=MASTER_USERS[0].slice(); u[0]='PG'+String(i).padStart(3,'0'); u[1]='ทดสอบแบ่งหน้า'+i; u[12]='active'; MASTER_USERS.push(u); }
    document.getElementById('userPageSize').value='50';
    document.getElementById('searchUser').value='';
    filterUsers();
    const rows=()=>document.querySelectorAll('#userRows tr').length;
    out.p1=rows(); out.info1=document.getElementById('userPgInfo').textContent; out.prevDis=document.getElementById('userPgPrev').disabled;
    gotoUserPage(1); out.p2=rows(); out.info2=document.getElementById('userPgInfo').textContent;
    filterUsers(); out.keep=document.getElementById('userPgInfo').textContent;       /* ตัวกรองเดิม → อยู่หน้า 2 */
    document.getElementById('searchUser').value='ทดสอบแบ่งหน้า1'; filterUsers();       /* เปลี่ยนตัวกรอง → หน้า 1 */
    out.reset=document.getElementById('userPgInfo').textContent;
    document.getElementById('searchUser').value=''; filterUsers();
    document.getElementById('userPageSize').value='0'; onUserPageSizeChange(); out.all=rows();
    document.getElementById('userPageSize').value='50'; onUserPageSizeChange();
    gotoUserPage(1); gotoUserPage(1); gotoUserPage(1); gotoUserPage(1); out.last=document.getElementById('userPgInfo').textContent; out.nextDis=document.getElementById('userPgNext').disabled;
    out.count=document.getElementById('userCount').textContent; out.total=MASTER_USERS.length;
    return out;
  });
  ok(r.p1===50&&/1\//.test(r.info1)&&r.prevDis,'หน้า 1 แสดง 50 แถวและปุ่มก่อนหน้าปิด');
  ok(r.p2===50&&r.info2.startsWith('หน้า 2/'),'ถัดไปไปหน้า 2');
  ok(r.keep.startsWith('หน้า 2/'),'เรียกกรองซ้ำด้วยตัวกรองเดิมแล้วอยู่หน้าเดิม');
  ok(r.reset.startsWith('หน้า 1/'),'เปลี่ยนตัวกรองแล้วกลับหน้า 1');
  ok(r.all===r.total,'เลือกทั้งหมดแสดงครบ '+r.all+'/'+r.total);
  ok(r.nextDis&&r.count.includes('จากทั้งหมด '+r.total),'หน้าสุดท้ายปุ่มถัดไปปิด + นับรวมถูก: '+r.count);
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await done(b);
})();
