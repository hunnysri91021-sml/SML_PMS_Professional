/* #275: ปุ่มประเมินแทนในคิว L2 + Admin เห็นปุ่มในคิว L2/L3 */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    __mockGraph(); window.isWorkerConfigured=()=>false;
    const out={};
    const h=__emp('H1',{name:'หัวหน้าแผนกหนึ่ง',role:'l1',level:'ldr'});
    __emp('E1',{name:'พนงหนึ่ง',role:'emp',level:'of',l2:'หัวหน้าแผนกหนึ่ง'});
    const uh=__emp('U1',{name:'หัวหน้าหน่วยหนึ่ง',role:'unit',level:'ldr',l2:'หัวหน้าแผนกหนึ่ง'});
    const E2=__emp('E2',{name:'พนงสอง',role:'emp',level:'of',l2:'หัวหน้าแผนกหนึ่ง'}); E2[9]='หัวหน้าหน่วยหนึ่ง';
    __login(h); renderReviewL1Queue();
    const html=document.getElementById('reviewl1Rows').innerHTML;
    const seg=n=>(html.split(n)[1]||'').split('</tr>')[0];
    out.btnE1=/ประเมิน<\/button>/.test(seg('<small>E1'));
    out.noBtnE2=!/openReviewerForm/.test(seg('<small>E2'));
    const adm=__emp('A1',{name:'แอดมิน',role:'admin',level:'mgr'});
    __login(adm); renderReviewL1Queue();
    out.adminBtn=/ประเมิน<\/button>/.test((document.getElementById('reviewl1Rows').innerHTML.split('<small>E1')[1]||'').split('</tr>')[0]);
    return out;
  });
  ok(r.btnE1,'คิว L2: ไม่มี L1 → มีปุ่มประเมิน');
  ok(r.noBtnE2,'คิว L2: มีหัวหน้าหน่วยจริง → ไม่มีปุ่ม');
  ok(r.adminBtn,'Admin เห็นปุ่มประเมินแทนในคิว L2');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
