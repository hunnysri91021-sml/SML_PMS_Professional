const { chromium } = require('playwright');
const path = require('path');
(async()=>{
  const b = await chromium.launch(); const p = await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.resolve(__dirname,'../SML_PMS_v14.html'));
  await p.waitForTimeout(500);
  const r = await p.evaluate(async()=>{
    CURRENT_SESSION_USER=['A','Admin','admin']; 
    document.getElementById('attPeriodFrom').value='2025-12-01';
    document.getElementById('attPeriodTo').value='2026-10-31';
    const out={};
    out.before=attPeriodLabel();
    document.getElementById('attPeriodIncomplete').checked=true;
    document.getElementById('attPeriodNote').value='ข้อมูลถึง ต.ค. <b>x</b>';
    await saveAttPeriod();
    out.after=attPeriodLabel();
    out.stored=JSON.parse(localStorage.getItem(ATT_PERIOD_KEY));
    renderMyResult();
    out.noteShown=document.getElementById('myResultAttNote').style.display!=='none';
    out.noteText=document.getElementById('myResultAttNoteText').textContent;
    document.getElementById('attPeriodIncomplete').checked=false;
    document.getElementById('attPeriodNote').value='';
    await saveAttPeriod();
    out.cleared=attPeriodLabel();
    out.noteHidden=document.getElementById('myResultAttNote').style.display==='none';
    return out;
  });
  const ok = !r.before.includes('⚠️') && r.after.includes('⚠️') && r.after.includes('&lt;b&gt;') && !r.after.includes('<b>')
    && r.stored.incomplete===true && r.noteShown && r.noteText.includes('คะแนนที่เห็นอาจเปลี่ยน') && !r.cleared.includes('⚠️') && r.noteHidden && !errs.length;
  console.log(ok?'PASS att-period-incomplete':'FAIL att-period-incomplete', JSON.stringify(r), errs);
  await b.close(); process.exit(ok?0:1);
})();
