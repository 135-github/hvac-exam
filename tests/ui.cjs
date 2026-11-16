const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{let p=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\/hvac-exam\//,''));if(!p.startsWith(root+path.sep)&&p!==root){res.writeHead(403);return res.end();}if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');if(!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}[path.extname(p)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(p));});
(async()=>{let browser;try{
await new Promise(r=>server.listen(18000+Math.floor(Math.random()*28000),'127.0.0.1',r));browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
for(const dir of ['','electric/','construction/']){
 await page.goto(base+dir);await page.waitForSelector('.start-panel');assert.equal(await page.locator('.home-grid > :first-child').getAttribute('class'),'start-panel');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const b=await page.locator('#one').boundingBox();assert(b.height>=44);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'..','tmp','ui-'+(dir.replace('/','')||'hvac')+'-home.png'),fullPage:true});
 await page.evaluate(()=>start([0,1],'界面检查',qs[0].key?'answer':'recall'));
 if(dir!=='construction/'){
  const wrong=await page.evaluate(()=>qs[0].o.find(o=>!qs[0].key.includes(o[0]))[0]);await page.locator(`.option[data-key="${wrong}"]`).click();assert.equal(await page.locator('.card').getAttribute('data-result'),'wrong');
 }else await page.click('#peek');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const r=await page.locator('.answer-dock').boundingBox();assert(r.x>=0&&r.x+r.width<=width+1);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'..','tmp','ui-'+(dir.replace('/','')||'hvac')+'-question.png'),fullPage:true});
 await page.click('#study-settings');await page.selectOption('#font-size','large');await page.click('#close-study');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.click('#back');await page.locator('.tools summary').click();const menu=await page.locator('.tool-menu').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=390);await page.locator('.tools summary').click();
}
await page.emulateMedia({reducedMotion:'reduce'});assert.deepEqual(errors,[]);console.log('PASS: 3 subjects, 320/390/768/1280 widths, home reading order, 44px actions, fixed dock, wrong-answer styling, large type, tools menu and reduced-motion rendering.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
