/* Regression: สิทธิ์/การมองเห็นตาม role (CLAUDE.md #72, #90, #188, #189) */
const {open,ok,done}=require('./helpers');
(async()=>{
  const {b,p,errs}=await open();
  const r=await p.evaluate(()=>{
    const out={};
    const find=role=>MASTER_USERS.find(u=>u[2]===role&&u[12]==='active');
    for(const role of ['emp','l2','admin']){
      let u=find(role);
      if(!u){ u=MASTER_USERS[0].slice(); u[0]='T-'+role; u[1]='Test '+role; u[2]=role; u[12]='active'; MASTER_USERS.push(u); }
      CURRENT_SESSION_USER=u; applySession(u);
      const dash=document.querySelector('.nav-item[data-pg="dash"]');
      out[role]={
        roleSelDisabled:document.getElementById('roleSel').disabled,
        dashHidden:getComputedStyle(dash).display==='none',
        reminderHidden:getComputedStyle(document.getElementById('reminderBtn')).display==='none'
      };
    }
    // #189: modal แก้ไขบทบาทมี checkbox ครบทุก permission key
    out.missing=Object.keys(ROLE_PERM_LABELS).filter(k=>!document.getElementById('rp_'+k));
    return out;
  });
  ok(r.emp.roleSelDisabled&&r.l2.roleSelDisabled&&!r.admin.roleSelDisabled,'#72 demo role switch locked for non-admin');
  ok(r.emp.dashHidden&&!r.admin.dashHidden,'#188 dashboard hidden for emp only');
  ok(r.emp.reminderHidden&&r.l2.reminderHidden&&!r.admin.reminderHidden,'#90 reminder button admin-only');
  ok(r.missing.length===0,'#189 all permission checkboxes exist '+r.missing);
  ok(errs.length===0,'no page errors '+errs);
  await b.close(); done();
})();
