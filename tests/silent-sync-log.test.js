/* #250 sync แบบ silent ที่ล้มเหลวต้องทิ้งร่องรอยใน Sync Log (ห้ามเงียบ) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(async()=>{
    localStorage.removeItem(MS365_SYNC_LOG_KEY);
    window.graphListTableRows=async()=>{ throw new Error('TABLE_NOT_FOUND_TEST'); };
    const names=['ms365SyncKpiGoals','ms365SyncIdp','ms365SyncOrgMaster','ms365SyncStageSigners','ms365SyncEvalComments','ms365SyncHrNotes','ms365SyncApprovalSignatures','ms365SyncAckChannel','ms365SyncFormWeights','ms365SyncCyclesList','ms365SyncCycleSetup','ms365SyncEmployeeSettingsSilent'];
    const missing=[];
    for(const n of names){
      localStorage.removeItem(MS365_SYNC_LOG_KEY);
      try{ await window[n](true); }catch(e){}
      const log=localStorage.getItem(MS365_SYNC_LOG_KEY)||'';
      if(!log.includes('TABLE_NOT_FOUND_TEST')) missing.push(n);
    }
    return missing;
  });
  ok(r.length===0,'ทุก sync silent ล้มแล้วมี log: ขาด '+r.join(','));
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await done(b);
})();
