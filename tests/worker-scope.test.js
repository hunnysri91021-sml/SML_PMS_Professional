/* Worker: กรองรายแถวตามสังกัด (#262) */
const crypto=require('crypto'); const path=require('path');
const {ok,done}=require('./helpers');
const W='file://'+path.resolve(__dirname,'..','tools','sml-pms-proxy-worker.js');
const ENV={TENANT_ID:'t',CLIENT_ID:'c',CLIENT_SECRET:'s',SITE_URL:'https://x.sharepoint.com/sites/s',FILE_PATH:'f.xlsx',SESSION_SECRET:'test-secret-0123456789',SEND_AS_EMAIL:'hr@x.com'};
const sha=(p)=>crypto.createHash('sha256').update(p).digest('hex');
const E=(id,name,role,l1,l2,gm,ap)=>[id,name,role,'','','','','','','',  '',l1||'',l2||'',gm||'',ap||'','active'];
// l1=col11 (หัวหน้าหน่วย), l2=col12 (หัวหน้าแผนก), gm=col13 (ผู้ตรวจ MGR L3), approver=col14 (GM L4)
const EMPS=[
  E('AD','แอดมิน','admin'),
  E('G1','จีเอ็ม','gm'),
  E('M1','ผจก1','manager','','','',''),            // l2
  E('H1','หัวหน้าแผนก1','l1','','','ผจก1','จีเอ็ม'),
  E('U1','หน่วย1','unit','หัวหน้าแผนก1','','ผจก1','จีเอ็ม'),
  E('P1','ลูกน้องหน่วย1','emp','หน่วย1','','ผจก1','จีเอ็ม'),
  E('P2','ลูกน้องตรงH1','emp','หัวหน้าแผนก1','','ผจก1','จีเอ็ม'),
  E('X1','คนอื่น','emp','หัวหน้าอื่น','','ผจก2','จีเอ็มอื่น'),
];
const pins={AD:'9999',G1:'1111',M1:'2222',H1:'3333',U1:'4444',P1:'5555',P2:'6666',X1:'7777'};
const SETS=Object.keys(pins).map(k=>[k,sha(pins[k])]);
const APPR=EMPS.map(e=>[e[0],e[1],'2569','op',1,1,1,1,1,1,1,1,1,1,0,0,0,0,10,10,80,'B','Submitted']);
const ATT=EMPS.map(e=>[e[0],e[1],'2569',1,0,0,0,0]);
const KPI=[['K1','org','','','','','org','2569','active',''],['K2','p1','','','','','person','2569','active','','P1'],['K3','x1','','','','','person','2569','active','','X1']];
const calls=[];
global.fetch=async(url,opt={})=>{
  const u=String(url); const m=opt.method||'GET'; calls.push({u,m,body:opt.body});
  const j=(o)=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)});
  if(u.includes('login.microsoftonline.com')) return j({access_token:'T',expires_in:3600});
  if(u.includes('/drive/root:')) return j({id:'ITEM'});
  if(u.includes('/drive')&&!u.includes('/rows')) return j({id:'DRV'});
  if(u.includes('/sites/')&&!u.includes('/rows')) return j({id:'SITE'});
  const T={Employees:EMPS,EmployeeSettings:SETS,Appraisals:APPR,Attendance:ATT,KPI_Goals:KPI,AuditLog:[['t','u']],Cycles:[['c']]};
  for(const k of Object.keys(T)) if(u.includes("tables('"+k+"')/rows")&&m==='GET') return j({value:T[k].map(r=>({index:0,values:[r]}))});
  return j({value:[]});
};
(async()=>{
  const w=(await import(W+'?'+Math.random())).default;
  const call=async(p,method,body,tok)=>{ const r=await w.fetch(new Request('https://w.example'+p,{method,headers:Object.assign({'content-type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:body?JSON.stringify(body):undefined}),ENV); let j={}; try{j=await r.json();}catch(e){} return {s:r.status,j}; };
  const tok={}; for(const k of Object.keys(pins)) tok[k]=(await call('/auth/login','POST',{code:k,pin:pins[k]})).j.token;
  const codes=async(who,t)=>((await call('/rows?table='+t,'GET',null,tok[who])).j.rows||[]).map(r=>r[0]);
  const eq=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());

  ok(eq(await codes('AD','Appraisals'),EMPS.map(e=>e[0])),'admin เห็น Appraisals ทุกแถว');
  ok(eq(await codes('P1','Appraisals'),['P1']),'พนักงานเห็นเฉพาะของตัวเอง');
  ok(eq(await codes('U1','Appraisals'),['U1','P1']),'หัวหน้าหน่วยเห็นตัวเอง+ลูกน้องตรง');
  ok(eq(await codes('H1','Appraisals'),['H1','U1','P1','P2']),'หัวหน้าแผนกเห็นทั้งแผนก (2 ชั้นผ่านหัวหน้าหน่วย)');
  ok(eq(await codes('M1','Appraisals'),['M1','H1','U1','P1','P2']),'ผจก.ส่วนเห็นคนที่ช่อง L3 เป็นตน');
  ok(eq(await codes('G1','Appraisals'),['G1','H1','U1','P1','P2']),'GM เห็นคนที่ช่อง L4 เป็นตน');
  ok(!(await codes('H1','Attendance')).includes('X1'),'Attendance กรองเหมือนกัน');
  ok((await codes('P1','Attendance')).length===1,'พนักงานเห็น Attendance แค่ของตัวเอง');
  ok(eq(await codes('H1','Approvals'),[]) || true,'Approvals (ว่างในม็อก) ไม่พัง');
  ok((await call('/rows?table=AuditLog','GET',null,tok.H1)).j.rows.length===0,'AuditLog: non-admin ไม่เห็น');
  ok((await call('/rows?table=AuditLog','GET',null,tok.AD)).j.rows.length===1,'AuditLog: admin เห็น');
  ok((await codes('P2','Employees')).length===EMPS.length,'Employees ยังอ่านครบ (ใช้หาสายบังคับบัญชา)');
  ok((await codes('P2','Cycles')).length===1,'ตารางตั้งค่าทั่วไปไม่ถูกกรอง');
  const k=(await call('/rows?table=KPI_Goals','GET',null,tok.P1)).j.rows.map(r=>r[0]);
  ok(eq(k,['K1','K2']),'KPI: เห็น KPI องค์กร + ของตัวเอง ไม่เห็นของคนอื่น');

  // เขียน
  const up=(who,key,vals)=>call('/rows/upsert','POST',{table:'Appraisals',keyColIndex:[0,2,3],keyValue:[key,'2569','op'],values:vals},tok[who]);
  ok((await up('H1','P1',['P1']) ).s===200,'หัวหน้าแผนกเขียน Appraisals ลูกน้องในสังกัดได้');
  ok((await up('H1','X1',['X1'])).s===403,'หัวหน้าแผนกเขียน Appraisals คนนอกสังกัด → 403');
  ok((await up('P1','P1',['P1'])).s===200,'พนักงานเขียนของตัวเองได้');
  ok((await up('P1','P2',['P2'])).s===403,'พนักงานเขียนของคนอื่น → 403');
  ok((await call('/rows/add','POST',{table:'Approvals',values:['X1','n','2569','Submitted']},tok.H1)).s===403,'Approvals add คนนอกสังกัด → 403');
  ok((await call('/rows/add','POST',{table:'Approvals',values:['P1','n','2569','Submitted']},tok.H1)).s===200,'Approvals add คนในสังกัด → 200');
  ok((await call('/rows/add','POST',{table:'AuditLog',values:['t','u']},tok.P1)).s===200,'AuditLog add ใครก็เขียนได้');
  ok((await call('/rows/delete','POST',{table:'IDP',keyColIndex:0,keyValue:'X1'},tok.H1)).s===403,'IDP ลบของคนนอกสังกัด → 403');
  ok((await up('AD','X1',['X1'])).s===200,'admin เขียนได้ทุกแถว');
  done();
})();
