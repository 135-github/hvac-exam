const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{
 const url=decodeURIComponent(req.url.split('?')[0]);if(!url.startsWith('/hvac-exam/')){res.writeHead(404);return res.end();}
 let p=path.resolve(root,url.slice(11));if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');if(!fs.existsSync(p)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}[path.extname(p)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(p));
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(18000+Math.floor(Math.random()*28000),'127.0.0.1',r));browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
 const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme);
 const records=()=>page.evaluate(()=>['hvac-memory-v2','electric-memory-v1','construction-memory-v1'].map(k=>localStorage.getItem(k)));
 for(const dir of ['','electric/','construction/']){
  await page.goto(base+dir);await page.waitForSelector('#theme-toggle');assert.equal(await theme(),'voxel');
  await page.evaluate(()=>{start([0,1],'风格切换保留进度','recall');});
  const before=await records(),session=await page.evaluate(()=>JSON.stringify(data.session));
  await page.click('#theme-toggle');assert.equal(await theme(),'simple');assert.deepEqual(await records(),before);assert.equal(await page.evaluate(()=>JSON.stringify(data.session)),session);
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.reload();await page.waitForSelector('#theme-toggle');assert.equal(await theme(),'simple');
  await page.click('#theme-toggle');assert.equal(await theme(),'voxel');
  assert.equal(await page.locator('#nav button').first().evaluate(el=>getComputedStyle(el).borderRadius),'2px');
 }
 await page.goto(base);await page.waitForSelector('#theme-toggle');
 const other=await context.newPage();await other.goto(base+'electric/');await other.waitForSelector('#theme-toggle');
 await page.click('#theme-toggle');await other.waitForFunction(()=>document.documentElement.dataset.theme==='simple');
 await other.goto(base+'construction/');assert.equal(await other.evaluate(()=>document.documentElement.dataset.theme),'simple');await other.close();
 await page.click('#theme-toggle');await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:path.join(root,'..','tmp','voxel-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'..','tmp','voxel-mobile.png'),fullPage:true});
 await page.evaluate(()=>start([0,1],'样式核对','answer'));
 const primary=await page.locator('.answer-dock .primary').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color}));
 assert.equal(primary.bg,'rgb(66, 111, 50)');assert.equal(primary.fg,'rgb(255, 255, 255)');
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active);await page.reload();
 await context.setOffline(true);await page.goto(base+'electric/');await page.waitForSelector('#theme-toggle');assert.equal(await theme(),'voxel');
 assert.equal(await page.locator('.brand-mark').evaluate(el=>getComputedStyle(el).borderRadius),'0px');
 await page.click('#theme-toggle');await page.goto(base+'construction/');assert.equal(await theme(),'simple');await context.setOffline(false);
 const restricted=await browser.newContext();await restricted.addInitScript(()=>{
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  Storage.prototype.getItem=function(k){if(k==='study-pocket-appearance-v1')throw new Error('Unavailable');return get.call(this,k);};
  Storage.prototype.setItem=function(k,v){if(k==='study-pocket-appearance-v1')throw new Error('Unavailable');return set.call(this,k,v);};
 });
 const rp=await restricted.newPage();rp.on('pageerror',e=>errors.push(e.message));await rp.goto(base);await rp.click('#theme-toggle');
 assert.equal(await rp.evaluate(()=>document.documentElement.dataset.theme),'simple');assert((await rp.locator('#toast').innerText()).includes('无法保存偏好'));await restricted.close();
 assert.deepEqual(errors,[]);console.log('PASS: default pixel theme, simple fallback, 3 subjects, unchanged study/session data, reload persistence, cross-tab sync, narrow widths, primary contrast colors, offline theme assets, storage failure feedback.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
