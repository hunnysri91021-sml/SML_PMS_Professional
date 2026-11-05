/* #271: สายที่ไม่มี GM — ผู้สอบทานคนสุดท้ายกดส่งผลให้พนักงานได้ */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const cy=getCurrentEvalCycleYear();
    const l1=__emp('S1',{name:'หัวหน้าแผนกS',role:'l1',level:'ldr'});
    const e=__emp('S2',{name:'พนักงานS',role:'emp',level:'of',l1:'หัวหน้าแผนกS',l2:'หัวหน้าแผนกS'});
    const out={};
    out.sender=(resolveResultSender(e)||[])[0];
    __draft('S2','Submitted',80);
    __login(l1);
    // L1 อนุมัติ → ไม่มี L2/GM → ข้ามไป GMApproved
    renderWorkflowPages();
    document.querySelectorAll('.reviewl1-chk').forEach(c=>{ if(c.value==='S2|'+cy+'|of') c.checked=true; });
    await approveReviewL1Selected();
    const d=getDrafts().find(x=>x[0]==='S2'); out.st=d[d.length-1];
    renderGmApproveQueue();
    out.listed=document.getElementById('gmSendRows').innerHTML.includes('พนักงานS')&&document.getElementById('gmSendRows').innerHTML.includes('gmsend-chk');
    const nav=document.querySelector('.nav-item[data-pg="gmapprove"]'); out.nav=nav&&nav.style.display!=='none';
    document.querySelectorAll('.gmsend-chk').forEach(c=>c.checked=true);
    await sendResultToEmployeesSelected();
    const d2=getDrafts().find(x=>x[0]==='S2'); out.after=d2[d2.length-1];
    return out;
  });
  ok(r.sender==='S1','ผู้ส่งผลในสายไม่มี GM = ผู้สอบทานคนสุดท้าย');
  ok(r.st==='GMApproved','อนุมัติ L1 แล้วข้ามไป GMApproved ('+r.st+')');
  ok(r.listed&&r.nav,'ผู้สอบทานคนสุดท้ายเห็นรายการรอส่งผลและเมนู');
  ok(r.after==='ResultSent','กดส่งผล → ResultSent ('+r.after+')');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
