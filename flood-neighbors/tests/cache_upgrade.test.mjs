import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('the new flood page shell replaces the previous cached shell', async () => {
  const events = {};
  const keys = new Set(['promjaeng-flood-public-v20', 'promjaeng-flood-public-v21', 'promjaeng-flood-public-v22', 'promjaeng-flood-public-v23', 'promjaeng-flood-public-v24', 'promjaeng-flood-public-v25', 'promjaeng-flood-public-v26', 'promjaeng-flood-public-v27', 'promjaeng-flood-public-v28', 'promjaeng-flood-public-v29', 'promjaeng-flood-public-v30', 'promjaeng-flood-public-v31', 'promjaeng-flood-public-v33', 'unrelated-cache']);
  let shell = [];
  const scope = 'https://example.invalid/flood/';
  const cache = { addAll: async requests => { shell = requests.map(request => request.url); } };
  const sandbox = {
    URL,
    Request: class { constructor(path) { this.url = new URL(path, scope).href; } },
    caches: {
      open: async key => { keys.add(key); return cache; },
      keys: async () => [...keys],
      delete: async key => keys.delete(key)
    },
    self: {
      registration: { scope },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      addEventListener: (name, listener) => { events[name] = listener; }
    }
  };
  vm.runInNewContext(readFileSync(new URL('../../flood/sw.js', import.meta.url), 'utf8'), sandbox);
  let pending;
  events.install({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.ok(shell.includes(`${scope}index.html`));
  assert.ok(shell.includes(`${scope}submission_guard.js`));
  assert.ok(keys.has('promjaeng-flood-public-v34'));
  events.activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(keys.has('promjaeng-flood-public-v20'), false);
  assert.equal(keys.has('promjaeng-flood-public-v21'), false);
  assert.equal(keys.has('promjaeng-flood-public-v22'), false);
  assert.equal(keys.has('promjaeng-flood-public-v23'), false);
  assert.equal(keys.has('promjaeng-flood-public-v24'), false);
  assert.equal(keys.has('promjaeng-flood-public-v25'), false);
  assert.equal(keys.has('promjaeng-flood-public-v26'), false);
  assert.equal(keys.has('promjaeng-flood-public-v27'), false);
  assert.equal(keys.has('promjaeng-flood-public-v28'), false);
  assert.equal(keys.has('promjaeng-flood-public-v29'), false);
  assert.equal(keys.has('promjaeng-flood-public-v30'), false);
  assert.equal(keys.has('promjaeng-flood-public-v31'), false);
  assert.equal(keys.has('promjaeng-flood-public-v33'), false);
  assert.equal(keys.has('unrelated-cache'), true);
});
