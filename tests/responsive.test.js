/* Regression: Responsive layout (CLAUDE.md #236) — มือถือ / Laptop / PC */
const {chromium}=require('playwright');
const path=require('path');
const FILE='file://'+path.resolve(__dirname,'..','SML_PMS_v14.html');
const {ok,done}=require('./helpers');
async function page(b,vp,mobile){
  const c=await b.newContext({viewport:vp,isMobile:!!mobile,hasTouch:!!mobile}); const p=await c.newPage();
  p.on('dialog',d=>d.accept()); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(FILE); await p.waitForTimeout(600);
  await p.evaluate(()=>{ const adm=MASTER_USERS.find(u=>u[2]==='sysadmin'&&u[12]==='active'); CURRENT_SESSION_USER=adm; applySession(adm);
    const cy=getCurrentEvalCycleYear(); const a=getDrafts(); MASTER_USERS.filter(u=>u[2]==='emp').slice(0,4).forEach((u,i)=>{ const X=90-i*8; a.push([u[0],u[1],cy,'of',2,2,2,2,2,2,2,2,2,2,null,null,null,null,X-10,10,X,gradeFromX(X),'Acknowledged']); }); saveDrafts(a); });
  await p.evaluate(()=>document.querySelector('.nav-item[data-pg="calib"]').click()); await p.waitForTimeout(500);
  return {p,errs,c};
}
(async()=>{
  const b=await chromium.launch();
  // Laptop 1288: ตาราง Calibration ไม่ต้องเลื่อนข้าง และปุ่มดำเนินการไม่ล้นจอ
  let {p,errs,c}=await page(b,{width:1288,height:800});
  let m=await p.evaluate(()=>{ const w=document.querySelector('#pg-calib .calib-table-wrap'); const t=w.querySelector('table'); const bar=document.querySelector('.topbar');
    return {fits:w.scrollWidth<=w.clientWidth+1, tableW:Math.round(t.getBoundingClientRect().width), topbarH:Math.round(bar.getBoundingClientRect().height), acts:document.querySelectorAll('#calibRows .calib-acts').length}; });
  ok(m.fits,'laptop: ตาราง Calibration พอดีจอ ไม่ต้องเลื่อนข้าง (table '+m.tableW+'px)');
  ok(m.topbarH<=80,'laptop: แถบบนสุดบรรทัดเดียว ('+m.topbarH+'px)');
  ok(m.acts>0,'ปุ่มดำเนินการอยู่ใน .calib-acts');
  // ต้องไม่ชนกับ .rt เดิม (ปุ่มให้คะแนน) — ตารางใช้ class rtc
  ok(await p.evaluate(()=>{const t=document.getElementById('calibRows').closest('table');return !t.classList.contains('rt')&&t.classList.contains('rtc');}),'ใช้ class rtc ไม่ชน .rt เดิม (CLAUDE.md #15)');
  ok(await p.evaluate(()=>{ const r=document.querySelector('#calibRows tr.calib-row-ready'); const x=[...r.children].map(td=>td.getBoundingClientRect().x); return x.every((v,i)=>i===0||v>x[i-1]); }),'laptop: คอลัมน์เรียงซ้ายไปขวาปกติ');
  ok(errs.length===0,'laptop: no page errors '+errs.join('|')); await c.close();
  // PC 1920
  ({p,errs,c}=await page(b,{width:1920,height:1000}));
  ok(await p.evaluate(()=>{ const w=document.querySelector('#pg-calib .calib-table-wrap'); return w.scrollWidth<=w.clientWidth+1; }),'pc: ตาราง Calibration ไม่ต้องเลื่อนข้าง'); await c.close();
  // Mobile 390: ไม่มีอะไรล้นแนวนอน, แถบบนสุดเห็นปุ่มออกจากระบบครบ, ตารางเป็นการ์ดพร้อม data-label
  ({p,errs,c}=await page(b,{width:390,height:844},true));
  m=await p.evaluate(()=>{ const btn=document.querySelector('#sessionBadge .btn').getBoundingClientRect(); const r=document.querySelector('#calibRows tr.calib-row-ready'); const td=r.children[2];
    return {logoutInView:btn.right<=innerWidth&&btn.left>=0, cardDisplay:getComputedStyle(r).display, label:td.getAttribute('data-label'), thead:getComputedStyle(document.querySelector('#pg-calib .calib-table-wrap thead')).display,
      acts:[...r.querySelectorAll('.calib-acts .btn')].every(x=>{const q=x.getBoundingClientRect();return q.right<=innerWidth+1&&q.left>=0;}), doc:document.documentElement.scrollWidth<=innerWidth+1}; });
  ok(m.logoutInView,'mobile: ปุ่มออกจากระบบอยู่ในจอ');
  ok(m.cardDisplay==='block'&&m.thead==='none','mobile: แถวเป็นการ์ด ซ่อนหัวตาราง');
  ok(!!m.label,'mobile: เซลล์มี data-label ('+m.label+')');
  ok(m.acts,'mobile: ปุ่มดำเนินการไม่ล้นจอ');
  ok(m.doc,'mobile: หน้าไม่ล้นแนวนอน');
  // re-render แล้ว label ต้องอยู่ (MutationObserver)
  await p.evaluate(()=>renderCalibQueue()); await p.waitForTimeout(150);
  ok(await p.evaluate(()=>!!document.querySelector('#calibRows tr.calib-row-ready td[data-label]')),'mobile: render ซ้ำแล้ว data-label ยังอยู่');
  ok(errs.length===0,'mobile: no page errors '+errs.join('|')); await c.close();
  await b.close(); done();
})();
