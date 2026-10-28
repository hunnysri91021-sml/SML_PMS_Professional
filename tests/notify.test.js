/* Regression: การแจ้งผล/อีเมล/LINE (CLAUDE.md #181-#183, #195, #147) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(async()=>{
    const out={}; window.__calls=[];
    window.isWorkerConfigured=()=>true;
    window.workerFetch=async(cfg,path,opt)=>{ const body=JSON.parse(opt.body); window.__calls.push({path,body}); if(path==='/send-mail'&&body.toEmail==='bad@x.com') throw new Error('boom'); return {ok:true}; };
    const a=__emp('N1',{name:'เอ',email:'a@x.com'}), c=__emp('N2',{name:'บี',email:'bad@x.com'}), n=__emp('N3',{name:'ซี'});
    // #195: ส่งรายคน ผลแยกต่อคน
    const res=await sendEmailToList([a,c],'s','b');
    out.mail=[res.sentCount,res.failedCount,res.perEmp.get('N1').sent,res.perEmp.get('N2').sent,window.__calls.filter(x=>x.path==='/send-mail').length];
    // Worker ไม่ตั้งค่า → configured:false ไม่ยิงอะไร
    window.isWorkerConfigured=()=>false; window.__calls.length=0;
    const r2=await sendEmailToList([a],'s','b'); out.noWorker=[r2.configured,window.__calls.length];
    // LINE: ส่งเฉพาะคนที่มี LINE ID
    window.isWorkerConfigured=()=>true; a[21]='Uaaa';
    const l=await sendLineReminder([a,c],'hello'); out.line=[l.sent,JSON.stringify(window.__calls.at(-1).body.userIds)];
    const l0=await sendLineReminder([c],'hello'); out.lineNone=l0.sent===0&&!!l0.reason;
    // #181/#182: เป้าหมายแจ้งผล = GMApproved ขึ้นไป และยังไม่ถูกแจ้ง; แจ้งแล้วย้ายไปรายการ "แจ้งไปแล้ว"
    const cy=getCurrentEvalCycleYear();
    const d1=__draft('N1','GMApproved',80), d2=__draft('N2','Submitted',80);
    out.t1=getResultNotifyTargets().map(t=>t.emp[0]).filter(x=>/^N/.test(x)).join();
    markResultNotified(draftKey(d1),'auto');
    out.t2=getResultNotifyTargets().map(t=>t.emp[0]).filter(x=>/^N/.test(x)).join();
    const al=getResultAlreadyNotified().find(t=>t.emp[0]==='N1'); out.already=al&&al.meta.source;
    return out;
  });
  ok(r.mail.join()==='1,1,true,false,2','#195 ส่งอีเมลรายคน สำเร็จ1/ล้มเหลว1: '+r.mail);
  ok(r.noWorker[0]===false&&r.noWorker[1]===0,'ไม่ตั้ง Worker → configured:false ไม่ยิง');
  ok(r.line[0]===1&&r.line[1]==='["Uaaa"]','LINE ส่งเฉพาะคนที่มี LINE ID: '+r.line);
  ok(r.lineNone,'ไม่มีใครมี LINE ID → แจ้งเหตุผล ไม่แกล้งว่าส่ง');
  ok(r.t1==='N1','เป้าหมายแจ้งผล = GMApproved ขึ้นไปเท่านั้น: '+r.t1);
  ok(r.t2===''&&r.already==='auto','แจ้งแล้ว (auto) ออกจากเป้าหมายและขึ้นรายการ "แจ้งไปแล้ว"');
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
