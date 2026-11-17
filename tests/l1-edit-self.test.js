/* L1 แก้คะแนนที่พนักงานประเมินตนเองได้ก่อนส่งต่อ */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    __emp('D2',{name:'หน.แผนก',role:'l1',email:'d2@x.com'});
    __emp('U1',{name:'หน.หน่วย',role:'unit',email:'u1@x.com',l1:'หน.แผนก'});
    __emp('S1',{name:'พนง.หนึ่ง',role:'emp',level:'of',l1:'หน.หน่วย',l2:'หน.แผนก',email:'s1@x.com'});
    const cy=getCurrentEvalCycleYear();
    const a=getDrafts(); a.push(['S1','n',cy,'of',15,15,15,10,10,10,10,5,5,5,null,null,null,null,50,30,80,'B','SelfSubmitted']); saveDrafts(a);
    __login(MASTER_USERS.find(u=>u[0]==='U1'));
    document.querySelector('.nav-item[data-pg="team"]').click();
    populateTeamManagerSelect(); document.getElementById('teamManagerSelect').value='หน.หน่วย'; renderTeamFromMaster();
    const row=[...document.querySelectorAll('#teamRows tr')].find(t=>/S1/.test(t.textContent));
    const out={btn:row?(row.querySelector('button.btn')||{}).textContent:'none', onclick:row?(row.querySelector('button.btn')||{}).getAttribute('onclick'):''};
    out.viewOnly=/,true\)/.test(out.onclick||'');
    openReviewerForm('of','พนง.หนึ่ง','S1','พนักงาน',cy,false);
    out.hidden=getComputedStyle(document.getElementById('reviewerSubmitBtn')).display;
    const rows=[...document.querySelectorAll('#reviewerFormArea .reviewer-table tbody tr')];
    out.before=rows[0].querySelector('.review-got').textContent;
    // เปลี่ยนข้อ 1 เป็นระดับต่ำสุด
    const btns=rows[0].querySelectorAll('button'); btns[btns.length-1].click();
    out.after=rows[0].querySelector('.review-got').textContent;
    // บันทึกไว้ก่อน (ยังไม่ส่งต่อ) แล้วรวมส่งทีเดียว
    await saveReviewerHold();
    let d=getDrafts().find(x=>x[0]==='S1'); out.holdStatus=d[d.length-1]; out.holdM0=d[4]; out.held=isHeld(draftKey(d));
    document.querySelector('.nav-item[data-pg="team"]').click(); populateTeamManagerSelect(); document.getElementById('teamManagerSelect').value='หน.หน่วย'; renderTeamFromMaster();
    out.chk=document.querySelectorAll('#teamRows .team-chk').length;
    document.querySelector('#teamRows .team-chk').checked=true;
    await sendHeldTeamSelected();
    d=getDrafts().find(x=>x[0]==='S1'); out.m0=d[4]; out.status=d[d.length-1];
    return out;
  });
  console.log(JSON.stringify(r));
  ok(/ประเมิน|สอบทาน/.test(r.btn)&&!r.viewOnly,'L1 เห็นปุ่มแก้ไข ไม่ใช่ดูอย่างเดียว');
  ok(r.hidden!=='none','ปุ่มส่งต่อแสดง');
  ok(r.before!==r.after,'กดเปลี่ยนเกรดแล้วคะแนนข้อนั้นเปลี่ยน');
  ok(r.holdStatus==='SelfSubmitted'&&r.holdM0===11&&r.held&&r.chk===1,'L1 บันทึกไว้ก่อน: สถานะคงเดิม+พักไว้+มีช่องติ๊ก ('+r.holdStatus+','+r.chk+')');
  ok(r.m0!==15&&r.status==='Submitted','บันทึกคะแนนที่ L1 แก้ + ส่งต่อ ('+r.m0+','+r.status+')');
  ok(errs.length===0,'no page errors '+errs.join('|'));
  await b.close(); done();
})();
