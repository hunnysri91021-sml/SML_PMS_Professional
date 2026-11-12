/* อัดวิดีโอสอนใช้งาน (พนักงาน / หัวหน้า) — ข้อมูลสมมติ, คำบรรยายบนจอ ไม่มีเสียง */
const G=require('./common.js'); const fs=require('fs'); const path=require('path'); const {execSync}=require('child_process');
const TMP=process.env.VTMP||'/tmp/vrec'; const OUT=path.resolve(__dirname,'../video');
const card=async(p,t,s,ms)=>{await p.evaluate(([t,s])=>{let c=document.getElementById('gcard');if(!c){c=document.createElement('div');c.id='gcard';c.style.cssText='position:fixed;inset:0;z-index:100000;background:linear-gradient(135deg,#0b2a6b,#1d4ed8);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;transition:opacity .4s';document.body.appendChild(c);}c.innerHTML='<div style="font-size:46px;font-weight:800;line-height:1.3">'+t+'</div><div style="font-size:24px;color:#bfdbfe;margin-top:18px">'+(s||'')+'</div>';c.style.opacity=1;c.style.pointerEvents='auto';},[t,s||'']); await p.waitForTimeout(ms||2600);};
const uncard=async p=>{await p.evaluate(()=>{const c=document.getElementById('gcard');if(c){c.style.opacity=0;c.style.pointerEvents='none';}}); await p.waitForTimeout(500);};
async function run(name,fn){
  fs.rmSync(TMP,{recursive:true,force:true}); fs.mkdirSync(TMP,{recursive:true});
  const {b,ctx,p,errs}=await G.launch({record:TMP}); const vid=p.video();
  p.removeAllListeners('dialog'); p.on('dialog',d=>d.type()==='prompt'?d.accept('ข้อ 4 ให้คะแนนสูงเกินไป กรุณาตรวจสอบอีกครั้ง'):d.accept());
  await G.story(p); await G.overlay(p);
  try{ await fn(p); }catch(e){ console.error('ERR',e.message); }
  await p.waitForTimeout(500); await ctx.close(); const f=await vid.path(); await b.close();
  const out=path.join(OUT,name+'.mp4');
  execSync(`ffmpeg -v error -y -i "${f}" -c:v libx264 -preset medium -crf 24 -pix_fmt yuv420p -movflags +faststart "${out}"`);
  console.log(name,'errs',errs.length,errs.slice(0,2)); return out;
}
const D=(p,c,s,x,o)=>p.evaluate(([c,s,x,o])=>__draft(c,s,x,o),[c,s,x,o||{}]);
const NAV=(p,pg)=>G.hclick(p,'.nav-item[data-pg="'+pg+'"]',{post:900});
const SW=async(p,c)=>{await p.evaluate(c=>{__login(c);},c); await p.waitForTimeout(900);};

