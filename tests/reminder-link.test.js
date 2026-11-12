const { chromium } = require('playwright');
const path = require('path');
(async()=>{
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://'+path.resolve(__dirname,'../SML_PMS_v14.html'));
  await p.waitForTimeout(500);
  const r = await p.evaluate(async()=>{
    const sent=[]; window.sendLineReminder=async(t,m)=>{sent.push(m);return {sent:1}};
    window.getReminderTargets=()=>[['X','n','emp','','','','','','','','','','','','','a@b.c']];
    window.sendEmailToList=async(l,s,m)=>{sent.push(m);return {configured:true,sentCount:1,failedCount:0}};
    document.getElementById('rm_ch_line').checked=true; document.getElementById('rm_ch_email').checked=true;
    await sendReminder(); return {sent, url:loadMs365Config().appUrl};
  });
  const ok = r.url && r.sent.length===2 && r.sent.every(m=>m.includes(r.url));
  console.log(ok?'PASS reminder-link':'FAIL reminder-link', JSON.stringify(r));
  await b.close(); process.exit(ok?0:1);
})();
