const {open,ok,done}=require('./helpers.js');
(async()=>{
 const {b:browser,p:page,errs:errors}=await open();
 const r=await page.evaluate(()=>{
  const base=MASTER_USERS[0].slice();
  const mk=(id,email,pin)=>{const u=base.slice();u[0]=id;u[1]='N'+id;u[12]='active';u[15]=email;u[17]=pin||'';return u;};
  MASTER_USERS.push(mk('D1','a@sml.com','h'),mk('D2','b@sml.com','h'),mk('X1','ok@sml.com'),mk('X2','dup@sml.com'),mk('X3','dup@sml.com'),mk('X4','me@gmail.com'));
  const c=regPinCandidates(); const f=id=>c.find(x=>x.u[0]===id);
  return {x1:f('X1').flags.length,x2:f('X2').flags.length>0,x3:f('X3').flags.some(t=>/ซ้ำ/.test(t)),x4:f('X4').flags.some(t=>/โดเมน/.test(t))};
 });
 ok(r.x1===0,'อีเมลปกติไม่มีเครื่องหมายเตือน');
 ok(r.x2&&r.x3,'อีเมลซ้ำกับอีกคน → เตือน');
 ok(r.x4,'โดเมนต่างจากอีเมลบริษัท → เตือน');
 ok(errors.length===0,'ไม่มี JS error');
 await browser.close(); done();
})();
