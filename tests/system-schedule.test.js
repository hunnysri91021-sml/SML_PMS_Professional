/* ตั้งเวลาปิด/เปิดระบบ + สถานะจาก Worker (#312) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true;
    const ups=[]; window.graphUpsertTableRow=async(t,k,v,row)=>{ ups.push({v,row}); return 'ok'; };
    const out={}; const now=Date.now();
    const iso=(ms)=>new Date(now+ms).toISOString();
    // ตรรกะ
    out.t1=systemClosedNow({open:true})===false;
    out.t2=systemClosedNow({open:false})===true;
    out.t3=systemClosedNow({open:true,closeAt:iso(-1000),openAt:''},now)===true;
    out.t4=systemClosedNow({open:true,closeAt:iso(1000)},now)===false;
    out.t5=systemClosedNow({open:true,closeAt:iso(-2000),openAt:iso(-1000)},now)===false;
    out.t6=systemClosedNow({open:false,openAt:iso(-1000)},now)===false;
    out.t7=systemClosedNow({open:false,openAt:iso(5000)},now)===true;
    // ตั้งเวลาผ่าน UI
    const adm=MASTER_USERS.find(u=>u[2]==='sysadmin')||__emp('SYS',{role:'sysadmin'});
    const emp=__emp('E1',{role:'emp'}); emp[17]='';
    __login(adm);
    const loc=(ms)=>isoToLocalInput(iso(ms));
    document.getElementById('sysCloseAt').value=loc(-3600000);
    await saveSystemSchedule(); out.rejectPast=getSystemState().closeAt==='';
    document.getElementById('sysCloseAt').value=loc(3600000); document.getElementById('sysOpenAt').value=loc(1800000);
    await saveSystemSchedule(); out.rejectOrder=getSystemState().closeAt==='';
    document.getElementById('sysOpenMsg').value='อัปเดตระบบ';
    document.getElementById('sysCloseAt').value=loc(3600000); document.getElementById('sysOpenAt').value=loc(7200000);
    await saveSystemSchedule();
    const st=getSystemState();
    out.saved=st.open===true&&!!st.closeAt&&!!st.openAt&&st.msg==='อัปเดตระบบ';
    out.pushed=ups.some(u=>u.v==='__sysopen__'&&JSON.parse(u.row[1]).closeAt===st.closeAt);
    out.stillOpen=!isSystemClosedFor(emp);
    out.meta=/จะปิดอัตโนมัติ/.test(document.getElementById('sysOpenMeta').textContent)&&/เปิดอยู่ \(มีกำหนดปิด\)/.test(document.getElementById('sysOpenBadge').textContent);
    // ถึงเวลาปิด (จำลองด้วยการแก้ closeAt เป็นอดีต) → พนักงานล็อก ข้อความมีเวลาเปิด admin ไม่ล็อก
    localStorage.setItem(SYSTEM_OPEN_KEY,JSON.stringify(Object.assign({},st,{closeAt:iso(-1000)})));
    __login(emp); applySystemGate();
    const ov=document.getElementById('sysClosedOverlay');
    out.locked=ov.style.display==='flex'&&/อัปเดตระบบ/.test(document.getElementById('sysClosedMsg').textContent)&&/คาดว่าจะเปิดใช้งานอีกครั้ง/.test(document.getElementById('sysClosedMsg').textContent);
    __login(adm); applySystemGate();
    out.adminFree=ov.style.display==='none'&&document.getElementById('sysClosedAdminBar').style.display==='block';
    // ปิดด้วยมือ + เปิดอัตโนมัติ
    localStorage.removeItem(SYSTEM_OPEN_KEY);
    document.getElementById('sysOpenAt').value=loc(7200000); await setSystemOpen(false);
    out.manual=getSystemState().open===false&&!!getSystemState().openAt;
    // เปิดด้วยมือ ล้างกำหนดเวลา
    await setSystemOpen(true);
    out.clear=getSystemState().open===true&&getSystemState().openAt===''&&getSystemState().closeAt==='';
    // Worker ตอบว่าปิด → ล็อกแม้สถานะในเครื่องบอกว่าเปิด; ถามอีกรอบว่าเปิดแล้ว → ปลดล็อก
    window.isWorkerConfigured=()=>true;
    let resp={closed:true,state:{open:false,msg:'ปิดโดยเซิร์ฟเวอร์',at:iso(99999),by:'x',closeAt:'',openAt:''}};
    window.fetch=async()=>({ok:true,json:async()=>resp});
    __login(emp); await pollSystemStatus();
    out.serverLock=ov.style.display==='flex'&&/ปิดโดยเซิร์ฟเวอร์/.test(document.getElementById('sysClosedMsg').textContent);
    resp={closed:false,state:{open:true,msg:'',at:iso(199999),by:'x',closeAt:'',openAt:''}};
    await pollSystemStatus();
    out.serverUnlock=ov.style.display==='none'&&getSystemState().open===true;
    return out;
  });
  console.log(JSON.stringify(r));
  Object.entries(r).forEach(([k,v])=>ok(v===true,k));
  ok(!errs.length,'ไม่มี page error '+errs.join(';'));
  await b.close(); done();
})();
