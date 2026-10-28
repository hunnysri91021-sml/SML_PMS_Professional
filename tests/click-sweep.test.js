const {open,ok,done}=require('./helpers');
(async()=>{const {b,p,errs}=await open();
 const n=await p.evaluate(()=>{let c=0;document.querySelectorAll('.nav-item[data-pg]').forEach(i=>{i.click();c++});return c});
 await p.waitForTimeout(300);
 const missing=await p.evaluate(()=>{const m=new Set();document.querySelectorAll('[onclick]').forEach(e=>{const f=(e.getAttribute('onclick').match(/^\s*([A-Za-z_$][\w$]*)\s*\(/)||[])[1];if(f&&typeof window[f]!=='function')m.add(f)});return [...m]});
 console.log('nav pages clicked:',n);
 ok(!errs.length,'no page errors: '+errs.join(';')); ok(!missing.length,'all onclick handlers exist '+missing.join(','));
 await b.close(); done();})();
