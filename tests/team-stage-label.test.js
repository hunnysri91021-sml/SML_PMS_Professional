const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
 const {b,p,errs}=await open(); await p.evaluate(INJECT);
 const r=await p.evaluate(()=>{
  __mockGraph();
  __emp('M1',{name:'หน.หน่วย',role:'unit',email:'m@x.com'});
  __emp('L3X',{name:'ผู้ตรวจ L3',role:'l2'});
  __emp('S1',{name:'พนง.หนึ่ง',role:'emp',level:'of',l1:'หน.หน่วย',l3:'ผู้ตรวจ L3'});
  __emp('S2',{name:'พนง.สอง',role:'emp',level:'of',l1:'หน.หน่วย'});
  const cy=getCurrentEvalCycleYear(); const a=getDrafts();
  a.push(['S1','n',cy,'of',15,15,15,10,10,10,10,5,5,5,null,null,null,null,50,30,80,'B','L1Reviewed']);
  a.push(['S2','n',cy,'of',15,15,15,10,10,10,10,5,5,5,null,null,null,null,50,30,80,'B','GMApproved']); saveDrafts(a);
  __login(MASTER_USERS.find(u=>u[0]==='M1'));
  document.querySelector('.nav-item[data-pg="team"]').click(); populateTeamManagerSelect(); document.getElementById('teamManagerSelect').value='หน.หน่วย'; renderTeamFromMaster();
  return document.getElementById('teamRows').textContent.replace(/\s+/g,' ');
 });
 ok(/ส่งแล้ว · รอ L3/.test(r),'L1Reviewed แสดง รอ L3'); ok(/GM อนุมัติแล้ว รอส่งผล/.test(r),'GMApproved แสดงขั้นจริง');
 ok(errs.length===0,'no page errors'); await b.close(); done();
})();
