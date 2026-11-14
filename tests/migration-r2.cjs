'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),R1=require('../migration/engine.js');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(root,'migration/manifests/hvac.json'),'utf8'));
assert.equal(hash(R1.canonical(manifest)),'02574c579b257ceb44229c430636e18230230ae40d081a74a4b4df45c3ed3afd');
const bankContext={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'questions.js'),'utf8'),bankContext);
manifest.entries.forEach((e,i)=>assert.equal(hash(R1.canonical(R1.contentFields(bankContext.window.BANK.qs[i]))),e.contentHash));
const fixture={records:{0:{seen:20,right:15,level:2,due:1800000000000,wrong:true,note:'原笔记 <img src=x onerror=window.bad=1>',mnemonic:'个人助记',ratingToken:'t0'},
 1:{seen:2,right:2,star:true,note:'第二条笔记'},999999:{note:'无法映射但必须保留'}},
 session:{id:'active-example',ids:[0,1],index:1,mode:'recall',answers:{0:{selected:['B'],draft:'原草稿',rated:true,ratingToken:'t0',ratingBefore:{seen:19,right:14}}}},
 pausedSessions:[{id:'paused-example',ids:[2,3],index:0,mode:'answer',answers:{2:{selected:[],draft:'暂停草稿'}}}],settings:{font:'large'}};