async function employee(p){
  await card(p,'คู่มือพนักงาน','เข้าสู่ระบบ → ประเมินตนเอง → ดูผล → รับทราบ',3200); await uncard(p);
  await G.cap(p,'ขั้นที่ 1: เข้าสู่ระบบ','กรอกรหัสพนักงาน และ PIN ที่ได้รับจาก HR (ตัวอย่างนี้ใช้ SML-009)',1500);
  await G.htype(p,'#loginCode','SML-009',{delay:140}); await G.hclick(p,'#loginPin',{post:900});
  await G.cap(p,'ลืม PIN หรือเข้าใช้ครั้งแรก?','กดลิงก์ใต้ปุ่มเข้าสู่ระบบ เพื่อตั้ง PIN เองทางอีเมล หรือเปิดใช้งานด้วยรหัสจาก HR',3500);
  await G.hclick(p,'#loginBtn',{post:2500});
  await G.cap(p,'พนักงานเห็น 2 เมนู','1. ประเมินตนเอง  และ  8. ผลประเมิน  — กระดิ่งมุมขวาบนบอกงานที่รอคุณ',3500);
  await G.cap(p,'ขั้นที่ 2: เมนู 1 ประเมินตนเอง','กรอกรหัสพนักงาน ระบบเลือกแบบฟอร์มที่ HR กำหนดให้อัตโนมัติ',800);
  await NAV(p,'myeval');
  await G.htype(p,'#evalCodeGate','SML-009',{delay:140}); await p.dispatchEvent('#evalCodeGate','input'); await p.waitForTimeout(1500);
  await G.cap(p,'ขั้นที่ 3: เลือกเกรดทีละข้อ','A+ = ดีเยี่ยม … C = ต้องปรับปรุง คะแนนรวมขึ้นให้ทันที',500);
  const g=[0,1,1,2,1,0,2,1,1,2];
  await p.evaluate(()=>{const e=document.querySelector('#row-m0');scrollTo(0,e.getBoundingClientRect().top+scrollY-300);}); await p.waitForTimeout(800);
  for(let i=0;i<10;i++){ const btn=p.locator('#row-m'+i+' button.f-grade-btn').nth(g[i]); if(i<4) await G.hclick(p,btn,{pre:700,post:500}); else {await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(450);} }
  await G.cap(p,'ตรวจคะแนนรวม X = Y + Z','Y คือคะแนนผลงานจากเกรดที่เลือก  Z คือคะแนนเวลาทำงาน ระบบดึงจากข้อมูลสาย ลา ขาดจริง',500);
  await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(3800);
  await p.evaluate(()=>{const e=document.querySelector('#evalStrengths');scrollTo(0,e.getBoundingClientRect().top+scrollY-420);}); await p.waitForTimeout(600);
  await G.cap(p,'ขั้นที่ 4: เขียนจุดเด่นและสิ่งที่อยากพัฒนา','ช่วยให้หัวหน้าเข้าใจคุณมากขึ้น',300);
  await G.htype(p,'#evalStrengths','ดูแลลูกค้าได้ดี ส่งงานตรงเวลา',{delay:70}); await G.htype(p,'#evalDevelopment','อยากอบรม Excel ขั้นสูง',{delay:70});
  await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(500);
  await G.cap(p,'บันทึกร่างไว้ก่อนได้ตลอด','ยังไม่ส่ง กลับมาแก้ภายหลังได้ — พร้อมแล้วจึงกด "ส่งแบบประเมิน"',1500);
  await G.hclick(p,'#evalBtnSubmit',{post:1000});
  await G.cap(p,'ขั้นที่ 5: ตรวจแล้วกดยืนยันส่ง','ดูคะแนนรวมและชื่อหัวหน้าที่ระบบจะส่งถึง — ส่งแล้วแก้ไขเองไม่ได้ (เว้นแต่หัวหน้าตีกลับ)',4200);
  await G.hclick(p,'#mSubmit .btn-p, #mSubmit button:has-text("ยืนยันส่ง")',{post:2200});
  await G.cap(p,'ส่งเรียบร้อย','ระบบแจ้งหัวหน้าให้ตรวจสอบต่อ ถ้าถูกตีกลับจะเห็นเหตุผลและแก้ไขแล้วส่งใหม่ได้',4000);
  await G.uncap(p);
  await card(p,'ผ่านไปหลายวัน...','หัวหน้าสอบทานครบ GM อนุมัติและส่งผล — พนักงานได้รับอีเมล/LINE แจ้ง',3600);
  await D(p,'SML-009','ResultSent','A'); await SW(p,'SML-009'); await uncard(p);
  await G.cap(p,'ขั้นที่ 6: เมนู 8 ผลประเมิน','ดูคะแนน Y / Z / X ของคุณ — เกรดจะแสดงหลังผู้บริหารอนุมัติขั้นสุดท้าย (🔒)',600);
  await NAV(p,'myresult'); await p.waitForTimeout(4200);
  await G.cap(p,'ขั้นที่ 7: รับทราบผล','กด "รับทราบผลการประเมิน" เมื่อดูผลแล้ว (ทำผ่าน LINE ได้เช่นกัน)  ถ้าไม่เห็นด้วย กด "ขอหารือ" ระบุเหตุผลและวันที่ขอคุย',2500);
  await G.hclick(p,'button[onclick*="acknowledgeMyResult"]',{post:3500});
  await G.cap(p,'เสร็จสิ้น ✔','เก็บใบประเมินเป็น PDF ได้ที่ปุ่ม "ดาวน์โหลดใบประเมิน PDF"',4000);
}

