const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{
 const url=decodeURIComponent(req.url.split('?')[0]);if(!url.startsWith('/hvac-exam/')){res.writeHead(404);return res.end();}
 let p=path.resolve(root,url.slice(11));if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');if(!fs.existsSync(p)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}[path.extname(p)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(p));
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.LIVE_BASE||'http://127.0.0.1:'+server.address().port+'/hvac-exam/';
 const chooseTheme=async key=>{await page.click('#theme-toggle');await page.click('[data-theme-choice="'+key+'"]');};
 for(const dir of ['','electric/','construction/']){
  await page.goto(base+dir);await page.waitForSelector('.stitch');
  const expected=await page.evaluate(()=>qs.filter(q=>q.examFocus===undefined||q.examFocus==='marked').map(q=>q.id));
  assert.equal(await page.locator('.stitch').count(),expected.length);
  // Seed an active draft, then jump by a non-contiguous stable ID and preserve the original session.
  await page.evaluate(()=>{start([0,1],'原练习','recall');currentAnswer().draft='方块跳转前草稿';data.records[0]={note:'原笔记',seen:3};save();go('home');});
  const target=expected[10];await page.locator('[data-question="'+target+'"]').click();
  assert.equal(await page.evaluate(()=>data.session.ids[data.session.index]),target);assert.deepEqual(await page.evaluate(()=>data.session.ids),expected);
  assert(await page.evaluate(()=>data.pausedSessions.some(s=>s.title==='原练习'&&s.answers[0]?.draft==='方块跳转前草稿')));
  await page.click('#back');await page.locator('.free-settings summary').click();
  const typeOptions=await page.locator('#free-type input').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean));
  await page.locator('#free-type input[value=""]').uncheck();assert.equal(await page.locator('#daily').isDisabled(),true);
  for(const type of typeOptions.slice(0,2))await page.locator('#free-type input').evaluateAll((nodes,value)=>{const n=nodes.find(n=>n.value===value);n.click();},type);
  const types=typeOptions.slice(0,2);const count=await page.evaluate(types=>qs.filter(q=>(q.examFocus===undefined||q.examFocus==='marked')&&types.includes(q.t)).length,types);
  assert.match(await page.locator('#available').innerText(),new RegExp('当前范围 '+count+' 道'));
  await page.locator('#free-unit input[value=""]').uncheck();assert.equal(await page.locator('#daily').isDisabled(),true);
  const selectedUnits=await page.evaluate(types=>[...new Set(qs.filter(q=>(q.examFocus===undefined||q.examFocus==='marked')&&types.includes(q.t)).map(q=>q.u))].slice(0,2),types);
  for(const unit of selectedUnits)await page.locator('#free-unit input').evaluateAll((nodes,value)=>nodes.find(n=>n.value===value).click(),unit);
  const allowed=await page.evaluate(({types,units})=>qs.filter(q=>(q.examFocus===undefined||q.examFocus==='marked')&&types.includes(q.t)&&units.includes(q.u)).map(q=>q.id),{types,units:selectedUnits});
  await page.locator('#free-order input[value="sequence"]').check();await page.locator('#free-mode input[value="answer"]').check();await page.click('#choose-all');
  assert.deepEqual(await page.evaluate(()=>data.session.ids),allowed);assert.equal(await page.evaluate(()=>data.session.mode),'answer');
  await page.reload();await page.locator('.free-settings summary').click();assert.deepEqual(await page.evaluate(()=>data.settings.typeSelections),types);assert.deepEqual(await page.evaluate(()=>data.settings.unitSelections),selectedUnits);
  await page.evaluate(id=>{data=normalize({records:{0:{note:'旧单选设置笔记'}},settings:{unit:qs[id].u,type:qs[id].t}});save();go('home');},expected[0]);
  assert.deepEqual(await page.evaluate(()=>[data.settings.unitSelections,data.settings.typeSelections]),await page.evaluate(id=>[[qs[id].u],[qs[id].t]],expected[0]));assert.equal(await page.evaluate(()=>record(0).note),'旧单选设置笔记');
  for(const theme of ['simple','voxel','battleground']){
   await chooseTheme(theme);const records=await page.evaluate(()=>JSON.stringify(data));
   for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});await page.locator('.free-settings').evaluate(n=>n.open=true);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.click('#theme-toggle');const box=await page.locator('#theme-menu').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);await page.keyboard.press('Escape');}
   assert.equal(await page.evaluate(()=>JSON.stringify(data)),records);
   await page.evaluate(()=>{data.records[0]={wrong:true};go('home');});const weak=await page.locator('[data-question="'+expected[0]+'"]').evaluate(n=>getComputedStyle(n).backgroundColor);const plain=await page.locator('[data-question="'+expected[1]+'"]').evaluate(n=>getComputedStyle(n).backgroundColor);if(expected[0]===0)assert.notEqual(weak,plain);
  }
  await page.reload();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'battleground');
 }
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(root,'..','tmp','battleground-home.png')});
 await page.locator('.free-settings summary').click();await page.locator('.free-settings').screenshot({path:path.join(root,'..','tmp','battleground-filters.png')});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>start([69,101],'战术皮肤检查','answer'));await page.locator('.option[data-key="A"]').click();await page.locator('.option[data-key="B"]').click();await page.locator('.option[data-key="D"]').click();assert.match(await page.locator('#feedback').innerText(),/正确答案/);await page.screenshot({path:path.join(root,'..','tmp','battleground-question.png'),fullPage:true});
 assert.equal(await page.locator('.answer-difference').evaluate(n=>getComputedStyle(n).color),'rgb(255, 197, 168)');
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active);await page.reload();await context.setOffline(true);
 for(const dir of ['','electric/','construction/']){await page.goto(base+dir);await page.waitForSelector('.stitch');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'battleground');assert.equal(await page.locator('.primary').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(242, 202, 85)');}
 await context.setOffline(false);
 assert.deepEqual(errors,[]);console.log('PASS: clickable stable progress IDs; parked drafts; checkbox union/intersection; zero-result state; accurate counts; legacy and multi-selection persistence; three themes across subjects and viewport sizes; offline tactical skin and controls.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
