/* #274: พนักงานไม่มี L1/L2 — L3 (และ GM กรณีไม่มี L1–L3) กดประเมินได้จากคิวของตัวเอง */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const cy=getCurrentEvalCycleYear(); const out={};
    const mgr=__emp('M1',{name:'ผจกหนึ่ง',role:'l2',level:'mgr'});
    __emp('E1',{name:'พนงหนึ่ง',role:'emp',level:'of',l3:'ผจกหนึ่ง'});
    __login(mgr); renderReviewQueue();
    const btn=document.querySelector('#reviewRows button.btn-p');
    out.hasBtn=!!btn && btn.textContent.trim()==='ประเมิน';
    btn.click();
    document.querySelectorAll('#reviewerFormArea .reviewer-table tbody tr').forEach(tr=>{const x=tr.querySelector('button'); if(x) x.click();});
    await submitReviewerForm();
    const d=getDrafts().find(d=>d[0]==='E1'); out.st=d&&d[d.length-1];
    // มี L1 ตัวจริง → ไม่มีปุ่มที่คิว L3
    const h=__emp('H1',{name:'หัวหน้าแผนก',role:'l1',level:'ldr'});
    __emp('E2',{name:'พนงสอง',role:'emp',level:'of',l2:'หัวหน้าแผนก',l3:'ผจกหนึ่ง'});
    __login(mgr); renderReviewQueue();
    out.noBtnWhenL1=!document.getElementById('reviewRows').innerHTML.includes('พนงสอง') || !/พนงสอง[\s\S]*?<button/.test(document.getElementById('reviewRows').innerHTML.split('พนงสอง')[1]||'');
    return out;
  });
  ok(r.hasBtn,'คิว L3 มีปุ่มประเมินให้พนักงานที่ไม่มี L1/L2');
  ok(r.st==='L1Reviewed','ประเมินจากคิว L3 → รอ L3 สอบทาน ('+r.st+')');
  ok(r.noBtnWhenL1,'มี L1/L2 ตัวจริง → ไม่มีปุ่ม');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
