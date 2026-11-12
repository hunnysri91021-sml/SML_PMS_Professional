/* ถ่ายภาพคู่มือ ส่วน A (เข้าสู่ระบบ) และ B (พนักงาน) */
const G=require('./common.js'); const OUT=require('path').resolve(__dirname,'../manual/img/');
const sh=async(p,n,o)=>{o=o||{}; if(o.scroll) await p.evaluate(([s,off])=>{const e=document.querySelector(s);if(e){const y=e.getBoundingClientRect().top+scrollY-off;scrollTo(0,y);}},[o.scroll,o.off||90]); await p.evaluate(()=>{document.querySelectorAll('[id$="Err"]').forEach(e=>e.style.display='none');const c=document.getElementById('gcur');if(c)c.style.display='none';});
  await p.waitForTimeout(250);
  if(o.marks) await G.mark(p,o.marks); await p.waitForTimeout(150); await p.screenshot({path:OUT+'/'+n+'.png',clip:o.clip}); await G.clearMarks(p);};
(async()=>{
 const {b,p,errs}=await G.launch({dsf:1}); await G.story(p); await G.overlay(p);
 /* A1 หน้าเข้าสู่ระบบ */
 await sh(p,'a1-login',{marks:[{sel:'#loginCode'},{sel:'#loginPin'},{sel:'#loginBtn'},{sel:'#forgotLink'},{sel:'#activateLink',n:5},{sel:'#regEmailLink',n:6},{sel:'#lineRegLink',n:7}]});
 for(const [link,gate,n] of [['#activateLink','#activateGate','a2-activate'],['#forgotLink','#forgotGate','a3-forgot'],['#regEmailLink','#regEmailGate','a4-regemail'],['#lineRegLink','#lineRegGate','a5-linereg']]){
   await p.click(link); await p.waitForTimeout(500); await sh(p,n);
   await p.evaluate(g=>{document.querySelector(g).style.display='none';document.getElementById('loginGate').style.display='flex';},gate);
 }
 /* เข้าสู่ระบบจริงด้วยรหัส SML-009 */
 await p.fill('#loginCode','SML-009'); await p.click('#loginBtn'); await p.waitForTimeout(2200);
 await sh(p,'b0-home',{marks:[{sel:'.nav-item[data-pg="myeval"]'},{sel:'.nav-item[data-pg="myresult"]'},{sel:'#notifBell'},{sel:'text=ออกจากระบบ',tag:'button'}]});
 /* B1 เปิดหน้าประเมินตนเอง */
 await p.click('.nav-item[data-pg="myeval"]'); await p.waitForTimeout(500);
 await p.fill('#evalCodeGate','SML-009'); await p.dispatchEvent('#evalCodeGate','input'); await p.waitForTimeout(900);
 await sh(p,'b1-selfeval',{marks:[{sel:'#evalCodeGate'},{sel:'#evalBtnSaveDraft'},{sel:'#evalBtnPrint'},{sel:'#evalBtnSubmit'}]});
 /* B2 ให้คะแนน — เลือกเกรดทีละข้อ */
 await p.evaluate(()=>{const g=['A+','A','A','B','A','A+','B','A','A','B']; document.querySelectorAll('#evalForm tr, .eval-row').length;});
 const grades=['A+','A','A','B','A','A+','B','A','A','B'];
 for(let i=0;i<10;i++){ const row=p.locator('#row-m'+i+' button.f-grade-btn'); const n=await row.count(); const idx={'A+':0,'A':1,'B':2,'C+':3,'C':4}[grades[i]]; if(n>idx) await row.nth(idx).click(); }
 await p.waitForTimeout(500);
 await sh(p,'b2-scoring',{scroll:'#row-m0',off:260,marks:[{sel:'#row-m0 button.f-grade-btn'}]});
 /* B3 สรุปคะแนน Y/Z/X + ความเห็น */
 await sh(p,'b3-summary',{scroll:'#evalSummary, .eval-summary',off:20});
 await p.fill('#evalStrengths','ดูแลลูกค้าได้ดี ส่งงานตรงเวลา รับผิดชอบงานเกินหน้าที่'); await p.fill('#evalDevelopment','ต้องการอบรมการใช้ Excel ขั้นสูง และการเจรจาต่อรอง');
 await sh(p,'b4-comments',{scroll:'#evalStrengths',off:300,marks:[{sel:'#evalStrengths'},{sel:'#evalDevelopment'}]});
 /* B5 ยืนยันส่ง */
 await p.evaluate(()=>scrollTo(0,0)); await p.click('#evalBtnSubmit'); await p.waitForTimeout(600);
 await sh(p,'b5-confirm',{});
 console.log('errs',errs);
 await b.close();
})();
