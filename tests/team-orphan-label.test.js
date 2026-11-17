const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
 const {b,p,errs}=await open(); await p.evaluate(INJECT);
 const r=await p.evaluate(()=>{
  __mockGraph();
  __emp('M1',{name:'หน.หน่วย',role:'unit',email:'m@x.com'});
  __emp('S1',{name:'พนง.หนึ่ง',role:'emp',level:'of',l1:'หน.หน่วย'});
  const cy=getCurrentEvalCycleYear(); const a=getDrafts();
  a.push(['S1','n',cy,'of',15,15,15,10,10,10,10,5,5,5,null,null,null,null,50,30,80,'B','Submitted']); saveDrafts(a);
  __login(MASTER_USERS.find(u=>u[0]==='M1'));
  document.querySelector('.nav-item[data-pg="team"]').click(); populateTeamManagerSelect(); document.getElementById('teamManagerSelect').value='หน.หน่วย'; renderTeamFromMaster();
  return document.getElementById('teamRows').textContent.replace(/\s+/g,' ');
 });
 ok(/ไม่พบผู้สอบทาน L2/.test(r),'เตือนเมื่อหาผู้สอบทาน L2 ไม่เจอ'); ok(!/ส่งแล้ว · รอ L2/.test(r),'ไม่อ้างว่ารอ L2');
 ok(errs.length===0,'no page errors'); await b.close(); done();
})();
