// Optional browser test: PLAYWRIGHT_MODULE and BROWSER_CHANNEL can select a local runtime.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const bank=JSON.parse(fs.readFileSync(path.join(root,'construction/questions.json'),'utf8'));
assert.equal(bank.qs.length,80);
assert.equal(bank.qs.filter(q=>+q.u<=15).length,22);
assert.equal(bank.qs.filter(q=>q.t==='案例分析').length,13);
assert.equal(new Set(bank.qs.map(q=>q.u)).size,19);
bank.qs.forEach((q,i)=>{assert.equal(q.id,i);if(i<35)assert.equal(q.key,'');else assert(q.key);assert(q.points.length>=3);assert(q.cue);q.sources.forEach(key=>assert(bank.sources[key]));});
const server=http.createServer((req,res)=>{
  const prefix='/hvac-exam/',url=decodeURIComponent(req.url.split('?')[0]);
  if(!url.startsWith(prefix)){res.writeHead(404);return res.end();}
  let file=path.resolve(root,url.slice(prefix.length));
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end();}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain')+';charset=utf-8');
  res.end(fs.readFileSync(file));
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
  await page.goto(base+'construction/');
  assert.match(await page.locator('main').innerText(),/08:30 — 10:30/);
  assert.equal(await page.locator('.course-switch a').count(),3);
  assert.equal(await page.evaluate(()=>window.BANK.meta.exam),'2026-11-17T08:30:00+08:00');
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`home overflow ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'construction-home.png'),fullPage:true});
  await page.locator('#core-only').click();assert.equal(await page.evaluate(()=>data.session.ids.length),22);
  await page.locator('#back').click();await page.locator('#cases-only').click();assert.equal(await page.evaluate(()=>data.session.ids.length),13);
  await page.locator('#back').click();await page.locator('#numbers-only').click();assert((await page.evaluate(()=>data.session.ids.length))>8);
  for(const q of bank.qs){
   await page.evaluate(id=>start([id],'要点显示检查','recall'),q.id);
   assert.equal(await page.locator('.study-points').count(),0);
   assert.equal(await page.locator('#draft').count(),1);
   await page.getByRole('button',{name:'翻看答案',exact:true}).click();
   assert.equal(await page.locator('.study-points li').count(),q.points.length);
   assert.equal(await page.locator('.study-points li').first().innerText(),q.points[0]);
   assert.equal(await page.locator('.source-links a').count(),q.sources.length);
   assert.equal(await page.evaluate(()=>currentAnswer().correct),undefined);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`card overflow ${q.id}`);
  }
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'construction-card.png'),fullPage:true});
  await page.evaluate(()=>start([25,26],'续学测试','recall'));
  await page.locator('#draft').fill('先列错误，再写条件和正确做法。');
  await page.locator('#back').click();await page.reload();await page.locator('#resume').click();
  assert.equal(await page.locator('#draft').inputValue(),'先列错误，再写条件和正确做法。');
  await page.locator('#peek').click();
  await page.getByRole('button',{name:'没记住',exact:false}).click();
  assert(await page.evaluate(()=>record(25).wrong));
  await page.locator('.recall-note summary').click();await page.locator('#note').fill('我的记忆 <b>原样保留</b>');
  await page.locator('#star').click();await page.locator('.mnemonic-editor summary').click();await page.locator('#my-mnemonic').fill('给电缆铺床，别躺水管下。');
  await page.locator('#back').click();
  await page.getByRole('button',{name:'题库',exact:true}).click();await page.locator('#search').fill('给电缆铺床，别躺水管下');
  assert.equal(await page.locator('.list-item').count(),1);
  const saved=await page.evaluate(()=>localStorage.getItem('construction-memory-v1'));
  await page.goto(base+'electric/');assert.match(await page.locator('main').innerText(),/2026 年 11 月 21 日/);
  assert(!(await page.locator('main').innerText()).includes('日期尚未提供'));
  await page.goto(base);assert.equal(await page.evaluate(()=>window.BANK.qs.length),161);
  await page.locator('.course-switch a').nth(2).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('construction-memory-v1')),saved);
  await page.locator('#resume').click();assert.equal(await page.locator('#note').inputValue(),'我的记忆 <b>原样保留</b>');
  const dateStates=await page.evaluate(()=>{const old=Date.now;const states=['2026-11-16T23:00:00+08:00','2026-11-17T08:29:00+08:00','2026-11-17T08:30:00+08:00','2026-11-17T10:30:00+08:00'].map(v=>{Date.now=()=>new Date(v).getTime();return examState();});Date.now=old;return states;});
  assert.deepEqual(dateStates,['距离考试 1 天','今天考试','考试进行中','本场考试已结束']);
  assert.deepEqual(errors,[]);console.log('PASS: 35 cards + 45 questions, 19 chapters, recall/self-rating, drafts/notes, date boundaries, mobile layout, 3-subject isolation.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
