/* #270: ผู้ตรวจ L3 (u[19]) ไม่ต้องมี role l2 */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.confirm=()=>true; window.isWorkerConfigured=()=>false;
    const cy=getCurrentEvalCycleYear();
    const l1=__emp('V1',{name:'หัวหน้าแผนกV',role:'l1',level:'ldr'});
    const e=__emp('V2',{name:'พนักงานV',role:'emp',level:'of',l1:'หัวหน้าแผนกV',l2:'หัวหน้าแผนกV',l3:'หัวหน้าแผนกV'});
    const out={};
    out.resolved=(resolveL2Reviewer(e)||[])[0];
    out.selfExcluded=resolveL2Reviewer(l1)===null;
    __login(l1);
    out.scope=getMyScopedEmpCodes().has('V2');
    const nav=document.querySelector('.nav-item[data-pg="review"]');
    out.nav=nav&&nav.style.display!=='none';
    return out;
  });
  ok(r.resolved==='V1','ชื่อในช่อง L3 ที่ role ไม่ใช่ l2 ถูกรับเป็นผู้สอบทาน');
  ok(r.selfExcluded,'ไม่นับตัวเองเป็นผู้สอบทานของตัวเอง');
  ok(r.scope,'คนที่ถูกระบุเป็น L3 เห็นพนักงานนั้นใน scope');
  ok(r.nav,'เมนู "4. สอบทานผู้จัดการส่วน (L3)" ถูกแสดง');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
