const {open,ok,done}=require('./helpers');
(async()=>{const {b,p,errs}=await open();
 await p.evaluate(()=>{document.querySelector('.content').style.minHeight='3000px'});
 for(const y of [0,500,1500]){ await p.evaluate(y=>scrollTo(0,y),y); await p.waitForTimeout(80);
  const r=await p.evaluate(()=>{const s=document.getElementById('sb').getBoundingClientRect();return [Math.round(s.top),Math.round(s.bottom),innerHeight]});
  ok(r[0]===0&&r[1]===r[2],'sidebar pinned full height at scroll '+y);}
 ok(!errs.length,'no page errors'); await b.close(); done();})();
