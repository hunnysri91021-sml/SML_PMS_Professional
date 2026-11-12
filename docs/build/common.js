/* ตัวช่วยสร้างคู่มือ/วิดีโอสอนใช้งาน — ใช้ข้อมูลสมมติทั้งหมด (ไม่แตะข้อมูลจริง ไม่เรียกเครือข่าย) */
const {chromium}=require('playwright');
const path=require('path');
const FILE='file://'+path.resolve(__dirname,'..','..','SML_PMS_v14.html');

/* ข้อมูลตัวอย่าง: ณัฐพล (พนักงาน) → สมศรี (หัวหน้าหน่วย L1) → วิชัย (หัวหน้าแผนก L2) → อรุณ (ผจก.ส่วน L3) → เชิดชัย (GM L4) */
const STORY=`
window.isWorkerConfigured=()=>false; window.isMs365Configured=()=>false;
window.workerFetch=async()=>({ok:true}); window.graphUpsertTableRow=async()=>'ok'; window.graphAddTableRow=async()=>'ok';
window.graphListTableRows=async()=>[]; window.graphUpsertTableRowPartial=async()=>'ok';
const mk=(code,name,role,pos,o)=>{const u=MASTER_USERS[0].slice();u[0]=code;u[1]=name;u[2]=role;u[3]='กลุ่มปฏิบัติการ';u[4]='ส่วนบริการ';u[5]='ฝ่ายปฏิบัติการ';u[6]='ฝ่ายปฏิบัติการ';u[7]=pos;u[12]='active';u[15]=code.toLowerCase()+'@example.com';u[17]='';u[18]=o.level||'of';u[20]='';u[21]='';MASTER_USERS.push(u);return u;};
const GM='เชิดชัย มั่งมี', L3='อรุณ ศิริ', L2='วิชัย กล้าหาญ', L1='สมศรี ใจดี';
const gm=mk('SML-950',GM,'gm','ผู้จัดการทั่วไป',{level:'mgr'});
const unit=mk('SML-901',L1,'unit','หัวหน้าหน่วย',{level:'ldr'});
const wichai=MASTER_USERS.find(u=>u[0]==='SML-008'), arun=MASTER_USERS.find(u=>u[0]==='SML-005');
[wichai,arun].forEach(u=>{u[6]='ฝ่ายปฏิบัติการ';u[5]='ฝ่ายปฏิบัติการ';u[4]='ส่วนบริการ';u[3]='กลุ่มปฏิบัติการ';});
const chain=(u,l1,l2,l3,l4)=>{u[9]=l1;u[10]=l2;u[19]=l3;u[11]=l4;};
chain(gm,'','','','');
chain(arun,'','','',GM); chain(wichai,'',L3,L3,GM); chain(unit,L2,L2,L3,GM);
['SML-009','SML-010','SML-011','SML-006','SML-007'].forEach(c=>{const u=MASTER_USERS.find(x=>x[0]===c); u[3]='กลุ่มปฏิบัติการ';u[4]='ส่วนบริการ';u[5]='ฝ่ายปฏิบัติการ';u[6]='ฝ่ายปฏิบัติการ'; u[18]=(c==='SML-006'||c==='SML-007')?'op':'of'; chain(u,L1,L2,L3,GM);});
MASTER_USERS.find(u=>u[0]==='SML-009')[7]='เจ้าหน้าที่บริการลูกค้า';
['SML-950','SML-901','SML-008','SML-005'].forEach(c=>{MASTER_USERS.find(x=>x[0]===c)[20]='1';});
localStorage.setItem(EVAL_ELIGIBILITY_KEY, JSON.stringify({mode:'all',depts:[],emps:[]})); loadEvalEligibility();
window.__draft=function(code,status,set,o){o=o||{};const cy=getCurrentEvalCycleYear();const lv=o.level||'of';const S={A:[15,14,14,8,9,10,8,4,4,3],B:[14,13,13,8,8,9,7,4,3,3],C:[13,12,13,7,8,8,7,3,3,3],D:[12,11,12,7,7,7,6,3,3,2]};const m=S[set||'A'];const Y=Math.round(m.reduce((a,b)=>a+b,0)*0.7*100)/100;const Z=30;const X=Math.round((Y+Z)*100)/100;const d=[code,'n',cy,lv].concat(m).concat([null,null,null,null,Y,Z,X,gradeFromX(X),status]);const a=getDrafts().filter(x=>!(x[0]===code&&x[2]===cy&&x[3]===lv));a.push(d);saveDrafts(a);return d;};
window.__login=function(code){const u=MASTER_USERS.find(x=>x[0]===code);CURRENT_SESSION_USER=u;applySession(u);return u;};
try{populateUserFilters&&populateUserFilters();}catch(e){}
`;
async function launch(opt){
  opt=opt||{};
  const b=await chromium.launch();
  const ctx=await b.newContext(Object.assign({viewport:{width:1440,height:900},deviceScaleFactor:opt.dsf||1},opt.record?{recordVideo:{dir:opt.record,size:{width:1440,height:900}}}:{}));
  const p=await ctx.newPage(); p.on('dialog',d=>d.accept());
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(FILE); await p.waitForTimeout(900);
  return {b,ctx,p,errs};
}
const story=p=>p.evaluate(STORY);
/* คำบรรยายบนจอ + เคอร์เซอร์/วงแหวนคลิก (สำหรับวิดีโอ) */
const OVERLAY=`
(()=>{ if(document.getElementById('gcap'))return;
 const s=document.createElement('style');s.textContent=\`
 #gcap{position:fixed;left:0;right:0;bottom:0;z-index:99999;background:linear-gradient(90deg,#0b2a6b,#1d4ed8);color:#fff;padding:14px 36px 16px;text-align:center;font-family:inherit;box-shadow:0 -6px 24px rgba(0,0,0,.25);transition:opacity .3s}
 #gcap b{display:block;font-size:26px;font-weight:800;letter-spacing:.2px}#gcap span{display:block;font-size:19px;color:#fde68a;margin-top:4px}
 #gcur{position:fixed;z-index:99998;width:30px;height:30px;margin:-15px 0 0 -15px;border:4px solid #ef4444;border-radius:50%;background:rgba(239,68,68,.18);pointer-events:none;transition:left .7s ease,top .7s ease;left:50%;top:40%}
 #gcur.p{animation:gp .45s ease-out}@keyframes gp{0%{transform:scale(1)}50%{transform:scale(1.9);background:rgba(239,68,68,.4)}100%{transform:scale(1)}}
 .gbadge{position:absolute;z-index:99997;width:30px;height:30px;border-radius:50%;background:#ef4444;color:#fff;font:800 17px/30px sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff;pointer-events:none}
 .gbox{position:absolute;z-index:99996;border:3px solid #ef4444;border-radius:8px;box-shadow:0 0 0 4px rgba(239,68,68,.18);pointer-events:none}\`;
 document.head.appendChild(s);
 const c=document.createElement('div');c.id='gcap';c.style.opacity=0;c.innerHTML='<b></b><span></span>';document.body.appendChild(c);
 const k=document.createElement('div');k.id='gcur';document.body.appendChild(k);})();`;
