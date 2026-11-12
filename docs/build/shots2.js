/* ถ่ายภาพคู่มือ ส่วน B (ผลประเมินพนักงาน) และ C (หัวหน้า) */
const G=require('./common.js'); const OUT=require('path').resolve(__dirname,'../manual/img/');
const sh=async(p,n,o)=>{o=o||{}; if(o.scroll) await p.evaluate(([s,off])=>{const e=document.querySelector(s);if(e){scrollTo(0,e.getBoundingClientRect().top+scrollY-off);}},[o.scroll,o.off||90]);
  await p.evaluate(()=>{const c=document.getElementById('gcur');if(c)c.style.display='none';}); await p.waitForTimeout(300);
  if(o.marks) await G.mark(p,o.marks); await p.waitForTimeout(150); await p.screenshot({path:OUT+'/'+n+'.png'}); await G.clearMarks(p);};
const nav=async(p,pg)=>{await p.click('.nav-item[data-pg="'+pg+'"]'); await p.waitForTimeout(700);};
(async()=>{
 const {b,p,errs}=await G.launch(); await G.story(p); await G.overlay(p);
 const D=(c,s,x,o)=>p.evaluate(([c,s,x,o])=>__draft(c,s,x,o),[c,s,x,o||{}]);
 const login=async(c)=>{await p.evaluate(c=>{__login(c);},c); await p.waitForTimeout(800);};
 /* ---- พนักงาน: ผลประเมิน ---- */
 await D('SML-009','ResultSent','A');
 await login('SML-009'); await nav(p,'myresult');
 await sh(p,'b6-result',{marks:[{sel:'#myResultAckBtn, button[onclick*="acknowledgeMyResult"]'}]});
 await p.evaluate(()=>{const c=getCurrentEvalCycleYear(); openDisputeModal('SML-009',c);}); await p.waitForTimeout(500);
 await sh(p,'b7-dispute'); await p.evaluate(()=>closeM());
 await p.click('#notifBell'); await p.waitForTimeout(500); await sh(p,'b8-bell'); await p.click('#notifBell');
 /* ---- หัวหน้าหน่วย (L1): ประเมินทีมงาน ---- */
 await D('SML-010','Draft','B'); await D('SML-011','Draft','C');
 await login('SML-901'); await nav(p,'team'); await p.evaluate(()=>{populateTeamManagerSelect();renderTeamFromMaster();}); await p.waitForTimeout(500);
 await sh(p,'c1-team',{marks:[{sel:'#teamRows button.btn'},{sel:'button[onclick*="sendHeldTeamSelected"]'},{sel:'button[onclick*="exportTeamListToExcel"]'}]});
 await p.evaluate(()=>{const u=MASTER_USERS.find(x=>x[0]==='SML-010'); openReviewerForm('of',u[1],u[0],u[7],getCurrentEvalCycleYear());}); await p.waitForTimeout(800);
 await sh(p,'c2-reviewform',{});
 await p.evaluate(()=>{const m=document.querySelector('#mReview .md-b, #mReview'); (document.querySelector('#mReview .md')||m).scrollTop=700;}); await p.waitForTimeout(300);
 await sh(p,'c3-reviewform2',{});
 await p.evaluate(()=>closeM());
 console.log(errs); await b.close();
})();
