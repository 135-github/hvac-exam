const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),vm=require('vm'),cp=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const root=path.resolve(__dirname,'..');
const bank=JSON.parse(fs.readFileSync(path.join(root,'construction/questions.json'),'utf8'));
const old=JSON.parse(cp.execFileSync('git',['show','88dac47:construction/questions.json'],{cwd:root,encoding:'utf8'}));
assert.deepEqual(bank.qs.slice(0,35).map(q=>[q.id,q.u,q.s]),old.qs.map(q=>[q.id,q.u,q.s]),'Old IDs and topics must retain notes');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'construction/questions.js'),'utf8'),ctx);assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.BANK)),bank);
assert.equal(bank.qs.filter(q=>q.key).length,bank.meta.objectiveCount);
assert.match(bank.qs[15].exp,/24h/);assert(!/10min|3～5/.test(bank.qs[15].exp));assert.match(bank.qs[15].referencePoints.join(' '),/10min/);
assert.match(bank.qs[14].textbook,/未见P10/);assert.match(bank.qs[21].textbook,/至少15min/);
for(const q of bank.qs){assert(q.textbook);assert(q.cue);assert.equal(q.exp,q.points.join('\n'));if(q.key){assert(q.o.length>=4);assert([...q.key].every(k=>q.o.some(o=>o[0]===k)));assert.equal(new Set(q.key).size,q.key.length);}}
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);if(!u.startsWith('/hvac-exam/')){res.writeHead(404);return res.end();}let p=path.resolve(root,u.slice(11));if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');if(!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'}[path.extname(p)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(p));});
(async()=>{let browser;try{
await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
for(const dir of ['','electric/','construction/']){
 await page.goto(base+dir);assert.equal(await page.evaluate(()=>data.settings.instantAnswer),true);
 const questions=await page.evaluate(()=>[1,2,3,4].map(n=>qs.find(q=>q.key.length===n)).filter(Boolean));
 for(const q of questions){
  await page.evaluate(id=>start([id,(id+1)%qs.length],'点选即判','answer'),q.id);
  const before=await page.evaluate(id=>record(id).seen||0,q.id);
  for(let i=0;i<q.key.length;i++){await page.locator(`.option[data-key="${q.key[i]}"]`).tap();if(i<q.key.length-1){assert.equal(await page.evaluate(()=>data.session.index),0);assert.equal(await page.evaluate(()=>currentAnswer().revealed),false);}}
  assert.equal(await page.evaluate(()=>data.session.index),1);assert.equal(await page.evaluate(id=>record(id).seen,q.id),before+1);
  await page.getByRole('button',{name:'上一题',exact:true}).tap();assert.match(await page.locator('#feedback').innerText(),/答案/);
  const wrong=q.o.find(o=>!q.key.includes(o[0]));
  if(wrong){
   await page.evaluate(id=>start([id,(id+1)%qs.length],'错题停留','answer'),q.id);
   const choices=[wrong[0],...q.key.slice(0,-1)];for(const k of choices)await page.locator(`.option[data-key="${k}"]`).tap();
   assert.equal(await page.evaluate(()=>data.session.index),0);assert.equal(await page.evaluate(()=>currentAnswer().correct),false);assert(await page.locator('#feedback').innerText());
   assert.equal(await page.locator('#options .option:disabled').count(),q.o.length);
  }
 }
 const multi=questions.find(q=>q.key.length>1),single=questions.find(q=>q.key.length===1);
 if(multi){await page.evaluate(id=>start([id],'取消选择','answer'),multi.id);const first=page.locator(`.option[data-key="${multi.key[0]}"]`);await first.tap();await first.tap();assert.equal(await page.evaluate(()=>currentAnswer().selected.length),0);assert.equal(await page.evaluate(()=>currentAnswer().revealed),false);}
 await page.evaluate(id=>start([id],'末题','answer'),single.id);await page.locator(`.option[data-key="${single.key}"]`).tap();assert.equal(await page.evaluate(()=>data.session.finished),true);
 await page.evaluate(id=>start([id,(id+1)%qs.length],'旧按钮重复事件','answer'),single.id);
 await page.evaluate(key=>{const b=document.querySelector(`.option[data-key="${key}"]`);b.click();b.click();},single.key);assert.equal(await page.evaluate(()=>data.session.index),1);assert.equal(await page.evaluate(()=>currentAnswer().selected.length),0);
 await page.evaluate(id=>start([id,(id+1)%qs.length],'提示答对','answer'),single.id);await page.click('#hint');await page.locator(`.option[data-key="${single.key}"]`).tap();assert.equal(await page.evaluate(id=>data.session.answers[id].grade,single.id),'hard');
 await page.evaluate(id=>start([id,(id+1)%qs.length],'关闭点选','answer'),single.id);await page.click('#study-settings');await page.uncheck('#instant-answer');await page.click('#close-study');await page.reload();await page.click('#resume');assert.equal(await page.evaluate(()=>data.settings.instantAnswer),false);
 await page.locator(`.option[data-key="${single.key}"]`).tap();assert.equal(await page.evaluate(()=>currentAnswer().revealed),false);await page.getByRole('button',{name:'提交答案',exact:true}).tap();
 await page.evaluate(()=>{data.settings.instantAnswer=true;save();});
}
await page.goto(base+'construction/');await page.click('#textbook-quiz');assert.equal(await page.evaluate(()=>data.session.ids.length),bank.meta.focusObjectiveCount);assert.equal(await page.evaluate(()=>data.session.mode),'answer');
await page.click('#back');await page.locator('.reference-entry summary').click();await page.click('#cases-only');assert.equal(await page.evaluate(()=>data.session.ids.length),13);
assert.deepEqual(errors,[]);console.log('PASS: instant single/multiple across 3 subjects; wrong-stop; cancellation; stale events; final summary; hints; persistent opt-out; stable original IDs; textbook provenance and synchronized banks.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
