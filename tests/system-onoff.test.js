/* ปุ่มเปิด/ปิดระบบ (#257) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(()=>{ window.ensurePdpaAck=async()=>true; }); // ข้ามหน้าต่าง PDPA (ทดสอบแยกใน pdpa-ack.test.js)
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true;
    const ups=[]; window.graphUpsertTableRow=async(t,k,v,row)=>{ ups.push({t,k,v,row}); return 'ok'; };
    const out={};
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'});
    const emp=__emp('E1',{name:'สมชาย',role:'emp'}); emp[17]='';
    out.defaultOpen=getSystemState().open===true && !isSystemClosedFor(emp);
    // พนักงานปิดระบบไม่ได้
    __login(emp); await setSystemOpen(false); out.empBlocked=getSystemState().open===true;
    // admin ปิดระบบ
    __login(adm); document.getElementById('sysOpenMsg').value='เปิดวันที่ 1 ธ.ค.';
    await setSystemOpen(false);
    out.closed=getSystemState().open===false && getSystemState().msg==='เปิดวันที่ 1 ธ.ค.';
    out.pushed=ups.some(u=>u.t==='FormWeights'&&u.v==='__sysopen__'&&JSON.parse(u.row[1]).open===false);
    await new Promise(r=>setTimeout(r,50));
    out.adminBar=document.getElementById('sysClosedAdminBar').style.display==='block';
    out.adminNoOverlay=document.getElementById('sysClosedOverlay').style.display==='none';
    out.badge=/ปิด/.test(document.getElementById('sysOpenBadge').textContent);
    // พนักงาน login ตอนปิด → ล็อกอินไม่ได้
    window.sha256Hex=window.sha256Hex; CURRENT_SESSION_USER=null;
    document.getElementById('loginCode').value='E1'; document.getElementById('loginPin').value='';
    await doLogin();
    out.loginBlocked=/ระบบปิด/.test(document.getElementById('loginErr').textContent) && /1 ธ.ค./.test(document.getElementById('loginErr').textContent) && CURRENT_SESSION_USER===null;
    // session ค้างอยู่แล้วระบบถูกปิด → overlay ขึ้น
    __login(emp); await new Promise(r=>setTimeout(r,50));
    out.overlayShown=document.getElementById('sysClosedOverlay').style.display==='flex' && /1 ธ.ค./.test(document.getElementById('sysClosedMsg').textContent);
    // ซิงก์ข้ามเครื่อง: เครื่องอื่นเปิดระบบใหม่กว่า → overlay หาย
    window.isMs365Configured=()=>true;
    window.graphListTableRows=async()=>[['__sysopen__',JSON.stringify({open:true,msg:'',at:new Date(Date.now()+5000).toISOString(),by:'x'}),'']];
    await ms365SyncFormWeights(true); await new Promise(r=>setTimeout(r,50));
    out.syncOpen=getSystemState().open===true && document.getElementById('sysClosedOverlay').style.display==='none';
    // แถวเก่ากว่าไม่ทับ
    localStorage.setItem(SYSTEM_OPEN_KEY,JSON.stringify({open:false,msg:'',at:new Date(Date.now()+99999).toISOString(),by:''}));
    await ms365SyncFormWeights(true); out.olderIgnored=getSystemState().open===false;
    // admin ล็อกอินตอนปิดได้
    window.isMs365Configured=()=>false; CURRENT_SESSION_USER=null; adm[17]=''; document.getElementById('loginCode').value=adm[0]; await doLogin();
    out.adminLogin=!!CURRENT_SESSION_USER && CURRENT_SESSION_USER[0]===adm[0];
    return out;
  });
  ok(r.defaultOpen,'ค่าเริ่มต้น = เปิด');
  ok(r.empBlocked,'พนักงานปิดระบบไม่ได้');
  ok(r.closed&&r.pushed,'admin ปิดระบบ + push FormWeights __sysopen__');
  ok(r.adminBar&&r.adminNoOverlay&&r.badge,'admin เห็นแถบเตือน ไม่โดนล็อก การ์ดแสดงปิดอยู่');
  ok(r.loginBlocked,'พนักงานล็อกอินตอนปิดไม่ได้ + เห็นข้อความของ Admin');
  ok(r.overlayShown,'session ค้างอยู่ตอนปิด → ขึ้นหน้าจอล็อก');
  ok(r.syncOpen,'ซิงก์: เครื่องอื่นเปิดระบบ → ปลดล็อก');
  ok(r.olderIgnored,'ข้อมูลเก่ากว่าไม่ทับ');
  ok(r.adminLogin,'admin ล็อกอินได้ตอนระบบปิด');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
