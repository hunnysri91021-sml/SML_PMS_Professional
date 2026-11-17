/* ถ่ายภาพส่วน Admin/HR */
const G=require('./common.js'); const OUT=require('path').resolve(__dirname,'../manual/img/');
const sh=async(p,n,o)=>{o=o||{}; if(o.scroll) await p.evaluate(([s,off])=>{const e=document.querySelector(s);if(e){scrollTo(0,e.getBoundingClientRect().top+scrollY-off);}},[o.scroll,o.off||90]);
  await p.evaluate(()=>{const c=document.getElementById('gcur');if(c)c.style.display='none';}); await p.waitForTimeout(350);
  if(o.marks) await G.mark(p,o.marks); await p.waitForTimeout(150); await p.screenshot({path:OUT+'/'+n+'.png',fullPage:!!o.full}); await G.clearMarks(p);};
const nav=async(p,pg)=>{await p.click('.nav-item[data-pg="'+pg+'"]'); await p.waitForTimeout(900);};
(async()=>{
 const {b,p,errs}=await G.launch(); await G.story(p); await G.overlay(p);
 const D=(c,s,x,o)=>p.evaluate(([c,s,x,o])=>__draft(c,s,x,o),[c,s,x,o||{}]);
 await p.evaluate(()=>{const a=MASTER_USERS[0].slice();a[0]='SML-990';a[1]='ปิยะ ผู้ดูแลระบบ';a[2]='sysadmin';a[7]='HR Admin';a[12]='active';a[15]='hr@example.com';a[17]='';a[18]='';a[20]='1';MASTER_USERS.push(a);});
 for(const c of ['SML-009','SML-010','SML-011']) await D(c,'Acknowledged',c==='SML-009'?'A':c==='SML-010'?'B':'C');
 await D('SML-006','Calibrated','D',{level:'op'});
 await p.evaluate(()=>{__login('SML-990');}); await p.waitForTimeout(900);
 const pages=[['dash','e0-dash'],['cyclesetup','e1-cyclesetup'],['evaleligibility','e2-eligibility'],['tpl','e3-tpl'],['goal','e4-goal'],['rules','e5-rules'],['import','e6-import'],['org','e7-org'],['orgmaster','e8-orgmaster'],['ms365','e9-ms365'],['settings','f1-users'],['cycle','f2-cycles'],['calib','f3-calib'],['report','f4-report'],['audit','f5-audit']];
 for(const [pg,n] of pages){ await nav(p,pg); await sh(p,n,{}); }
 await p.evaluate(()=>{window.scrollTo(0,0);});
 /* modal: เพิ่ม/แก้ไขพนักงาน */
 await nav(p,'settings'); await p.evaluate(()=>{clearUserModalForm&&clearUserModalForm();openM('mAddUser');}); await p.waitForTimeout(600); await sh(p,'f6-adduser',{}); await p.evaluate(()=>closeM());
 await p.evaluate(()=>{editRole('l1');}); await p.waitForTimeout(500); await sh(p,'f7-editrole',{}); await p.evaluate(()=>closeM());
 await nav(p,'dash'); await p.evaluate(()=>openM('mReminder')); await p.waitForTimeout(600); await sh(p,'f8-reminder',{}); await p.evaluate(()=>closeM());
 await p.evaluate(()=>openM('mResultNotify')); await p.waitForTimeout(600); await sh(p,'f9-resultnotify',{}); await p.evaluate(()=>closeM());
 await nav(p,'goal'); await p.evaluate(()=>{openAddKpiModal&&openAddKpiModal();}); await p.waitForTimeout(600); await sh(p,'g1-addkpi',{}); await p.evaluate(()=>closeM());
 await nav(p,'ms365'); await sh(p,'g2-ms365-full',{full:true});
 await nav(p,'approve'); await sh(p,'g3-approve',{});
 console.log(errs); await b.close();
})();
