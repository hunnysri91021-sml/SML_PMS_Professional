/* #240: คิว Calibration/L1-L4 กรององค์กรรวมกันได้ (ตัวเลือกแคบลงตามช่องอื่น) + เรียงรหัส/เกรด A→E */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  await p.evaluate(INJECT); await p.evaluate(()=>__mockGraph());
  const r=await p.evaluate(()=>{
    const out={};
    const mk=(c,g,sec,dep)=>{ const u=__emp(c,{name:'พนง'+c,dept:dep}); u[3]=g; u[4]=sec; };
    mk('Q3','G1','S1','D1'); mk('Q1','G1','S1','D1'); mk('Q2','G1','S2','D1'); mk('Q4','G2','S3','D2');
    const gs={Q1:'C',Q2:'A',Q3:'E',Q4:'B'};
    Object.keys(gs).forEach(c=>{ __draft(c,'Acknowledged',80); const ds=getDrafts(); const d=ds.find(x=>x[0]===c); d[d.length-2]=gs[c]; saveDrafts(ds); });
    const adm=MASTER_USERS.find(u=>u[2]==='admin')||MASTER_USERS[0]; CURRENT_SESSION_USER=adm;
    renderCalibQueue();
    const sel=id=>document.getElementById(id);
    const codes=()=>[...document.querySelectorAll('#calibRows .calib-adj')].map(i=>i.dataset.key.split('|')[0]).filter(c=>c.startsWith('Q'));
    // กรองรวม: กลุ่ม G1 → แผนก เหลือ S1,S2 (ไม่มี S3)
    sel('calibFilterGroup').value='G1'; renderCalibQueue();
    out.secOpts=[...sel('calibFilterSection').options].map(o=>o.value).filter(Boolean).sort().join(',');
    sel('calibFilterSection').value='S1'; renderCalibQueue();
    out.combo=codes().sort().join(',');
    sel('calibFilterSection').value=''; sel('calibFilterGroup').value=''; renderCalibQueue();
    sel('calibSort').value='code'; renderCalibQueue(); out.byCode=codes().join(',');
    sel('calibSort').value='gradeAE'; renderCalibQueue(); out.gradeAE=codes().join(',');
    sel('calibSort').value='gradeEA'; renderCalibQueue(); out.gradeEA=codes().join(',');
    // #241: มุมมองรวมทั้งบริษัท = ไม่มีแถวหัวฝ่าย / แยกฝ่าย = มีหัวฝ่ายของ D1 และ D2
    sel('calibSort').value=''; renderCalibQueue();
    out.grpDept=document.querySelectorAll('#calibRows .org-grp-row').length;
    sel('calibView').value='all'; renderCalibQueue();
    out.grpAll=document.querySelectorAll('#calibRows .org-grp-row').length; out.allCodes=codes().length;
    sel('calibView').value='dept'; sel('calibFilterDept').value='D2'; renderCalibQueue(); out.d2=codes().join(',');
    return out;
  });
  ok(r.secOpts==='S1,S2','ตัวเลือกแผนกแคบลงตามกลุ่มที่เลือก: '+r.secOpts);
  ok(r.combo==='Q1,Q3','กรองกลุ่ม+แผนกพร้อมกัน: '+r.combo);
  ok(r.byCode.indexOf('Q1')<r.byCode.indexOf('Q2'),'เรียงรหัส: '+r.byCode);
  ok(r.gradeAE.indexOf('Q2')<r.gradeAE.indexOf('Q1') ,'เกรด A→E (Q2=A ก่อน Q1=C): '+r.gradeAE);
  ok(r.gradeEA.startsWith('Q3'),'เกรด E→A เริ่มที่ E: '+r.gradeEA);
  ok(r.grpDept>=2,'แยกตามฝ่าย มีหัวฝ่าย: '+r.grpDept);
  ok(r.grpAll===0 && r.allCodes===4,'รวมทั้งบริษัท ไม่มีหัวฝ่าย แต่ครบ 4 คน');
  ok(r.d2==='Q4','เลือกฝ่าย D2 เห็นเฉพาะฝ่ายนั้น: '+r.d2);
  ok(errs.length===0,'ไม่มี pageerror '+errs.join('|'));
  await b.close(); done();
})();
