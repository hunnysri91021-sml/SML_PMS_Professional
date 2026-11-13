/* PDPA: ต้องติ๊กรับทราบก่อนเข้าใช้ครั้งแรก (#315) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  ok(await p.evaluate(()=>/PDPA/.test(document.getElementById('pdpaLoginNote').textContent)),'หน้า login มีข้อความ PDPA');
  await p.evaluate(()=>{ localStorage.removeItem('smlPmsPdpaAck'); const u=MASTER_USERS.find(x=>x[12]==='active'); window._u=u;
    window.__r=null; ensurePdpaAck(u).then(v=>window.__r=v); });
  ok(await p.evaluate(()=>document.getElementById('pdpaGate').style.display==='flex'),'ยังไม่เคยรับทราบ → แสดงหน้าต่าง PDPA');
  ok(await p.evaluate(()=>document.getElementById('pdpaOkBtn').disabled),'ปุ่มยอมรับถูกล็อกจนกว่าจะติ๊ก');
  await p.evaluate(()=>pdpaDecline()); await p.waitForTimeout(50);
  ok(await p.evaluate(()=>window.__r===false),'ไม่ยอมรับ → ไม่เข้าระบบ');
  await p.evaluate(()=>{ ensurePdpaAck(window._u).then(v=>window.__r=v); });
  await p.click('#pdpaChk'); 
  ok(await p.evaluate(()=>!document.getElementById('pdpaOkBtn').disabled),'ติ๊กแล้วปุ่มใช้ได้');
  await p.evaluate(()=>{ window.__log=[]; const o=appendAuditLog; window.appendAuditLog=function(t,a,g,d){ window.__log.push(a); return o.apply(this,arguments); }; });
  await p.click('#pdpaOkBtn'); await p.waitForTimeout(50);
  ok(await p.evaluate(()=>window.__r===true),'ยอมรับ → เข้าระบบต่อ');
  ok(await p.evaluate(()=>pdpaIsAcked(window._u[0])),'จำการรับทราบไว้');
  ok(await p.evaluate(()=>window.__log.some(a=>/PDPA/.test(a))),'บันทึก Audit Log');
  ok(await p.evaluate(()=>{ let r; ensurePdpaAck(window._u).then(v=>r=v); return document.getElementById('pdpaGate').style.display==='none'; }),'รับทราบแล้วไม่ถามซ้ำ');
  await p.evaluate(()=>{ const a=pdpaGetAck(); a[window._u[0]].v='0'; localStorage.setItem('smlPmsPdpaAck',JSON.stringify(a)); });
  ok(await p.evaluate(()=>!pdpaIsAcked(window._u[0])),'เปลี่ยนเวอร์ชันนโยบาย → ถามใหม่');
  ok(errs.length===0,'ไม่มี pageerror '+errs.join(';'));
  await b.close(); done();
})();