const raw=JSON.stringify(fixture),other={electric:'{"example":"electric stays exact"}',construction:'{"example":"construction stays exact"}'};
const server=http.createServer((req,res)=>{
 const url=decodeURIComponent(req.url.split('?')[0]),prefix='/hvac-exam/';if(!url.startsWith(prefix)){res.writeHead(404);return res.end();}
 let file=path.resolve(root,url.slice(prefix.length));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'text/plain')+';charset=utf-8');res.end(fs.readFileSync(file));
});
async function seed(page,base){await page.goto(base+'migration/');await page.waitForFunction(()=>typeof PilotStore!=='undefined');await page.evaluate(({raw,other})=>{localStorage.setItem('hvac-memory-v2',raw);localStorage.setItem('electric-memory-v1',other.electric);localStorage.setItem('construction-memory-v1',other.construction);},{raw,other});await page.reload();await page.waitForFunction(()=>document.querySelector('#db-status').textContent.includes('尚无'));}
async function preview(page){await page.click('#read-local');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('预览已生成'));}
async function consent(page){await page.check('#reviewed');await page.check('#understood');}
async function counts(page){return page.evaluate(async()=>{const db=await PilotStore.connect();return new Promise((resolve,reject)=>{const tx=db.transaction(['baseline','sessions','snapshots','quarantine','attempts'],'readonly'),out={};for(const n of ['baseline','sessions','snapshots','quarantine','attempts']){const r=tx.objectStore(n).count();r.onsuccess=()=>out[n]=r.result;}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});});}
async function unchanged(page){assert.deepEqual(await page.evaluate(()=>['hvac-memory-v2','electric-memory-v1','construction-memory-v1'].map(k=>localStorage.getItem(k))),[raw,other.electric,other.construction]);}
async function save(page){await consent(page);await page.click('#save-copy');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('试点副本已保存'));}
async function getPayload(page){return page.evaluate(async raw=>{const m=await(await fetch('./manifests/hvac.json')).json();const sha=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');return {report:await R1.analyze({...JSON.parse(raw),format:'hvac-memory-v2'},m,'02574c579b257ceb44229c430636e18230230ae40d081a74a4b4df45c3ed3afd',sha),rawText:raw,sourceKind:'local-browser',sourceHash:await sha(raw),expectedRevision:(await PilotStore.state()).meta.revision,confirmation:{reviewed:true,understood:true}};},raw);}
(async()=>{let browser;try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(19000+Math.floor(Math.random()*28000),'127.0.0.1',resolve);});
 const base=process.env.LIVE_BASE||`http://127.0.0.1:${server.address().port}/hvac-exam/`;
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await seed(page,base);assert.deepEqual(await counts(page),{baseline:0,sessions:0,snapshots:0,quarantine:0,attempts:0});
 await preview(page);assert.equal(await page.locator('#samples .sample').count(),2);assert.equal(await page.locator('#samples img').count(),0);assert(await page.locator('#save-copy').isDisabled());await unchanged(page);
 assert.deepEqual(await counts(page),{baseline:0,sessions:0,snapshots:0,quarantine:0,attempts:0});
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:390,height:844});
 // Inject a synchronous quota failure after the transaction queued its raw snapshot.
 await page.evaluate(()=>{window.originalAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(v){if(this.name==='baseline')throw new DOMException('test quota','QuotaExceededError');return window.originalAdd.call(this,v);};});
 await consent(page);await page.click('#save-copy');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('未保存'));
 assert.deepEqual(await counts(page),{baseline:0,sessions:0,snapshots:0,quarantine:0,attempts:0});await unchanged(page);
 await page.evaluate(()=>{IDBObjectStore.prototype.add=window.originalAdd;});
 await page.click('#save-copy');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('试点副本已保存'));
 assert.deepEqual(await counts(page),{baseline:2,sessions:2,snapshots:1,quarantine:1,attempts:0});await unchanged(page);
 const first=await page.evaluate(()=>PilotStore.state()),run=first.meta.activeRun;
 const out=await page.evaluate(run=>PilotStore.exportCopy(run),run);
 assert.equal(out.snapshot.rawText,raw);assert.equal(out.baseline[0].qid,'hvac-0001');assert.equal(out.baseline[0].baseline.seen,20);assert.equal(out.sessions.find(s=>s.legacySessionId==='active-example').currentQid,'hvac-0002');
 assert.equal(out.sessions.find(s=>s.legacySessionId==='active-example').answers['hvac-0001'].ratingToken,'t0');assert.equal(out.quarantine[0].rawPayload.note,'无法映射但必须保留');assert.equal(out.learningStorageActive,false);
 const dl=page.waitForEvent('download');await page.click('#export-copy');const download=await dl;assert.equal(JSON.parse(fs.readFileSync(await download.path(),'utf8')).snapshot.id,run);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#db-status').textContent.includes('当前副本'));assert.equal((await page.evaluate(()=>PilotStore.state())).meta.activeRun,run);
 // A stale local preview is blocked when another tab or old app writes.
 await preview(page);await consent(page);const second=await context.newPage();await second.goto(base+'migration/');
 await second.evaluate(()=>localStorage.setItem('hvac-memory-v2',localStorage.getItem('hvac-memory-v2')+' '));
 await page.waitForFunction(()=>!document.querySelector('#source-changed').hidden);assert(await page.locator('#save-copy').isDisabled());
 await second.evaluate(raw=>localStorage.setItem('hvac-memory-v2',raw),raw);await unchanged(page);
 // Two writers with the same expected revision: exactly one atomic copy succeeds.
 const payload=await getPayload(page);
 const results=await Promise.all([page,second].map(p=>p.evaluate(async payload=>{try{return {ok:true,value:await PilotStore.commit(payload)};}catch(e){return {ok:false,error:e.message};}},payload)));
 assert.equal(results.filter(x=>x.ok).length,1);assert(results.find(x=>!x.ok).error.includes('另一个页面'));
 assert.deepEqual(await counts(page),{baseline:4,sessions:4,snapshots:2,quarantine:2,attempts:0});await unchanged(page);
 await page.click('#refresh-state');await page.waitForFunction(()=>!document.querySelector('#rollback').disabled);await page.click('#rollback');await page.click('#confirm-rollback');
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('已撤回'));assert.equal((await page.evaluate(()=>PilotStore.state())).meta.activeRun,run);await unchanged(page);
 await page.click('#rollback');await page.click('#confirm-rollback');await page.waitForFunction(()=>document.querySelector('#db-status').textContent.includes('尚无'));
 assert.equal((await page.evaluate(()=>PilotStore.state())).meta.activeRun,null);assert.equal((await counts(page)).baseline,4);await unchanged(page);
 // Wrong-subject exports cannot be committed; raw data remain downloadable.
 await page.setInputFiles('#backup-file',{name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'electric-memory-v1',records:{0:{note:'other'}}}))});
 await page.waitForFunction(()=>document.querySelector('#quarantine-list').textContent.includes('WRONG_SUBJECT'));await consent(page);assert(await page.locator('#save-copy').isDisabled());
 // Installed offline bundle contains the complete pilot page and registry.
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.waitForFunction(async()=>{const keys=await caches.keys();if(!keys.length)return false;return !!await(await caches.open(keys.find(x=>x.startsWith('study-pocket-')))).match(new URL('./manifests/hvac.json',location.href).href);});
 await context.setOffline(true);await page.reload();await preview(page);assert.equal(await page.locator('#samples .sample').count(),2);await save(page);await unchanged(page);await context.setOffline(false);
 await page.screenshot({path:path.join(root,'..','tmp','r2-pilot-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 // Entry is accessible without exposing implementation in the regular practice flow.
 await page.goto(base);await page.locator('.tools summary').click();await page.click('#migration-pilot');await page.waitForURL('**/migration/');
 console.log('PASS: immutable registry, zero pre-confirm writes, 3 legacy keys byte-identical, complete copy/session/quarantine, transactional failure rollback, concurrent writers, restore checkpoints, source-change blocking, wrong-bank blocking, offline preview/save, safe mobile UI.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
