import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const start = html.indexOf('const key = ');
const end = html.indexOf('\nfunction alias(', start);
assert(start >= 0 && end > start, 'the test must exercise the parser shipped in app.html');
const parseCsv = runInNewContext(`${html.slice(start, end)}\nparseCsv`, { TextEncoder });

test('the shipped script matches its Content Security Policy hash', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(script, 'one inline application script is required');
  const digest = createHash('sha256').update(script).digest('base64');
  assert(html.includes(`script-src 'sha256-${digest}'`));
});

test('25 data rows plus trailing blank lines remain within the free checker limit', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const rows = Array.from({ length: 25 }, (_, i) => `item-${i},sku-${i}`);
    const csv = ['Handle,Variant SKU', ...rows, '', ''].join(newline);
    const parsed = parseCsv(csv, { maxRows: 25 });
    assert.equal(parsed.rows.length, 25);
    assert.equal(parsed.rows.at(-1).values.join(','), 'item-24,sku-24');
    assert.throws(() => parseCsv(['Handle,Variant SKU', ...rows, 'item-25,sku-25'].join(newline), { maxRows: 25 }), /first 25 CSV data rows/);
    assert.throws(() => parseCsv(['Handle,Variant SKU', 'a,A1', '', 'b,B1'].join(newline), { maxRows: 25 }), /has 1 fields; expected 2/);
  }
});
