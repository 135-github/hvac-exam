// Optional browser regression: install Playwright, then node tests/browser.cjs.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const prefix = '/hvac-exam/';
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  if (!pathname.startsWith(prefix)) { res.writeHead(404); return res.end(); }
  let file = path.resolve(root, pathname.slice(prefix.length));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'};
  res.setHeader('Content-Type', (types[path.extname(file)] || 'text/plain') + ';charset=utf-8');
  res.end(fs.readFileSync(file));
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
    const base = `http://127.0.0.1:${server.address().port}/hvac-exam/`;
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let total = 0;
    for (const [dir, key] of [['','hvac-memory-v2'],['electric/','electric-memory-v1']]) {
      await page.goto(base + dir);
      for (const width of [320,390,1280]) {
        await page.setViewportSize({width,height:844});
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      const questions = await page.evaluate(() => window.BANK.qs);
      for (const q of questions.filter(q => q.key)) {
        await page.evaluate(id => start([id], '判分检查'), q.id);
        for (const letter of q.key) await page.locator(`.option[data-key="${letter}"]`).click();
        await page.getByRole('button', {name:'提交答案',exact:true}).click();
        assert.match(await page.locator('#feedback h3').innerText(), /答对了/);
        total++;
      }
      await page.evaluate(() => start([0], '助记检查'));
      await page.locator('#peek').click();
      await page.locator('.mnemonic-editor summary').click();
      const personal = `${dir || 'hvac'} 我的画面 <b>是文字</b>`;
      await page.locator('#my-mnemonic').fill(personal);
      assert.equal(await page.locator('#feedback .memory p').innerText(), personal);
      assert.equal(await page.locator('#feedback .memory b').count(), 0);
      await page.reload();await page.locator('#resume').click();
      assert.equal(await page.locator('#feedback .memory p').innerText(), personal);
      const backup = await page.evaluate(key => ({format:key,...JSON.parse(localStorage.getItem(key))}), key);
      await page.locator('.mnemonic-editor summary').click();await page.locator('#my-mnemonic').fill('');
      assert.equal(await page.locator('#feedback .memory p').innerText(), questions[0].cue);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#restore').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
      await page.waitForFunction(({key,personal}) => JSON.parse(localStorage.getItem(key)).records[0].mnemonic === personal, {key,personal});
    }
    assert.deepEqual(errors, []);
    console.log(`Passed: ${total} objective answers, both banks, mobile layouts, personal mnemonics, resume, backup import and safe text rendering.`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
