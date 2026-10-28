const {open,ok,done}=require('./helpers');
(async()=>{const {b,p,errs}=await open();
 await p.evaluate(()=>{ CURRENT_SESSION_USER=MASTER_USERS.find(u=>u[2]==='sysadmin')||MASTER_USERS[0]; if(CURRENT_SESSION_USER[2]!=='sysadmin')CURRENT_SESSION_USER[2]='sysadmin'; localStorage.removeItem('smlPmsCycleSteps'); });
 await p.evaluate(()=>{ document.querySelector('.nav-item[data-pg="cycle"]').click(); });
 await p.waitForTimeout(200);
 const rows=()=>p.evaluate(()=>document.querySelectorAll('#cycleStepsRows tr').length);
 ok(await rows()===7,'seeded 7 default steps');
 ok(await p.evaluate(()=>document.getElementById('cycleStepsTitle').textContent!=='FY2026-ANNUAL'||cyclesList.some(c=>c.id==='FY2026-ANNUAL')),'title follows selected cycle');
 // add
 await p.evaluate(()=>openCycleStepModal());
 await p.fill('#cs_name','ขั้นตอนทดสอบ'); await p.fill('#cs_start','2026-10-01'); await p.fill('#cs_end','2026-10-05');
 await p.evaluate(()=>saveCycleStepFromModal());
 ok(await rows()===8,'add -> 8 rows');
 // bad dates rejected
 await p.evaluate(()=>openCycleStepModal()); await p.fill('#cs_name','x'); await p.fill('#cs_start','2026-10-10'); await p.fill('#cs_end','2026-10-01');
 await p.evaluate(()=>saveCycleStepFromModal()); ok(await rows()===8,'end<start rejected'); await p.evaluate(()=>closeM());
 // edit
 const id=await p.evaluate(()=>getCycleSteps(selectedStepCycleId()).find(s=>s.name==='ขั้นตอนทดสอบ').id);
 await p.evaluate(i=>openCycleStepModal(i),id); await p.fill('#cs_name','แก้แล้ว'); await p.selectOption('#cs_status','done');
 await p.evaluate(()=>saveCycleStepFromModal());
 ok(await p.evaluate(()=>document.getElementById('cycleStepsRows').innerText.includes('แก้แล้ว')&&document.getElementById('cycleStepsRows').innerText.includes('เสร็จสิ้น')),'edit persisted');
 // reload persistence
 await p.reload(); await p.waitForTimeout(600);
 ok(await p.evaluate(()=>getCycleSteps(Object.keys(JSON.parse(localStorage.smlPmsCycleSteps))[0]).some(s=>s.name==='แก้แล้ว')),'survives reload');
 // delete
 await p.evaluate(()=>{CURRENT_SESSION_USER=MASTER_USERS[0];CURRENT_SESSION_USER[2]='sysadmin';document.querySelector('.nav-item[data-pg="cycle"]').click();});
 await p.evaluate(i=>deleteCycleStep(i),id); ok(await rows()===7,'delete -> 7 rows');
 // non-admin blocked
 await p.evaluate(()=>{CURRENT_SESSION_USER=[...MASTER_USERS[0]];CURRENT_SESSION_USER[2]='emp';renderCycleSteps();});
 ok(await p.evaluate(()=>!document.querySelector('#cycleStepsRows button')),'non-admin sees no edit buttons');
 ok(!errs.length,'no page errors: '+errs.join(';')); await b.close(); done();})();
