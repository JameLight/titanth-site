import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the analysis code shipped in app.html (everything before the DOM wiring).
const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// The script is one IIFE; take its body up to the DOM wiring and return the engine entry point.
const engine = script.slice(script.indexOf('"use strict";'), script.indexOf('const $ ='));
const analyzeCatalog = runInNewContext(`(() => {${engine}\nreturn analyzeCatalog;})()`, { TextEncoder, structuredClone });

// A real Shopify Product CSV export of an archived test product (21 October 2026).
// Shopify wrote: ean:4006381333931; INT\:9\;X; ns-pid:TEST-MAKER-REF-001
const csv = readFileSync(new URL('./shopify-real-export-nspid-20261021.csv', import.meta.url), 'utf8');

test('the free checker reads the NS-PID that Shopify writes as ns-pid: in a real export', () => {
  const report = analyzeCatalog(csv, { scope: 'in_scope', maxRows: 100 });
  assert.equal(report.variants.length, 1);
  const [variant] = report.variants;
  assert.equal(variant.nsPid, 'TEST-MAKER-REF-001');
  assert.equal(variant.nsPidSource, 'typed_barcode_nspid');
  assert.equal(variant.sPid, '4006381333931');
  assert.equal(variant.sPidType, 'ean');
  // Arrays come from the vm context, so compare their JSON.
  assert.equal(JSON.stringify(variant.barcodes.map(b => b.value)), JSON.stringify(['4006381333931', 'INT:9;X', 'TEST-MAKER-REF-001']));
  assert.equal(report.summary.blockingCount, 0);
  assert.equal(report.summary.reviewCount, 0);
});

test('the free checker no longer stops on a typed NS-PID value', () => {
  assert.doesNotMatch(script, /cannot read Shopify’s typed NS-PID/);
});
