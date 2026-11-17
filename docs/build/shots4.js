/* ถ่ายภาพขั้นหัวหน้าหน่วย (L1) ตรวจแบบประเมินที่พนักงานส่งเอง */
const G=require('./common.js'); const OUT=require('path').resolve(__dirname,'../manual/img/');
const sh=async(p,n,o)=>{o=o||{}; if(o.scroll) await p.evaluate(([s,off])=>{const e=document.querySelector(s);if(e){scrollTo(0,e.getBoundingClientRect().top+scrollY-off);}},[o.scroll,o.off||90]);
  await p.evaluate(()=>{const c=document.getElementById('gcur');if(c)c.style.display='none';}); await p.waitForTimeout(300);
  if(o.marks) await G.mark(p,o.marks); await p.waitForTimeout(150); await p.screenshot({path:OUT+'/'+n+'.png'}); await G.clearMarks(p);};
const nav=async(p,pg)=>{await p.click('.nav-item[data-pg="'+pg+'"]'); await p.waitForTimeout(800);};
(async()=>{
 const {b,p,errs}=await G.launch(); await G.story(p); await G.overlay(p);
 const D=(c,s,x,o)=>p.evaluate(([c,s,x,o])=>__draft(c,s,x,o),[c,s,x,o||{}]);
 const login=async(c)=>{await p.evaluate(c=>{__login(c);},c); await p.waitForTimeout(800);};
 await D('SML-009','SelfSubmitted','A'); await D('SML-010','SelfSubmitted','B'); await D('SML-011','Draft','C');
 await login('SML-901'); await nav(p,'team'); await p.evaluate(()=>{populateTeamManagerSelect();renderTeamFromMaster();}); await p.waitForTimeout(600);
 await sh(p,'d1-team-selfsubmitted',{marks:[{sel:'#teamRows button.btn'}]});
 await p.evaluate(()=>{const u=MASTER_USERS.find(x=>x[0]==='SML-009'); openReviewerForm('of',u[1],u[0],u[7],getCurrentEvalCycleYear());}); await p.waitForTimeout(800);
 await sh(p,'d2-l1-review',{});
 await p.evaluate(()=>{const m=document.querySelector('#mReview .md'); m.scrollTop=m.scrollHeight;}); await p.waitForTimeout(400);
 await sh(p,'d3-l1-review-end',{marks:[{sel:'button[onclick="rejectReviewerForm()"]',n:1},{sel:'#reviewerHoldBtn',n:2},{sel:'#reviewerSubmitBtn',n:3}]});
 console.log(errs); await b.close();
})();
