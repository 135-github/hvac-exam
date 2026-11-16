const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),bank=require('../construction/questions.json');
assert.equal(bank.qs.filter(q=>q.examFocus==='marked').length,84);
assert.equal(bank.qs.filter(q=>q.examFocus==='reference').length,25);
for(const id of [1,14,16,17,37,48,61])assert.equal(bank.qs[id].examFocus,'reference');
for(const id of [21,22,23,24,36,39,51,60,72,76,79])assert.equal(bank.qs[id].examFocus,'marked');
for(const q of bank.qs){assert(q.pageRef&&q.markEvidence);assert(/P\d+|页码待核/.test(q.pageRef));}
assert(!/0.3|0.5m/.test(bank.qs[79].s+bank.qs[79].o.join('')));
assert(!/2.2m|40m|24h/.test(bank.qs[60].exp));
assert.equal(bank.qs[70].key,'AD');assert.equal(bank.qs[76].key,'B');
const server=http.createServer((req,res)=>{
 const u=decodeURIComponent(req.url.split('?')[0]);let p=path.resolve(root,u.replace(/^\/hvac-exam\//,''));
 if(!u.startsWith('/hvac-exam/')||!(p===root||p.startsWith(root+path.sep))){res.writeHead(404);return res.end();}
 if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');
 if(!fs.existsSync(p)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'}[path.extname(p)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(p));
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
 await page.goto(base+'construction/');
 // Give unmarked items high priority too: every default entrance must still exclude them.
 await page.evaluate(()=>{for(const q of qs)data.records[q.id]={seen:1,wrong:true,due:1};save();go('home');});
 const check=async()=>assert(await page.evaluate(()=>data.session.ids.length>0&&data.session.ids.every(id=>qs[id].examFocus==='marked')));
 for(const button of ['textbook-quiz','core-only','numbers-only','one','browse','quick-five','new-materials','exam-cases']){await page.click('#'+button);await check();await page.click('#back');}
 await page.locator('#time-pocket summary').click();await page.locator('[data-minutes="3"]').click();await check();await page.click('#back');
 await page.locator('.free-settings summary').click();await page.click('#choose-all');await check();await page.click('#back');
 await page.evaluate(()=>startSmart());await check();await page.click('#back');
 await page.click('#open-map');assert.equal(await page.locator('.picker-grid button').count(),84);await page.selectOption('#map-filter','reference');assert.equal(await page.locator('.picker-grid button').count(),25);await page.click('#close-picker');
 await page.click('#review-now');assert.equal(await page.locator('.list-item').count(),84);
 await page.selectOption('#focus','reference');assert.equal(await page.locator('.list-item').count(),25);
 await page.getByRole('button',{name:'首页',exact:true}).click();await page.locator('.reference-entry summary').click();await page.click('#reference-only');
 assert.equal(await page.locator('#focus').inputValue(),'reference');assert.equal(await page.locator('.list-item').count(),25);
 for(const q of bank.qs){
  await page.evaluate(id=>start([id],'页码检查','answer'),q.id);
  assert((await page.locator('.question-source').innerText()).includes(q.pageRef));assert.equal(await page.locator('.study-points').count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 // A changed key must reopen the answer, keeping old response, notes and learning records.
 await page.evaluate(()=>{
  const backup=fresh();backup.records[60]={note:'旧笔记保留',star:true,seen:4,right:3};
  backup.session={id:'old',ids:[60,37],index:0,title:'旧练习',mode:'answer',answers:{60:{selected:['A','B','D'],draft:'旧草稿',revealed:true,correct:true,rated:true}}};
  data=normalize(backup);save();renderQuestion();
 });
 assert.deepEqual(await page.evaluate(()=>[data.session.ids,record(60).note,record(60).seen,currentAnswer().draft,currentAnswer().revealed,currentAnswer().previousResponse.selected]),[[60,37],'旧笔记保留',4,'旧草稿',false,['A','B','D']]);
 await page.reload();await page.click('#resume');assert.equal(await page.evaluate(()=>currentAnswer().draft),'旧草稿');
 await page.locator('.option[data-key="A"]').tap();assert.equal(await page.evaluate(()=>data.session.index),1);assert.match(await page.locator('.question-source').innerText(),/参考资料/);
 await page.evaluate(()=>start([44,55],'双选检查','answer'));await page.locator('.option[data-key="A"]').tap();assert.equal(await page.evaluate(()=>data.session.index),0);await page.locator('.option[data-key="B"]').tap();assert.equal(await page.evaluate(()=>data.session.index),1);
 await page.evaluate(()=>start([70,55],'错选停留','answer'));await page.locator('.option[data-key="A"]').tap();await page.locator('.option[data-key="B"]').tap();assert.equal(await page.evaluate(()=>data.session.index),0);assert.match(await page.locator('#feedback').innerText(),/正确答案\s*A、D/);
 if(process.env.ARTIFACT_DIR){await page.evaluate(()=>start([60,35],'页码预览','answer'));await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,'marked-question.png'),fullPage:true});await page.click('#back');await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,'marked-home.png'),fullPage:true});}
 await page.goto(base+'review/construction.html');assert.equal(await page.locator('.paper').count(),3);
 const links=await page.locator('.review-item a').evaluateAll(a=>a.map(x=>new URL(x.href).searchParams.get('question')));assert(links.every(n=>bank.qs[Number(n)-1].examFocus==='marked'));
 await page.emulateMedia({media:'print'});await page.setViewportSize({width:704,height:1000});
 const heights=await page.locator('.paper').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));assert(heights.every(h=>h<1030),'A4 printable heights: '+heights);
 if(process.env.ARTIFACT_DIR)await page.pdf({path:path.join(process.env.ARTIFACT_DIR,'marked-review.pdf'),printBackground:true,preferCSSPageSize:true});
 assert.deepEqual(errors,[]);console.log('PASS: exam-only default entrances; all question page refs before answering; reference access; old records retained; revised-key migration; instant two-choice; wrong-stop; three-page marked-only review.');
 }finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
