const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),bank=require('../construction/questions.json');
assert.equal(bank.qs.length,109);assert.equal(bank.meta.focusObjectiveCount,69);assert.equal(bank.meta.focusCount,84);
assert.equal(bank.qs.filter(q=>q.latestMaterials).length,59);
assert.equal(bank.qs.filter(q=>q.mergedInto).length,6);
for(let sheet=1;sheet<=7;sheet++)assert(bank.qs.some(q=>q.supplements?.some(s=>s.sheet===sheet)));
for(const q of bank.qs.filter(q=>q.mergedInto)){assert.equal(q.examFocus,'reference');for(const id of q.mergedInto)assert(bank.qs[id].mergedFrom.includes(q.id));}
assert.equal(bank.qs.filter(q=>q.id>=94&&q.s.includes('插座')).length,1);
assert.deepEqual(bank.qs[101].supplements.map(s=>s.sheet),[2,3]);
assert.match(bank.qs[21].exp,/不少于15min/);assert.match(bank.qs[30].exp,/照明回路不小于6mm/);
assert.match(bank.qs[69].exp,/与教材.*相反/);assert.match(bank.qs[34].exp,/前提不一致/);
const server=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(!u.startsWith('/hvac-exam/')){res.writeHead(404);return res.end();}let p=path.resolve(root,u.slice(11));if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');if(!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(p));});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.LIVE_BASE||'http://127.0.0.1:'+server.address().port+'/hvac-exam/';
 await page.goto(base+'construction/');assert.match(await page.locator('.start-panel .big-start').innerText(),/84.*注记卡/);
 for(const entry of ['core-only','one','quick-five','new-materials','numbers-only']){await page.click('#'+entry);assert.equal(await page.evaluate(()=>data.session.mode),'recall');assert.equal(await page.locator('.option').count(),0);await page.click('#back');}
 await page.click('.stitch[data-question="55"]');assert.equal(await page.evaluate(()=>data.session.ids[data.session.index]),55);assert.equal(await page.evaluate(()=>data.session.mode),'recall');
 for(const q of bank.qs.filter(q=>q.examFocus==='marked')){
  await page.evaluate(id=>start([id],'注记卡核对','recall'),q.id);assert.equal(await page.locator('.card h2').innerText(),q.cardPrompt);assert.equal(await page.locator('.option').count(),0);assert.equal(await page.locator('.study-points').count(),0);
  assert((await page.locator('.question-source').innerText()).includes(q.pageRef));await page.getByRole('button',{name:'展开必背要点',exact:true}).click();
  assert.equal(await page.locator('.answer-comparison').count(),0);assert.equal(await page.locator('.study-points li').count(),q.points.length);assert.equal(await page.evaluate(()=>currentAnswer().correct),undefined);
 }
 await page.evaluate(()=>{data.records[55]={note:'旧笔记：三十、二十、十五、八',mnemonic:'我的弯管口诀'};start([55,56],'连续背诵','recall');});await page.locator('#draft').fill('我先回忆一次');await page.click('#back');await page.reload();await page.click('#resume');assert.equal(await page.locator('#draft').inputValue(),'我先回忆一次');assert.match(await page.locator('#note').inputValue(),/旧笔记/);
 await page.getByRole('button',{name:'展开必背要点',exact:true}).click();assert.equal(await page.locator('#feedback .memory p').innerText(),'我的弯管口诀');await page.getByRole('button',{name:'记住了',exact:false}).click();assert.equal(await page.evaluate(()=>record(55).seen),1);assert.equal(await page.evaluate(()=>currentAnswer().correct),undefined);
 await page.click('#restart-question');assert.equal(await page.evaluate(()=>data.session.mode),'recall');assert.equal(await page.locator('.option').count(),0);
 await page.evaluate(()=>start([55],'直接阅读','read'));assert.equal(await page.locator('.option').count(),0);assert.equal(await page.locator('.answer-comparison').count(),0);assert(await page.locator('.study-points').count());
 for(const theme of ['simple','voxel','battleground']){await page.click('#theme-toggle');await page.click('[data-theme-choice="'+theme+'"]');for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'..','tmp','annotation-card.png'),fullPage:true});
 await page.click('#back');await page.click('#textbook-quiz');assert.equal(await page.evaluate(()=>data.session.mode),'answer');assert.equal(await page.evaluate(()=>data.session.ids.length),69);assert(await page.locator('.option').count());
 const target=await page.evaluate(()=>({id:data.session.ids[0],key:qs[data.session.ids[0]].key}));for(const key of target.key)await page.locator('.option[data-key="'+key+'"]').click();assert.equal(await page.evaluate(()=>data.session.index),1);
 await page.reload();await page.click('#resume');assert.equal(await page.evaluate(()=>data.session.mode),'answer');assert(await page.locator('.option').count());
 assert.deepEqual(errors,[]);console.log('PASS: annotation-first entrances; independent recall prompts; no choice cues or answer letters; all page refs and points; self-rating, drafts, notes and mnemonic retention; three themes; optional instant quiz and old-session continuation.');
 }finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
