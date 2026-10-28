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
/* ช่วยสร้างข้อมูลทดสอบ — ใช้ใน page.evaluate ผ่าน string ไม่ได้ จึงเป็น source ที่ inject เข้าหน้า */
const INJECT = `
window.__mockGraph=function(){ window.__pushes=[]; window.__remote=[];
  window.graphUpsertTableRow=async(t,k,v,row)=>{ window.__pushes.push(row.slice()); return 'ok'; };
  window.graphAddTableRow=async()=> 'ok';
  window.graphListTableRows=async()=>window.__remote.map(r=>r.slice());
  window.workerFetch=async()=>({ok:true});
};
window.__emp=function(code,o){ o=o||{}; const u=MASTER_USERS[0].slice(); u[0]=code; u[1]=o.name||('คน '+code); u[2]=o.role||'emp'; u[3]=o.group||'G1'; u[4]=o.group||'G1'; u[5]=o.group||'G1'; u[6]=o.dept||'D1'; u[9]=o.l1||''; u[10]=o.l2||''; u[11]=o.l4||''; u[12]='active'; u[15]=o.email||''; u[18]=o.level||'of'; u[19]=o.l3||''; u[20]=''; MASTER_USERS.push(u); return u; };
window.__draft=function(code,status,X,o){ o=o||{}; const cy=getCurrentEvalCycleYear(); const d=[code,'n',cy,o.level||'of',2,2,2,2,2,2,2,2,2,2,null,null,null,null,X-10,10,X,gradeFromX(X),status]; const a=getDrafts(); a.push(d); saveDrafts(a); return d; };
window.__login=function(u){ CURRENT_SESSION_USER=u; applySession(u); };
`;
module.exports.INJECT=INJECT;