async function supervisor(p){
  await D(p,'SML-010','Draft','B'); await D(p,'SML-011','Draft','C');
  await card(p,'คู่มือหัวหน้า','ประเมินทีมงาน → สอบทาน → อนุมัติ → ส่งผล (L1–L4)',3200); await uncard(p);
  await G.cap(p,'หัวหน้าหน่วย (L1): เข้าสู่ระบบ','ใช้รหัสพนักงานและ PIN เหมือนพนักงาน (ตัวอย่างนี้ใช้ สมศรี ใจดี)',800);
  await G.htype(p,'#loginCode','SML-901',{delay:140}); await G.hclick(p,'#loginBtn',{post:2500});
  await G.cap(p,'เมนู 2 ประเมินทีมงาน','เห็นเฉพาะลูกทีมในสายของคุณ  ตัวเลขสีแดง = จำนวนที่รอคุณ',500);
  await NAV(p,'team'); await p.waitForTimeout(3500);
  await G.cap(p,'กด "ประเมิน" เพื่อเปิดฟอร์ม','ดูสถิติเวลาทำงาน (สาย ลา ขาด) ของพนักงานก่อน แล้วให้เกรดทีละข้อ',500,true);
  await G.hclick(p,'#teamRows button.btn-p',{post:1800});
  await p.waitForTimeout(3500);
  await G.cap(p,'ปุ่มท้ายฟอร์ม','ตีกลับ = ส่งกลับให้แก้  |  บันทึกไว้ก่อน = เก็บไว้ ยังไม่แจ้งใคร  |  ยืนยันและส่ง = ส่งให้ผู้ประเมินคนถัดไป (แก้ไม่ได้อีก)',5000,true);
  await G.hclick(p,'#reviewerSubmitBtn',{post:2500});
  await G.cap(p,'ส่งแล้ว ระบบแจ้งผู้ประเมินคนถัดไปให้อัตโนมัติ','ใบออกจากคิวของคุณ — เปลี่ยนเป็น "ดูแบบฟอร์ม" (อ่านอย่างเดียว)',4000);
  await G.uncap(p);
  await card(p,'หัวหน้าแผนก (L2): สอบทาน','เมนู 3 — ตรวจใบที่ L1 ส่งมา',2800);
  for(const [c,s,l] of [['SML-009','A','of'],['SML-010','B','of'],['SML-011','C','of'],['SML-006','D','op']]) await D(p,c,'Submitted',s,{level:l});
  await SW(p,'SML-008'); await uncard(p);
  await G.cap(p,'เมนู 3 สอบทานหัวหน้าแผนก','เห็นคะแนน Y / Z / X ของทุกคน เรียงจากสูงไปต่ำ  กรองตามฝ่าย ส่วน แผนก กลุ่มงาน ได้',500);
  await NAV(p,'reviewl1'); await p.waitForTimeout(4500);
  await G.cap(p,'กด "สอบทานแบบฟอร์ม" เพื่อดูรายละเอียด','คะแนนรายข้อ ความเห็น และข้อมูลเวลาทำงานก่อนอนุมัติ',500,true);
  await G.hclick(p,'#reviewl1Rows button.btn-p',{post:2000}); await p.waitForTimeout(3500); await p.evaluate(()=>closeM()); await p.waitForTimeout(800);
  await G.cap(p,'ติ๊กเลือกคน แล้วเลือกอนุมัติหรือตีกลับ','ตีกลับต้องพิมพ์เหตุผล และถอยกลับหนึ่งขั้นเท่านั้น  ส่งแล้วแก้ไม่ได้',500);
  await G.hclick(p,'#reviewl1Rows input[type=checkbox]',{post:900}); await G.hclick(p,'#reviewl1Rows tr:nth-of-type(3) input[type=checkbox]',{post:900});
  await p.waitForTimeout(1800);
  await G.hclick(p,'button[onclick*="approveReviewL1Selected"]',{post:2500});
  await G.cap(p,'อนุมัติแล้ว ใบถูกส่งต่อ L3 อัตโนมัติ','คนที่ยังไม่ได้เลือก ยังอยู่ในคิวของคุณ',3800); await G.uncap(p);
  await card(p,'ผู้จัดการส่วน (L3) และ GM (L4)','ขั้นตอนเหมือนกัน: เมนู 4 และ เมนู 5',3000);
  for(const c of ['SML-009','SML-010','SML-011']) await D(p,c,'L1Reviewed',c==='SML-009'?'A':c==='SML-010'?'B':'C');
  await SW(p,'SML-005'); await uncard(p);
  await G.cap(p,'ผู้จัดการส่วน (L3): เมนู 4 สอบทาน','ติ๊กเลือก แล้วกด "ยืนยันและส่งให้ผู้ประเมินคนถัดไป"',600);
  await NAV(p,'review'); await p.waitForTimeout(3000);
  await G.hclick(p,'#reviewRows input[type=checkbox]',{post:700}); await G.hclick(p,'button[onclick*="approveReviewSelected"]',{post:2500});
  for(const c of ['SML-009','SML-010','SML-011']) await D(p,c,'L2Reviewed',c==='SML-009'?'A':c==='SML-010'?'B':'C');
  await SW(p,'SML-950');
  await G.cap(p,'GM (L4): เมนู 5 อนุมัติ GM','อนุมัติแล้ว พนักงานยังไม่เห็นผล — ต้องกด "ยืนยันส่งผลให้พนักงาน" อีกครั้ง',600);
  await NAV(p,'gmapprove'); await p.waitForTimeout(3000);
  await G.hclick(p,'#gmApproveRows input[type=checkbox]',{post:700}); await G.hclick(p,'button[onclick*="approveGmSelected"]',{post:2800});
  await G.cap(p,'ยืนยันส่งผลให้พนักงาน','ระบบแจ้งพนักงานทางอีเมล/LINE พร้อมคะแนน (เกรดยังล็อก) แล้วพนักงานจึงเข้าดูผลและรับทราบได้',2000);
  await p.evaluate(()=>{const e=document.querySelector('#gmSendRows');if(e)scrollTo(0,e.getBoundingClientRect().top+scrollY-300);}); await p.waitForTimeout(1500);
  const sb=p.locator('button[onclick*="sendResultToEmployeesSelected"]').first(); if(await sb.count()){ const ck=p.locator('#gmSendRows input[type=checkbox]').first(); if(await ck.count()) await G.hclick(p,ck,{post:600}); await G.hclick(p,sb,{post:2500}); }
  await G.cap(p,'เสร็จสิ้นขั้นตอนของหัวหน้า ✔','ติดตามความคืบหน้าได้ที่แดชบอร์ดและกระดิ่งแจ้งเตือน',4200);
}
(async()=>{ const w=process.argv[2]; if(w!=='2') await run('1-employee',employee); if(w!=='1') await run('2-supervisor',supervisor); })();
