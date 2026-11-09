/* #289: Import ไฟล์ HRGO แล้ว push คนที่ import ขึ้น Excel อัตโนมัติ (เฉพาะคนในไฟล์) + แจ้งผลตามจริง */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __emp('H1'); __emp('H2'); __emp('H3');
    ATTENDANCE.H3={name:'x',lateCount:9,earlyCount:0,absentDay:0,personalDay:0,personalHr:0,personalMin:0,sickDay:0,sickHr:0,sickMin:0,medCert:''};
    isMs365Configured=()=>true;
    const pushed=[]; let failCode=null;
    graphUpsertTableRowPartial=async(t,k,code,row)=>{ if(code===failCode) throw new Error('boom'); pushed.push(t+':'+code); };
    graphUpsertTableRow=async(t,k,code)=>{ pushed.push(t+':'+code); };
    const hdr=HRGO_TEMPLATE_HEADERS.join(',');
    const csv=hdr+'\nH1,x,0,2,0,1,4,0,0,0,0,0,0,0,\nH2,x,1,0,0,0,0,0,3,0,0,0,0,0,\nNOPE,x,0,0,0,0,0,0,0,0,0,0,0,0,\n';
    const file=new File([new TextEncoder().encode(csv)],'t.csv');
    let confirmMsgs=[]; let confirmAns=true; window.confirm=(m)=>{confirmMsgs.push(m); return confirmAns;};
    let toasts=[]; const st=smlToast; smlToast=(m,t)=>{toasts.push(m);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    importHrgoFile({files:[file]}); await wait(600);
    const o={pushed:[...pushed],toasts:[...toasts],h3:ATTENDANCE.H3.lateCount};
    pushed.length=0; toasts.length=0; failCode='H2';
    importHrgoFile({files:[file]}); await wait(600);
    o.pushed2=[...pushed]; o.toasts2=[...toasts];
    /* ยกเลิกที่หน้าต่างยืนยัน → ไม่ทับ ไม่ push */
    ATTENDANCE.H1={name:'x',lateCount:7,earlyCount:0,absentDay:0,personalDay:0,personalHr:0,personalMin:0,sickDay:0,sickHr:0,sickMin:0,medCert:''};
    pushed.length=0; toasts.length=0; failCode=null; confirmAns=false; confirmMsgs.length=0;
    importHrgoFile({files:[file]}); await wait(600);
    o.cancelLate=ATTENDANCE.H1.lateCount; o.cancelPushed=[...pushed]; o.cancelToasts=[...toasts]; o.confirmMsg=confirmMsgs[0]||'';
    /* ไฟล์ใหม่ล้วน (ไม่มีใครมีข้อมูลเดิม) → ไม่ถามยืนยัน */
    delete ATTENDANCE.H1; delete ATTENDANCE.H2; confirmMsgs.length=0; confirmAns=false;
    const csv2=hdr+'\nH1,x,0,2,0,0,0,0,0,0,0,0,0,0,\n';
    importHrgoFile({files:[new File([new TextEncoder().encode(csv2)],'n.csv')]}); await wait(600);
    o.newAsked=confirmMsgs.length; o.newImported=!!ATTENDANCE.H1;
    smlToast=st; return o;
  });
  ok(r.pushed.includes('Attendance:H1')&&r.pushed.includes('Attendance:H2'),'push Attendance คนที่ import ('+r.pushed.join(',')+')');
  ok(r.pushed.includes('AttendanceDetail:H1'),'push AttendanceDetail ด้วย');
  ok(!r.pushed.some(x=>x.endsWith(':H3')||x.endsWith(':NOPE')),'ไม่ push คนที่ไม่อยู่ในไฟล์/รหัสไม่พบ');
  ok(r.h3===9,'คนนอกไฟล์ไม่ถูกแตะ');
  ok(r.toasts.some(m=>/Push.*สำเร็จ 2 คน/.test(m)),'toast แจ้ง push 2 คน ('+r.toasts.join(' | ')+')');
  ok(r.toasts2.some(m=>/ล้มเหลว 1 คน/.test(m)),'ล้มเหลวแจ้งตามจริง');
  ok(r.cancelLate===7&&r.cancelPushed.length===0,'กดยกเลิก → ข้อมูลเดิมไม่ถูกทับ ไม่ push');
  ok(r.cancelToasts.some(m=>/ยกเลิกการนำเข้า/.test(m)),'toast แจ้งยกเลิก');
  ok(/แทนที่ทั้งแถว/.test(r.confirmMsg)&&/2 คนมีข้อมูลเวลาอยู่แล้ว/.test(r.confirmMsg),'ข้อความยืนยันบอกจำนวนที่จะถูกทับ ('+r.confirmMsg.slice(0,60)+')');
  ok(r.newAsked===0&&r.newImported,'ไฟล์ที่มีแต่คนใหม่ → ไม่ถามยืนยัน นำเข้าได้เลย');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
