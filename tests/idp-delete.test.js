/* ลบ IDP: ลบในเว็บ + ลบแถวใน Excel ตาราง IDP (#252) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(async()=>{
    const out={}; window.confirm=()=>true;
    window.__del=[];
    window.graphDeleteTableRows=async(t,c,v)=>{ window.__del.push([t,c,v]); return 1; };
    idpData=[{code:'I1',name:'A',dept:'d',grade:'B',plan:'p',status:'pending'},{code:'I2',name:'B',dept:'d',grade:'B',plan:'p',status:'pending'}];
    await deleteIdp(0);
    out.left=idpData.map(x=>x.code); out.del=window.__del;
    // ล้มเหลว: เว็บยังลบ แต่ไม่ throw
    window.graphDeleteTableRows=async()=>{ throw new Error('boom'); };
    await deleteIdp(0);
    out.left2=idpData.length;
    return out;
  });
  ok('ลบในเว็บ 1 รายการ', JSON.stringify(r.left)==='["I2"]');
  ok('เรียกลบ Excel ตาราง IDP คีย์รหัส', JSON.stringify(r.del)==='[["IDP",0,"I1"]]');
  ok('Excel ล้มเหลวยังลบในเว็บ', r.left2===0);
  ok('ไม่มี pageerror', errs.length===0);
  await b.close(); done();
})();
