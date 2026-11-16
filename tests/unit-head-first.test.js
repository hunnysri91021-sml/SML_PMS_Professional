/* พนักงานส่งตนเอง → L1 (หัวหน้าหน่วย) → L2 → ...; ถ้า L1 ประเมินเอง → ไป L2 (#334) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true;
    const sent=[]; window.isWorkerConfigured=()=>true;
    window.workerFetch=async(c,path,o)=>{ sent.push({path,body:JSON.parse(o.body)}); return {ok:true}; };
    const l2=__emp('D2',{name:'หน.แผนก',role:'l1',email:'d2@x.com'}); l2[21]='Ud2';
    const uh=__emp('U1',{name:'หน.หน่วย',role:'unit',email:'u1@x.com',l1:'หน.แผนก'}); uh[21]='Uu1';
    __emp('S1',{name:'พนง.หนึ่ง',role:'emp',level:'of',l1:'หน.หน่วย',l2:'หน.แผนก',email:'s1@x.com'});
    __emp('S2',{name:'พนง.สอง',role:'emp',level:'of',l1:'หน.หน่วย',l2:'หน.แผนก',email:'s2@x.com'});
    localStorage.setItem(EVAL_ELIGIBILITY_KEY, JSON.stringify({mode:'all',depts:[],emps:[]})); loadEvalEligibility();
    const cy=getCurrentEvalCycleYear(); const out={};
    const a=getDrafts(); a.push(['S1','n',cy,'of',3,3,3,2,2,2,2,1,1,1,null,null,null,null,50,10,60,'C','Draft']); saveDrafts(a);
    __login(MASTER_USERS.find(u=>u[0]==='S1'));
    document.getElementById('evalCodeGate').value='S1'; onEvalCodeGateChange();
    await saveEvaluationToMs365('Submitted');
    const st=()=>{const d=getDrafts().find(x=>x[0]==='S1'); return d[d.length-1];};
    out.afterSelf=st();
    { const ds=getDrafts(); const d=ds.find(x=>x[0]==='S1'); [15,15,15,10,10,10,10,5,5,5].forEach((v,i)=>d[4+i]=v); saveDrafts(ds); }
    out.lineToUnit=sent.filter(s=>s.path==='/send-line').some(s=>(s.body.userIds||[]).includes('Uu1'));
    out.lineToDeptEarly=sent.filter(s=>s.path==='/send-line').some(s=>(s.body.userIds||[]).includes('Ud2'));
    // L2 ยังไม่เห็นใน queue (รอ L1)
    out.rankHalf=evalStatusRank('SelfSubmitted');
    // คนอื่นกดแทนไม่ได้
    __login(MASTER_USERS.find(u=>u[0]==='D2'));
    currentReviewerCode='S1'; currentReviewerCycle=cy; currentReviewerLevel='of'; currentReviewerOpenStatus='SelfSubmitted';
    out.deptCanAct=canActOnSelfSubmitted(MASTER_USERS.find(u=>u[0]==='S1'));
    // L1 กดส่งต่อ
    __login(MASTER_USERS.find(u=>u[0]==='U1'));
    out.unitCanAct=canActOnSelfSubmitted(MASTER_USERS.find(u=>u[0]==='S1'));
    sent.length=0;
    const toasts=[]; const _t=window.smlToast; window.smlToast=(m,t)=>{toasts.push(m); return _t&&_t(m,t);};
    openReviewerForm('of','พนง.หนึ่ง','S1','พนักงาน',cy,false);
    out.dbg=JSON.stringify({d:getDrafts().find(x=>x[0]==='S1'),got:[...document.querySelectorAll('#reviewerFormArea .reviewer-table tbody tr .review-got')].map(e=>e.textContent),banner:(document.getElementById('reviewerFormArea')||{}).innerText?.slice(0,200)});
    await submitReviewerForm(); out.toasts=toasts;
    out.afterUnit=st();
    out.lineToDept=sent.filter(s=>s.path==='/send-line').some(s=>(s.body.userIds||[]).includes('Ud2'));
    // L1 ประเมินเอง (S2 ไม่มี draft) → Submitted ตรงไป L2
    sent.length=0;
    openReviewerForm('of','พนง.สอง','S2','พนักงาน',cy,false);
    document.querySelectorAll('#mReview .review-score-btns, #mReview .rt').forEach(()=>{});
    return out;
  });
  ok(r.afterSelf==='SelfSubmitted','พนักงานส่งแล้วสถานะ SelfSubmitted ('+r.afterSelf+')');
  ok(r.lineToUnit,'LINE ถึงหัวหน้าหน่วย L1');
  ok(!r.lineToDeptEarly,'ยังไม่แจ้ง L2 ก่อน L1');
  ok(r.rankHalf===0.5,'rank 0.5');
  ok(!r.deptCanAct,'หัวหน้าแผนกกดแทน L1 ไม่ได้');
  ok(r.unitCanAct,'หัวหน้าหน่วยกดได้');
  ok(r.afterUnit==='Submitted','L1 ส่งต่อ → Submitted ('+r.afterUnit+') '+JSON.stringify(r.toasts)+r.dbg);
  ok(r.lineToDept,'แจ้ง L2 หลัง L1 ส่งต่อ');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
