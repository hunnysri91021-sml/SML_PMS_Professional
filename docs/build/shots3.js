/* ถ่ายภาพคู่มือ ส่วน C ต่อ: คิวสอบทาน L2/L3/GM */
const G=require('./common.js'); const OUT=require('path').resolve(__dirname,'../manual/img/');
const sh=async(p,n,o)=>{o=o||{}; if(o.scroll) await p.evaluate(([s,off])=>{const e=document.querySelector(s);if(e){scrollTo(0,e.getBoundingClientRect().top+scrollY-off);}},[o.scroll,o.off||90]);
  await p.evaluate(()=>{const c=document.getElementById('gcur');if(c)c.style.display='none';}); await p.waitForTimeout(300);
  if(o.marks) await G.mark(p,o.marks); await p.waitForTimeout(150); await p.screenshot({path:OUT+'/'+n+'.png'}); await G.clearMarks(p);};
const nav=async(p,pg)=>{await p.click('.nav-item[data-pg="'+pg+'"]'); await p.waitForTimeout(800);};
(async()=>{
 const {b,p,errs}=await G.launch(); await G.story(p); await G.overlay(p);
 const D=(c,s,x,o)=>p.evaluate(([c,s,x,o])=>__draft(c,s,x,o),[c,s,x,o||{}]);
 const login=async(c)=>{await p.evaluate(c=>{__login(c);},c); await p.waitForTimeout(800);};
 const ST=async(st)=>{ await D('SML-009',st,'A'); await D('SML-010',st,'B'); await D('SML-011',st,'C'); await D('SML-006',st,'D',{level:'op'}); };
 /* พนักงานเห็นว่าถูกตีกลับ */
 await D('SML-009','Draft','A'); await p.evaluate(()=>{const cy=getCurrentEvalCycleYear(); recordReject('SML-009|'+cy+'|of','RejectedL1','ข้อ 4 ให้คะแนนสูงเกินไป กรุณาตรวจสอบอีกครั้งก่อนส่ง');}); await login('SML-009'); await nav(p,'myeval'); await p.fill('#evalCodeGate','SML-009'); await p.dispatchEvent('#evalCodeGate','input'); await p.waitForTimeout(900); await sh(p,'b9-rejected',{scroll:'#evalReconfirmNote',off:200});
 /* วิชัย: หัวหน้าแผนก (เมนู 3) */
 await ST('Submitted'); await login('SML-008'); await nav(p,'reviewl1');
 await sh(p,'c4-queue-l2',{marks:[{sel:'#reviewl1Rows input[type=checkbox]'},{sel:'#reviewl1Rows button.btn'},{sel:'button[onclick*="approveReviewL1Selected"]'},{sel:'button[onclick*="rejectReviewL1Selected"]'},{sel:'button[onclick*="exportQueueToExcel"]'}]});
 await p.click('#notifBell'); await p.waitForTimeout(500); await sh(p,'c5-bell'); await p.click('#notifBell');
 /* ฟอร์มสอบทาน + ปุ่ม */
 await p.evaluate(()=>{const u=MASTER_USERS.find(x=>x[0]==='SML-010'); openReviewerForm('of',u[1],u[0],u[7],getCurrentEvalCycleYear());}); await p.waitForTimeout(800);
 await p.evaluate(()=>{const m=document.querySelector('#mReview .md'); m.scrollTop=m.scrollHeight;}); await p.waitForTimeout(400);
 await sh(p,'c6-reviewform-end',{marks:[{sel:'button[onclick="clearReviewerForm()"]',n:1},{sel:'button[onclick="rejectReviewerForm()"]',n:2},{sel:'#reviewerHoldBtn',n:3},{sel:'#reviewerSubmitBtn',n:4}]}); await p.evaluate(()=>closeM());
 /* อรุณ: ผจก.ส่วน (เมนู 4) */
 await ST('L1Reviewed'); await login('SML-005'); await nav(p,'review');
 await sh(p,'c7-queue-l3',{});
 /* GM */
 await ST('L2Reviewed'); await login('SML-950'); await nav(p,'gmapprove');
 await sh(p,'c8-queue-gm',{});
 await D('SML-006','GMApproved','D',{level:'op'}); await p.evaluate(()=>renderWorkflowPages()); await p.waitForTimeout(500);
 await sh(p,'c9-gm-send',{scroll:'#gmSendRows',off:260});
 /* แดชบอร์ดหัวหน้า */
 await login('SML-008'); await nav(p,'dash'); await sh(p,'c10-dash',{});
 console.log(errs); await b.close();
})();
