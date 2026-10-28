const {chromium}=require('playwright');
const path=require('path');
const FILE='file://'+path.resolve(__dirname,'..','SML_PMS_v14.html');
async function open(){
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',d=>d.accept());
  await p.goto(FILE); await p.waitForTimeout(700);
  return {b,p,errs};
}
let fails=0;
function ok(c,m){ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; }
function done(){ process.exit(fails?1:0); }
module.exports={open,ok,done};