const overlay=p=>p.evaluate(OVERLAY);
const cap=async(p,t,s,ms,top)=>{await p.evaluate(([t,s,top])=>{const c=document.getElementById('gcap');c.querySelector('b').textContent=t;c.querySelector('span').textContent=s||'';c.style.opacity=1;c.style.top=top?'0':'auto';c.style.bottom=top?'auto':'0';},[t,s||'',!!top]); if(ms) await p.waitForTimeout(ms);};
const uncap=p=>p.evaluate(()=>{const c=document.getElementById('gcap');if(c)c.style.opacity=0;});
/* คลิกแบบมีเคอร์เซอร์เลื่อนไปหา */
async function hclick(p,loc,o){o=o||{};
  if(typeof loc==='string') loc=p.locator(loc).first();
  await loc.scrollIntoViewIfNeeded(); const bb=await loc.boundingBox(); if(!bb) throw new Error('no box');
  await p.evaluate(([x,y])=>{const k=document.getElementById('gcur');k.style.left=x+'px';k.style.top=y+'px';},[bb.x+Math.min(bb.width/2,40),bb.y+bb.height/2]);
  await p.waitForTimeout(o.pre||800);
  await p.evaluate(()=>{const k=document.getElementById('gcur');k.classList.remove('p');void k.offsetWidth;k.classList.add('p');});
  await p.waitForTimeout(220); await loc.click(); await p.waitForTimeout(o.post||600);
}
async function htype(p,loc,text,o){o=o||{}; if(typeof loc==='string') loc=p.locator(loc).first();
  await hclick(p,loc,{post:200}); await loc.fill(''); await loc.pressSequentially(text,{delay:o.delay||90}); await p.waitForTimeout(o.post||500);}
/* เครื่องหมายอธิบายภาพ (คู่มือ): วางเลขวงกลมแดง + กรอบ ที่ element */
async function mark(p,items){await p.evaluate(OVERLAY);
  await p.evaluate(items=>{ items.forEach((it,i)=>{ const el=typeof it.sel==='string'?(it.sel.startsWith('text=')?[...document.querySelectorAll(it.tag||'button,a,label,th,h3,h2,b,span,div,td')].find(e=>e.children.length<4&&(e.textContent||'').trim().startsWith(it.sel.slice(5))&&e.offsetParent):document.querySelector(it.sel)):null; if(!el) {console.warn('mark miss',it.sel);return;}
    const r=el.getBoundingClientRect(); const sx=scrollX,sy=scrollY;
    const bx=document.createElement('div');bx.className='gbox';bx.style.cssText+=';left:'+(r.left+sx-4)+'px;top:'+(r.top+sy-4)+'px;width:'+(r.width+8)+'px;height:'+(r.height+8)+'px';document.body.appendChild(bx);
    const bd=document.createElement('div');bd.className='gbadge';bd.textContent=it.n||(i+1);bd.style.left=(r.left+sx-14)+'px';bd.style.top=(r.top+sy-16)+'px';document.body.appendChild(bd);}); },items);}
const clearMarks=p=>p.evaluate(()=>document.querySelectorAll('.gbadge,.gbox').forEach(e=>e.remove()));
module.exports={FILE,launch,story,overlay,cap,uncap,hclick,htype,mark,clearMarks,STORY};
