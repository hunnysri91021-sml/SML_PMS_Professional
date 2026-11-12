const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/SML_PMS_v14.html');await p.waitForTimeout(600);
let fail=0;const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n);if(!c)fail++;};
const r=await p.evaluate(()=>{
  const names=CYCLE_STEP_DEFAULTS.map(d=>d[0]);
  // รอบที่เก็บชุดเดิม (ยังไม่แก้) -> ต้องย้ายเป็นลำดับใหม่
  const old=CYCLE_STEP_OLD_DEFAULT_NAMES.map((n,i)=>({id:'o'+i,order:i+1,name:n,owner:'',start:'',end:'',canReject:false,remind:'',status:'wait'}));
  const o={}; o['CYX']={steps:old,at:''}; o['CYC']={steps:old.map((s,i)=>i===0?{...s,end:'2026-01-05'}:s),at:''};
  saveCycleStepsStore(o);
  const migrated=getCycleSteps('CYX').map(s=>s.name);
  const custom=getCycleSteps('CYC').map(s=>s.name);
  const stages=CYCLE_STEP_DEFAULTS.map(d=>d[4]);
  return {names,migrated,custom,stages,ranks:stages.map(k=>evalStatusRank(CYCLE_STAGE_STATUS[k]))};
});
ok('ลำดับใหม่ 9 ขั้น: รับทราบมาก่อน Calibration',r.names.indexOf('พนักงานรับทราบผล')<r.names.indexOf('Calibration (Bell Curve)'));
ok('MD อนุมัติเป็นขั้นสุดท้าย',r.names[r.names.length-1]==='MD-SML อนุมัติ');
ok('rank ของสถานะเรียงจากน้อยไปมากตามลำดับขั้น',r.ranks.every((x,i)=>i===0||x>r.ranks[i-1]));
ok('ชุดเดิมที่ไม่เคยแก้ถูกย้ายเป็นลำดับใหม่',JSON.stringify(r.migrated)===JSON.stringify(r.names));
ok('ชุดที่ใส่วันที่แล้ว (แก้เอง) ไม่ถูกแตะ',r.custom[1]==='หัวหน้าแผนก / Leader ประเมิน');
ok('ไม่มี JS error',errs.length===0);
await b.close();process.exit(fail?1:0);})();
