const {readdirSync}=require('fs'); const {spawnSync}=require('child_process'); let bad=0;
for(const f of readdirSync(__dirname).filter(f=>f.endsWith('.test.js'))){ console.log('== '+f); const r=spawnSync('node',[__dirname+'/'+f],{stdio:'inherit'}); if(r.status) bad++; }
process.exit(bad?1:0);
