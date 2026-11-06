/* #278: ตาราง Cycles จริง 8 คอลัมน์ (Cycle_ID·ปีรอบ·วันเริ่ม·วันสิ้นสุด·Y:Z Mode·โหมดปล่อยผล·ผู้สร้าง·Status) */
const {open,ok,done,INJECT}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open(); await p.evaluate(INJECT);
  const r=await p.evaluate(async()=>{
    __mockGraph(); window.isMs365Configured=()=>true;
    const out={};
    out.d1=cyclesDateIn('01/01/69'); out.d2=cyclesDateIn('31/12/69'); out.d3=cyclesDateIn('1/1/2569'); out.d4=cyclesDateIn('2026-01-01'); out.d5=cyclesDateIn('46023');
    out.o1=cyclesDateOut('2026-01-01'); out.o2=cyclesDateOut('2026-12-31'); out.o3=cyclesDateOut('');
    let call=null; window.graphUpsertTableRowPartial=async(t,k,v,vals,prot)=>{ call={t,k,v,vals,prot}; return 'ok'; };
    const res=await pushCycleToExcel({id:'CY-2569',name:'x',year:'2569',start:'2026-01-01',end:'2026-12-31',status:'Closed'});
    out.res=res.ok; out.call=call;
    window.graphListTableRows=async()=>[['CY-2569','2569','01/01/69','31/12/69','อัตโนมัติ (70/80/90)','อัตโนมัติหลังอนุมัติ','Awe HR&GA','Closed']];
    cyclesList=[]; await ms365SyncCyclesList(true);
    out.list=JSON.parse(JSON.stringify(cyclesList));
    out.locked=isCycleLocked('2569');
    return out;
  });
  ok(r.d1==='2026-01-01'&&r.d2==='2026-12-31'&&r.d3==='2026-01-01'&&r.d4==='2026-01-01','อ่านวันที่ dd/mm/yy พ.ศ. + รูปแบบอื่น');
  ok(r.o1==='01/01/69'&&r.o2==='31/12/69'&&r.o3==='','เขียนวันที่เป็น dd/mm/yy พ.ศ.');
  ok(r.res&&r.call.t==='Cycles'&&r.call.vals.length===8&&r.call.vals[1]==='2569'&&r.call.vals[2]==='01/01/69'&&r.call.vals[7]==='Closed','push 8 คอลัมน์ตรงตารางจริง');
  ok(JSON.stringify(r.call.prot)==='[4,5,6]','ไม่เขียนทับ Y:Z Mode/โหมดปล่อยผล/ผู้สร้าง');
  ok(r.list.length===1&&r.list[0].id==='CY-2569'&&r.list[0].year==='2569'&&r.list[0].status==='Closed'&&r.list[0].start==='2026-01-01','sync อ่านตามคอลัมน์จริง');
  ok(r.locked,'sync แล้วรอบที่ Closed ล็อกจริง');
  ok(errs.length===0,'ไม่มี page error '+errs.join('|'));
  await b.close(); done();
})();
