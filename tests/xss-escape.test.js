/* #247 กัน XSS — ความเห็น/ชื่อต้องแสดงครบ และโค้ดแฝงต้องไม่รัน */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    window.__xss=0;
    const evil='<img src=x onerror="window.__xss++">';
    __emp('X1',{name:'ปกติ ทดสอบ'}); __emp('X2',{name:evil+'ชื่อ'});
    const cy=getCurrentEvalCycleYear();
    // ความเห็นปกติภาษาไทย + มีสัญลักษณ์ < > &  และโค้ดแฝง
    saveEvalCommentStage('X1',cy,'Submitted',{by:'ผู้ประเมิน A&B',byCode:'Z9',byRole:'l1',at:new Date().toISOString(),strength:'ทำงานดีมาก ตรงเวลา คะแนน < 60 & > 50',dev:'ควรพัฒนาการสื่อสาร'});
    saveEvalCommentStage('X1',cy,'L1Reviewed',{by:evil,byCode:'Z8',byRole:'l2',at:new Date().toISOString(),strength:evil,dev:'<script>window.__xss++</script>'});
    const h=buildPrevCommentsHtml('X1',cy);
    const box=document.createElement('div'); box.innerHTML=h; document.body.appendChild(box);
    const text=box.textContent;
    // ชื่อพนักงานในรายชื่อ
    renderUsers(MASTER_USERS);
    const rows=document.getElementById('userRows')||document.body;
    return {text,hasImg:box.querySelectorAll('img,script').length,
      userImg:document.querySelectorAll('#userRows img, #userRows script').length};
  });
  await p.waitForTimeout(300);
  const xss=await p.evaluate(()=>window.__xss);
  ok(r.text.includes('ทำงานดีมาก ตรงเวลา คะแนน < 60 & > 50'),'ความเห็นไทย + < > & แสดงครบตัวอักษร');
  ok(r.text.includes('ควรพัฒนาการสื่อสาร')&&r.text.includes('ผู้ประเมิน A&B'),'ช่องพัฒนา + ชื่อผู้เขียนแสดงครบ');
  ok(r.text.length>50,'มีข้อความความเห็นจริง');
  ok(r.hasImg===0,'ความเห็นไม่สร้าง <img>/<script> จริง');
  ok(r.userImg===0,'ชื่อพนักงานที่มีโค้ดแฝงไม่สร้าง element');
  ok(xss===0,'โค้ดแฝงไม่รัน (__xss='+xss+')');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
