/* #248 ปุ่ม/ตารางปลอมต้องหายไป และรอบย้อนหลังต้องมาจากข้อมูลจริง */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(()=>{
    const html=document.documentElement.outerHTML;
    cyclesList.length=0; cyclesList.push({id:'C1',name:'รอบทดสอบ 2568',year:'2568',status:'Closed',start:'',end:''});
    renderCyclesTable();
    return {
      recalc:html.includes('คำนวณใหม่ทั้งรอบ'),
      pager:!!document.querySelector('#userCount')&&document.querySelector('#userCount').parentElement.querySelectorAll('button').length,
      fy:/FY2023/.test(document.getElementById('cyclePastList').innerHTML),
      past:document.getElementById('cyclePastList').textContent,
      sample:!!document.querySelector('#leaderRows input[placeholder="ความเห็นเพิ่มเติม"]')
    };
  });
  ok(!r.recalc,'ไม่มีปุ่ม คำนวณใหม่ทั้งรอบ ที่ไม่ทำงาน');
  ok(r.pager===0,'ไม่มีปุ่ม pagination ปลอม');
  ok(!r.fy&&r.past.includes('รอบทดสอบ 2568'),'รอบย้อนหลังมาจากรอบจริง');
  ok(!r.sample,'ไม่มีตารางสมรรถนะตัวอย่าง');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await done(b);
})();
