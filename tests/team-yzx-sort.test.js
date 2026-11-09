const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    const mgr=__emp('TM',{name:'หัวหน้าทีม',role:'l1',level:'ldr'});
    ['T1','T2','T3'].forEach(c=>__emp(c,{name:'พนง'+c,role:'emp',level:'op',l1:'หัวหน้าทีม'}));
    const cy=getCurrentEvalCycleYear();
    const mk=(c,y,z)=>[c,'x',cy,'op',1,2,3,4,5,6,7,8,9,10,11,y,z,y+z,'B','Submitted'];
    saveDrafts([mk('T1',40,20),mk('T2',60,30)]);
    __login(mgr); populateTeamManagerSelect(); renderTeamFromMaster();
    const rows=[...document.querySelectorAll('#teamRows tr:not(.org-grp-row)')].map(tr=>[...tr.children].map(c=>c.textContent.trim().replace(/\s+/g,' ')));
    let cap=null; window.downloadCsv=(n,h,rows)=>{cap={h,rows};}; exportTeamListToExcel();
    return {cap,rows,hdr:[...document.querySelectorAll('#pg-team thead th')].map(t=>t.textContent)};
  });
  ok(r.hdr.includes('คะแนนผลงาน (Y)')&&r.hdr.includes('คะแนนเวลา/สถิติ (Z)'),'headers');
  ok(r.rows.length===3&&r.rows[0][1].includes('T2')&&r.rows[1][1].includes('T1')&&r.rows[2][1].includes('T3'),'order T2,T1,T3: '+JSON.stringify(r.rows.map(x=>x[1])));
  ok(r.rows[0].includes('60.00')&&r.rows[0].includes('30.00'),'Y/Z shown');
  ok(r.cap&&r.cap.h.includes('คะแนนรวม (X)')&&r.cap.rows[0][0]==='T2'&&r.cap.rows[0][5]===60&&r.cap.rows[0][6]===30&&r.cap.rows[0][7]===90,'export Y/Z/X sorted: '+JSON.stringify(r.cap&&r.cap.rows[0]));
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
