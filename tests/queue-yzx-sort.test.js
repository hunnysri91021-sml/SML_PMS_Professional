const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT);
  const r=await p.evaluate(()=>{
    const mk=(c,x,y,z)=>({emp:['"'+c+'"'].length&&[c,'N'+c,'emp','g','s','d','dep','pos'],draft:[c,'x','2569','op',1,2,3,4,5,6,7,8,9,10,11,y,z,x,'B','Submitted'],state:'ready'});
    const rs=[mk('A',60,40,20),mk('B',90,60,30),mk('C',75,50,25)];
    const sorted=sortRosterBy(rs,'scoreDesc').map(r=>r.emp[0]).join('');
    const cells=yzCells(rs[1].draft,true);
    return {sorted,cells,hdr:[...document.querySelectorAll('#pg-reviewl1 thead th,#pg-review thead th,#pg-gmapprove thead th')].map(t=>t.textContent).join('|')};
  });
  ok(r.sorted==='BCA','sorted desc by X: '+r.sorted);
  ok(/60\.00[\s\S]*30\.00[\s\S]*90/.test(r.cells),'Y/Z/X cells');
  ok(r.hdr.includes('คะแนนผลงาน (Y)')&&r.hdr.includes('คะแนนเวลา/สถิติ (Z)'),'headers');
  ok(errs.length===0,'no errors '+errs.join('|'));
  await b.close(); done();
})();
