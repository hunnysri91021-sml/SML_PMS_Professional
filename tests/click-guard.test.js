const {open,ok,done}=require('./helpers');
(async()=>{
 const {b,p,errs}=await open();
 const r=await p.evaluate(async()=>{
  window.__forceClickGuard=true;
  const toasts=[]; const st=window.smlToast; window.smlToast=(m,t)=>{toasts.push(m); return st(m,t);};
  // ฟังก์ชันจริงที่ถูกครอบ: ใช้ตัวแทนที่ช้าเพื่อจำลอง await Excel
  let calls=0; window.__slow=async()=>{calls++; await new Promise(r=>setTimeout(r,300));};
  // ครอบด้วยตัวเดียวกับที่ guard ใช้: เรียก approveAllFinal ซึ่งไม่มีข้อมูล แต่ต้องถูกครอบ
  const wrapped=typeof approveAllFinal.__orig==='function';
  // concurrent: เรียกสองครั้งติดกันโดยไม่รอ
  let n=0; const o=approveAllFinal.__orig; 
  const names=['submitReviewerForm','confirmCalibration','approveGmSelected','acknowledgeMyResult'].every(k=>typeof window[k].__orig==='function');
  const p1=approveAllFinal(); const p2=approveAllFinal(); await p1; await p2;
  const inflightMsg=toasts.some(m=>/กำลังดำเนินการ/.test(m));
  toasts.length=0;
  await approveAllFinal(); const cool=toasts.some(m=>/เพิ่งกดปุ่มนี้/.test(m));
  return {wrapped,names,inflightMsg,cool};
 });
 ok(r.wrapped&&r.names,'ปุ่มส่ง/อนุมัติ/ตีกลับ/ยืนยันถูกครอบด้วย click guard');
 ok(r.inflightMsg,'กดซ้ำขณะกำลังทำงาน → ขึ้นข้อความ "กำลังดำเนินการ"');
 ok(r.cool,'กดซ้ำทันทีหลังเสร็จ → ขึ้นข้อความ "เพิ่งกดปุ่มนี้ไป"');
 ok(errs.length===0,'no page errors'); await b.close(); done();
})();
