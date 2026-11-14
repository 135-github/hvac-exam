// Run with Node.js: node tests/check-data.cjs (no dependencies).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const cases = [
  ['', 161, '4a6328ad5b149ab4b56a81711d0eee80a766a91aaf6efcb315425c32313472e0'],
  ['electric', 180, '84b4e2bb3b92da7f84dcd8d4d2ca056e3be96c72bb6bb633e020b7276d5d4f10']
];
for (const [dir, count, expectedHash] of cases) {
  const bank = JSON.parse(fs.readFileSync(path.join(root, dir, 'questions.json'), 'utf8'));
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, dir, 'questions.js'), 'utf8'), context);
  const browserBank = JSON.parse(JSON.stringify(context.window.BANK));
  const content = q => ({n:q.n,u:q.u,t:q.t,s:q.s,o:q.o,key:q.key});
  // HVAC JSON is the source; its browser bundle also contains IDs and mnemonics.
  assert.deepEqual(browserBank.qs.map(content), bank.qs.map(content), 'Browser questions differ from source');
  if (dir === 'electric') assert.deepEqual(browserBank, bank);
  assert.equal(bank.qs.length, count);
  browserBank.qs.forEach((q, id) => {
    assert.equal(q.id, id, 'Question IDs must remain stable for saved progress');
    assert.equal(typeof q.cue, 'string');
    assert(q.cue.trim().length > 0, 'Missing mnemonic');
    if (q.key) assert([...q.key].every(k => q.o.some(o => o[0] === k)), 'Answer missing from choices');
    if (dir === 'electric') {
      assert.equal(q.verified, true);
      assert(!q.cue.startsWith('答案联想：'), 'Replace placeholder mnemonic');
    }
  });
  // Freeze the original questions and confirmed answers independently of the UI.
  // An intentional content correction must update this fingerprint after review.
  const original = bank.qs.map(q => ({id:q.id,n:q.n,u:q.u,t:q.t,s:q.s,o:q.o,key:q.key}));
  const digest = crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex');
  assert.equal(digest, expectedHash, 'Original question or answer changed: review before updating fingerprint');
  console.log(`${dir || 'hvac'}: ${count} questions, synchronized data, original content preserved`);
}
