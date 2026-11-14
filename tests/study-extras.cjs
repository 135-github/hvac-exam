const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');let version='v1',failCache=false;
const server=http.createServer((req,res)=>{
 const prefix='/hvac-exam/',url=decodeURIComponent(req.url.split('?')[0]);
 if(!url.startsWith(prefix)){res.writeHead(404);return res.end();}
 let file=path.resolve(root,url.slice(prefix.length));
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end();}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
 if(failCache&&url.endsWith('/review/electric.html')){res.writeHead(503);return res.end('unavailable');}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'text/plain')+';charset=utf-8');
 const bytes=fs.readFileSync(file);res.end(url.endsWith('/sw.js')?bytes.toString().replace(/const CACHE='[^']+'/, "const CACHE='study-pocket-20261114-"+version+"'"):bytes);
});
const ready=page=>page.waitForFunction(async()=>{
 const r=await navigator.serviceWorker.getRegistration();if(!r?.active)return false;
 const names=await caches.keys();return names.some(n=>n.startsWith('study-pocket-'))&&!!navigator.serviceWorker.controller;
},{},{timeout:30000});
(async()=>{
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(18000+Math.floor(Math.random()*30000),'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'construction/');await ready(page);
  await page.locator('.offline-help-open').click();
  await page.waitForFunction(()=>document.querySelector('#offline-dialog [data-offline-status]').textContent.includes('已备好'));
  await page.locator('#close-offline').click();
  const bank=await page.evaluate(()=>window.BANK.qs);
  // Time suggestions use this subject, prioritize due/weak cards, preserve an active round.
  await page.evaluate(()=>{
   start([0,1],'不要丢的旧进度','recall');currentAnswer().draft='旧草稿';save();
   data.records[27]={seen:1,wrong:true,due:1};save();go('home');
  });
  await page.locator('#time-pocket summary').click();await page.locator('[data-minutes="3"]').click();
  assert.equal(await page.evaluate(()=>data.session.ids[0]),27);
  assert(await page.evaluate(()=>data.pausedSessions.some(s=>s.title==='不要丢的旧进度'&&s.answers[0].draft==='旧草稿')));
  for(const minutes of [3,10,30]){
   const ids=await page.evaluate(m=>StudyExtras.choose(qs,record,m),minutes);
   assert(ids.length>0&&new Set(ids).size===ids.length);assert(ids.every(id=>bank[id]));
  }
  for(const q of bank.filter(q=>q.t==='案例分析')){
   await page.evaluate(id=>start([id],'三步检查','recall'),q.id);
   assert.equal(await page.locator('#case-prompt').count(),1);
   assert.equal(await page.locator('#feedback .study-points').count(),0);
   for(let step=0;step<3;step++){
    await page.locator(`[data-step="${step}"]`).click();
    await page.locator('#draft').fill(`第${q.id}题第${step}步 <img onerror=bad> 草稿`);
    assert.equal(await page.locator('#step-answer li').count(),0);
    await page.locator('#step-reveal').click();assert((await page.locator('#step-answer li').count())>0,`One-tap reveal failed on case ${q.id}, step ${step}`);
    assert.equal(await page.locator('#feedback .study-points').count(),0);
   }
   await page.reload();await page.locator('#resume').click();
   assert.equal(await page.locator('#draft').inputValue(),`第${q.id}题第2步 <img onerror=bad> 草稿`);
   await page.locator('[data-step="0"]').click();assert.equal(await page.locator('#draft').inputValue(),`第${q.id}题第0步 <img onerror=bad> 草稿`);
   await page.locator('#peek').click();assert.equal(await page.locator('.study-points li').count(),q.points.length);
   assert.equal(await page.locator('.case-drafts img').count(),0);
   assert.equal(await page.locator('.case-drafts h4').count(),3);
  }
  // Imported work survives the existing backup format and is rendered as text.
  await page.evaluate(()=>{const backup=JSON.parse(localStorage.getItem(STORAGE));data=normalize(backup);save();});
  await page.locator('#back').click();await page.locator('#resume').click();assert.equal(await page.locator('.case-drafts h4').count(),3);
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  // All 3 sheets contain 3 print sections and return to a stable original question.
  for(const subject of ['hvac','electric','construction']){
   await page.goto(base+'review/'+subject+'.html');assert.equal(await page.locator('.paper').count(),3);assert.equal(await page.locator('.review-item').count(),18);
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   if(process.env.ARTIFACT_DIR)await page.pdf({path:path.join(process.env.ARTIFACT_DIR,subject+'-three-pages.pdf'),printBackground:true,preferCSSPageSize:true});
   const href=await page.locator('.review-item a').first().getAttribute('href');const id=Number(new URL(href,page.url()).searchParams.get('question'))-1;
   await page.locator('.review-item a').first().click();assert.equal(await page.evaluate(()=>data.session.ids[0]),id);
   assert(!page.url().includes('question='));
  }
  // Real browser offline mode: reload, switch subjects, open sheets, keep typed work.
  await page.goto(base+'construction/');await ready(page);await context.setOffline(true);
  await page.reload();await page.locator('#cases-only').click();await page.locator('[data-step="1"]').click();await page.locator('#draft').fill('离线写下的正确做法');
  await page.reload();await page.locator('#resume').click();assert.equal(await page.locator('#draft').inputValue(),'离线写下的正确做法');
  await page.locator('#back').click();await page.locator('.course-switch a').nth(1).click();assert.equal(await page.evaluate(()=>qs.length),180);
  await page.locator('#one').click();await page.locator('#peek').click();assert((await page.locator('#feedback').innerText()).includes('正确答案'));
  await page.locator('#back').click();await page.locator('.course-switch a').first().click();assert.equal(await page.evaluate(()=>qs.length),161);
  await page.goto(base+'review/construction.html');assert.equal(await page.locator('.paper').count(),3);
  await context.setOffline(false);
  if(!process.env.LIVE_BASE){
   // A complete new worker waits; activating it preserves the current draft.
   await page.goto(base+'construction/');await page.locator('#resume').click();
   await page.locator('#draft').fill('更新时保留我');
   version='v2';await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
   await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting);
   assert.equal(await page.locator('#draft').inputValue(),'更新时保留我');
   await page.locator('.tools summary').click();
   await page.locator('.tool-menu [data-update-site]').waitFor({state:'visible'});
   await page.locator('.tool-menu [data-update-site]').click();
   await page.waitForFunction(()=>!!document.getElementById('resume'));
   await page.locator('#resume').click();assert.equal(await page.locator('#draft').inputValue(),'更新时保留我');
   assert.deepEqual(await page.evaluate(()=>caches.keys()),['study-pocket-20261114-v2']);
   // Failed precache must not claim readiness; retry installs all resources.
   failCache=true;const broken=await browser.newContext();const bp=await broken.newPage();await bp.goto(base+'construction/');
   await bp.waitForFunction(()=>document.querySelector('[data-offline-status]')?.textContent.includes('暂未准备好'),{},{timeout:30000});
   assert.equal(await bp.evaluate(()=>navigator.serviceWorker.controller),null);
   failCache=false;await bp.locator('.offline-help-open').click();await bp.locator('#retry-offline').click();await ready(bp);
   await bp.waitForFunction(()=>document.querySelector('#offline-dialog [data-offline-status]').textContent.includes('已备好'));
   await broken.close();
  }
  if(process.env.ARTIFACT_DIR){await page.goto(base+'construction/');await page.setViewportSize({width:390,height:844});await page.locator('#time-pocket summary').click();await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,'pocket-home.png'),fullPage:true});await page.locator('#cases-only').click();await page.locator('#step-reveal').click();await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,'case-steps.png'),fullPage:true});}
  const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const touchPage=await touchContext.newPage();await touchPage.goto(base+'construction/');
  await touchPage.locator('#cases-only').tap();await touchPage.locator('#draft').fill('触屏写完后一次点开');
  await touchPage.locator('#step-reveal').tap();assert((await touchPage.locator('#step-answer li').count())>0);
  await touchContext.close();
  assert.deepEqual(errors,[]);console.log('PASS: time budgets, parked sessions, all 13×3 case stages, imported drafts, 3 printable sheets, real offline cross-subject practice, update and cache-failure recovery.');
  await context.close();
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
