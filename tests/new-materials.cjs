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
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
 for(const dir of ['','electric/','construction/']){await page.goto(base+dir);assert.equal(await page.locator('.course-switch a').last().locator('small').innerText(),'84卡 · 69自测');}
 await page.click('#new-materials');const ids=await page.evaluate(()=>data.session.ids);assert.equal(ids.length,59);assert.equal(new Set(ids).size,ids.length);assert(ids.every(id=>bank.qs[id].latestMaterials&&!bank.qs[id].mergedInto));
 await page.evaluate(()=>{data.records[3]={note:'旧照明笔记 <不丢失>',seen:7,star:true};data.records[88]={note:'新题原笔记',seen:2};save();start([88,101],'合并记录','answer');});
 await page.locator('.merged-records summary').click();assert.match(await page.locator('.merged-records').innerText(),/旧照明笔记 <不丢失>/);assert.equal(await page.locator('#note').inputValue(),'新题原笔记');
 await page.reload();assert.deepEqual(await page.evaluate(()=>[record(3).note,record(3).seen,record(88).note]),['旧照明笔记 <不丢失>',7,'新题原笔记']);
 await page.evaluate(()=>start([101,108],'合并后单选','answer'));assert.match(await page.locator('.question-source').innerText(),/第2页.*第3页/);await page.locator('.option[data-key="A"]').tap();assert.equal(await page.evaluate(()=>data.session.index),1);
 await page.evaluate(()=>start([108,101],'三选自动','answer'));for(const key of ['A','B'])await page.locator('.option[data-key="'+key+'"]').tap();assert.equal(await page.evaluate(()=>data.session.index),0);await page.locator('.option[data-key="D"]').tap();assert.equal(await page.evaluate(()=>data.session.index),1);
 await page.evaluate(()=>start([108,101],'错题留页','answer'));for(const key of ['A','B','C'])await page.locator('.option[data-key="'+key+'"]').tap();assert.equal(await page.evaluate(()=>data.session.index),0);assert.match(await page.locator('#feedback').innerText(),/正确答案\s*A、B、D/);
 // New five-answer questions also grade when the required count is reached.
 await page.evaluate(()=>start([67,101],'五选自动','answer'));for(const key of ['A','B','C','D'])await page.locator('.option[data-key="'+key+'"]').tap();assert.equal(await page.evaluate(()=>data.session.index),0);await page.locator('.option[data-key="E"]').tap();assert.equal(await page.evaluate(()=>data.session.index),1);
 for(const q of bank.qs.filter(q=>q.latestMaterials)){await page.evaluate(id=>start([id],'新资料检查','answer'),q.id);assert((await page.locator('.question-source').innerText()).includes(q.pageRef));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.click('#back');if(process.env.ARTIFACT_DIR)await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,'new-materials-home.png'),fullPage:true});
 await page.goto(base+'review/construction-new.html');assert.equal(await page.locator('.paper').count(),3);const links=await page.locator('.review-item a').evaluateAll(nodes=>nodes.map(n=>Number(new URL(n.href).searchParams.get('question'))-1));assert(links.every(id=>bank.qs[id].examFocus==='marked'));
 await page.emulateMedia({media:'print'});await page.setViewportSize({width:704,height:1000});const heights=await page.locator('.paper').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));assert(heights.every(h=>h<1030),'Print overflow '+heights);
 if(process.env.ARTIFACT_DIR)await page.pdf({path:path.join(process.env.ARTIFACT_DIR,'new-materials-review.pdf'),printBackground:true,preferCSSPageSize:true});
 assert.deepEqual(errors,[]);console.log('PASS: 7 source sheets; 15 additions; 6 merged archives; all three course counts; original notes retained; source positions; single/three/five-option auto-next; wrong answer stays; supplement fits three A4 pages.');
 }finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
