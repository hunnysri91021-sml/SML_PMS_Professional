/* ลงทะเบียน LINE จากหน้าล็อกอิน + กันทับ LINE ของคนอื่น (#305) */
const crypto=require('crypto'); const path=require('path');
const {ok,done,open}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'x',LINE_CHANNEL_SECRET:'sec',LINE_CHANNEL_ACCESS_TOKEN:'tok'};
let EMPS=[['E1','คนหนึ่ง','emp'],['E2','คนสอง','emp']];
let SETS=[['E2','','','','0','Uold']];
const writes=[],replies=[];
function mock(){ global.fetch=async(url,opt={})=>{ const u=String(url),m=opt.method||'GET'; const j=o=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)});
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(u.includes('/drive')&&!u.includes('/rows')&&!u.includes('/range')) return j({id:'DRV'});
  if(u.includes('/sites/')&&!u.includes('/rows')) return j({id:'SITE'});
  if(u.includes("tables('Employees')/rows")&&m==='GET') return j({value:EMPS.map((r,i)=>({index:i,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")&&m==='GET'&&!u.includes('itemAt')) return j({value:SETS.map((r,i)=>({index:i,values:[r]}))});
  if(u.includes("tables('EmployeeSettings')/rows")&&m!=='GET'){ writes.push(JSON.parse(opt.body).values[0]); return j({}); }
  if(u.includes('api.line.me')&&u.includes('/reply')){ replies.push(JSON.parse(opt.body).messages[0].text); return j({}); }
  return j({value:[]}); }; }
(async()=>{
  mock(); const w=(await import(W+'?'+Math.random())).default;
  const hook=async(userId,text)=>{ const body=JSON.stringify({events:[{type:'message',replyToken:'r',source:{userId},message:{type:'text',text}}]});
    const sig=crypto.createHmac('sha256','sec').update(body).digest('base64');
    await w.fetch(new Request('https://w/webhook/line',{method:'POST',headers:{'x-line-signature':sig},body}),ENV); };
  await hook('Unew','E1');
  ok(writes.length===1&&writes[0][5]==='Unew'&&/สำเร็จ/.test(replies[0]),'พิมพ์รหัสตัวเอง → ผูก LINE และตอบสำเร็จ');
  writes.length=0; replies.length=0;
  await hook('Uattacker','E2');
  ok(writes.length===0&&/ลงทะเบียน LINE ไว้แล้ว/.test(replies[0]),'รหัสที่มี LINE อยู่แล้ว → ไม่ทับ ตอบให้ติดต่อ HR');
  writes.length=0; await hook('Uold','E2');
  ok(writes.length===1,'เจ้าของ LINE เดิมส่งซ้ำ → อัปเดตได้');

  const {b,p,errs}=await open();
  await p.evaluate(()=>{ localStorage.setItem('smlPmsMs365GraphConfig',JSON.stringify({lineAddUrl:'x'})); });
  const d0=await p.evaluate(()=>{ localStorage.removeItem('smlPmsMs365GraphConfig'); openLineReg(); const a=document.getElementById('lineRegBtn'); const r={d:getComputedStyle(a).display,h:a.href}; closeLineReg(); return r; });
  ok(d0.d==='block'&&d0.h==='https://lin.ee/wbG39xc','ค่าเริ่มต้น = ลิงก์ LINE OA จริงของบริษัท');
  const r1=await p.evaluate(()=>{ localStorage.setItem('smlPmsMs365GraphConfig',JSON.stringify({lineAddUrl:'https://evil.example/'})); openLineReg(); return {btn:getComputedStyle(document.getElementById('lineRegBtn')).display,msg:document.getElementById('lineRegMsg').textContent}; });
  ok(r1.btn==='none'&&/ติดต่อ HR/.test(r1.msg),'ลิงก์ผิดรูปแบบ → ซ่อนปุ่มและบอกให้ติดต่อ HR');
  const r2=await p.evaluate(()=>{ closeLineReg(); const k='smlPmsMs365GraphConfig'; const cfg=JSON.parse(localStorage.getItem(k)||'{}'); cfg.lineAddUrl='https://line.me/R/ti/p/@abc'; localStorage.setItem(k,JSON.stringify(cfg)); openLineReg(); const a=document.getElementById('lineRegBtn'); return {d:getComputedStyle(a).display,h:a.href,k}; });
  ok(r2.d==='block'&&r2.h==='https://line.me/R/ti/p/@abc','ตั้งลิงก์แล้ว → ปุ่มเพิ่มเพื่อนชี้ลิงก์ที่ตั้ง ('+r2.k+')');
  const r3=await p.evaluate(()=>{ closeLineReg(); const k='smlPmsMs365GraphConfig'; const cfg=JSON.parse(localStorage.getItem(k)); cfg.lineAddUrl='https://evil.example/x'; localStorage.setItem(k,JSON.stringify(cfg)); openLineReg(); return getComputedStyle(document.getElementById('lineRegBtn')).display; });
  ok(r3==='none','ลิงก์ที่ไม่ใช่ line.me/lin.ee ถูกปฏิเสธ');
  ok(errs.length===0,'ไม่มี JS error '+errs.join('|'));
  await b.close(); done();
})();
