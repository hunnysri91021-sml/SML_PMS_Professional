/* พนักงานส่งแบบประเมินตนเอง → แจ้งผู้ประเมินคนถัดไป (LINE/อีเมล) (#333) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true;
    const sent=[]; window.isWorkerConfigured=()=>true;
    window.workerFetch=async(c,path,o)=>{ sent.push({path,body:JSON.parse(o.body)}); return {ok:true}; };
    const l1=__emp('L1X',{name:'หน.แผนกX',role:'l1',email:'l1x@x.com'});
    l1[21]='Uline123';
    __emp('SN1',{name:'พนง.ส่ง',role:'emp',level:'of',l1:'หน.แผนกX',l2:'หน.แผนกX',email:'e@x.com'});
    __login(MASTER_USERS.find(u=>u[0]==='SN1'));
    localStorage.setItem(EVAL_ELIGIBILITY_KEY, JSON.stringify({mode:'all',depts:[],emps:[]})); loadEvalEligibility();
    document.getElementById('evalCodeGate').value='SN1'; onEvalCodeGateChange();
    const cy=getCurrentEvalCycleYear();
    const a=getDrafts(); a.push(['SN1','n',cy,'of',3,3,3,2,2,2,2,1,1,1,null,null,null,null,50,10,60,'C','Draft']); saveDrafts(a);
    document.getElementById('evalCodeGate').value='SN1'; onEvalCodeGateChange();
    await saveEvaluationToMs365('Submitted');
    return {line:sent.filter(s=>s.path==='/send-line'), mail:sent.filter(s=>s.path==='/send-mail').map(s=>s.body.toEmail)};
  });
  ok(r.line.length>=1 && (r.line[0].body.userIds||[]).includes('Uline123'),'LINE ถึงผู้ประเมิน '+JSON.stringify(r.line));
  ok(r.mail.includes('l1x@x.com'),'อีเมลถึงผู้ประเมิน '+JSON.stringify(r.mail));
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
