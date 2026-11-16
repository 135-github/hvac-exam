const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);if(!u.startsWith('/hvac-exam/')){res.writeHead(404);return res.end();}let p=path.resolve(root,u.slice(11));if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');if(!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'}[path.extname(p)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(p));});
(async()=>{let browser;try{
await new Promise(r=>server.listen(19000+Math.floor(Math.random()*25000),'127.0.0.1',r));
browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
for(const dir of ['','electric/']){
 await page.goto(base+dir);assert.equal(await page.evaluate(()=>data.settings.correctAutoNext),true);
 const questions=await page.evaluate(()=>['单选题','多选题','判断题'].map(t=>qs.find(q=>q.t===t)));
 for(const q of questions){
  await page.evaluate(id=>{data.settings.autoNext=true;start([id,(id+1)%qs.length],'自动下一题测试','answer');},q.id);
  for(const key of q.key)await page.locator('.option').filter({has:page.locator('.option-key',{hasText:key})}).first().tap();
  await page.getByRole('button',{name:'提交答案',exact:true}).tap();
  assert.equal(await page.evaluate(()=>data.session.index),1);assert.equal(await page.evaluate(id=>record(id).seen,q.id),1);
  await page.getByRole('button',{name:'上一题',exact:true}).tap();assert.equal(await page.evaluate(()=>data.session.index),0);assert(await page.locator('#feedback').innerText());
  await page.evaluate(id=>start([id,(id+1)%qs.length],'错题停留','answer'),q.id);
  const wrong=q.o.find(o=>!q.key.includes(o[0]))?.[0];
  if(wrong){await page.locator('.option').filter({has:page.locator('.option-key',{hasText:wrong})}).first().tap();}
  else{await page.locator('.option').first().tap();}
  await page.getByRole('button',{name:'提交答案',exact:true}).tap();assert.equal(await page.evaluate(()=>data.session.index),0);assert.equal(await page.evaluate(()=>currentAnswer().correct),false);
  await page.evaluate(()=>rate('again'));assert.equal(await page.evaluate(()=>data.session.index),0);assert.equal(await page.evaluate(id=>record(id).seen,q.id),2);
 }
 const q=questions[0];await page.evaluate(id=>start([id],'末题小结','answer'),q.id);await page.locator('.option').filter({has:page.locator('.option-key',{hasText:q.key})}).first().tap();await page.getByRole('button',{name:'提交答案',exact:true}).tap();assert.equal(await page.evaluate(()=>data.session.finished),true);
 await page.evaluate(id=>start([id,(id+1)%qs.length],'关闭自动','answer'),q.id);
 await page.click('#study-settings');await page.uncheck('#correct-auto-next');await page.click('#close-study');await page.reload();await page.click('#resume');
 assert.equal(await page.evaluate(()=>data.settings.correctAutoNext),false);
 await page.locator('.option').filter({has:page.locator('.option-key',{hasText:q.key})}).first().tap();await page.getByRole('button',{name:'提交答案',exact:true}).tap();assert.equal(await page.evaluate(()=>data.session.index),0);
 await page.evaluate(id=>{data.settings.correctAutoNext=true;start([id,(id+1)%qs.length],'提示后答对','answer');},q.id);
 await page.click('#hint');await page.locator('.option').filter({has:page.locator('.option-key',{hasText:q.key})}).first().tap();await page.getByRole('button',{name:'提交答案',exact:true}).tap();assert.equal(await page.evaluate(()=>data.session.index),1);assert.equal(await page.evaluate(id=>data.session.answers[id].grade,q.id),'hard');
}
await page.goto(base+'construction/');await page.evaluate(()=>{data.settings.autoNext=true;start([0,1],'自评停留','recall');});await page.click('#peek');await page.getByRole('button',{name:'没记住',exact:false}).tap();assert.equal(await page.evaluate(()=>data.session.index),0);
await page.evaluate(()=>start([0,1],'模糊停留','recall'));await page.click('#peek');await page.getByRole('button',{name:'有点模糊',exact:false}).tap();assert.equal(await page.evaluate(()=>data.session.index),0);
await page.evaluate(()=>start([0,1],'记住前进','recall'));await page.click('#peek');await page.getByRole('button',{name:'记住了',exact:false}).tap();assert.equal(await page.evaluate(()=>data.session.index),1);
assert.deepEqual(errors,[]);console.log('PASS: mobile correct-auto-next for all objective types, wrong-stop, one rating per attempt, previous question review, last-question summary, persisted opt-out, hints retain hard grade, subjective good-only advance.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
