import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// Exercise the exact inline code shipped by the free checker, not a copied model.
const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const start = html.indexOf('const VERSION = ');
const end = html.indexOf('/** Confirmed, cell-level edits only.', start);
assert(start >= 0 && end > start, 'free checker analysis code must be present');
const { analyzeCatalog, buildExports, parseCsv } = runInNewContext(
  `${html.slice(start, end)}\n({ analyzeCatalog, buildExports, parseCsv })`,
  { TextEncoder, structuredClone },
);
const has = (report, sku, code) => report.issues.some(item => item.sku === sku && item.code === code);
const records = csv => {
  const parsed = parseCsv(csv);
  return parsed.rows.map(row => Object.fromEntries(parsed.headers.map((header, index) => [header, row.values[index]])));
};

test('nonshipping row stays visible but is held from imported-goods PID findings and supplier requests', () => {
  const csv = [
    'Handle,Variant SKU,Requires shipping,Variant Barcodes,S-PID State',
    'bundle,physical,TRUE,,unknown',
    'bundle,download,FALSE,isbn:9780306406157,confirmed_none',
  ].join('\n');
  const report = analyzeCatalog(csv, { scope: 'in_scope', mapping: { sPidState: 'S-PID State' } });
  assert.equal(report.summary.variants, 2);
  assert.equal(report.summary.shippingScopeHeld, 1);
  assert.equal(report.variants[0].requiresShippingStatus, 'required');
  assert.equal(report.variants[1].requiresShippingStatus, 'not_required');
  assert.equal(report.variants[1].requiresShippingRaw, 'FALSE');
  assert(has(report, 'physical', 'NSPID_MISSING'));
  assert(has(report, 'download', 'SHIPPING_SCOPE_REVIEW'));
  assert(!has(report, 'download', 'NSPID_MISSING'));
  assert(!has(report, 'download', 'SPID_STATE_CONFLICT'));
  assert(!report.issues.some(item => item.sku === 'download' && item.severity === 'missing'));
  const requests = buildExports(report, { only: 'supplierRequestsCsv' }).supplierRequestsCsv;
  assert(requests.includes('physical'));
  assert(!requests.includes('download'));
  const worksheet = records(buildExports(report, { only: 'pidMappingCsv' }).pidMappingCsv);
  assert.equal(worksheet[1].scope, 'unresolved_nonshipping_shopify_flag');
  assert.equal(worksheet[1].scopeSelected, 'in_scope');
  assert.equal(worksheet[1].sPidAbsenceCode, '');
});

test('legacy shipping header works and a corrected TRUE flag restores normal checks', () => {
  const held = analyzeCatalog('Handle,Variant SKU,Variant Requires Shipping\nbook,download,FALSE', { scope: 'in_scope' });
  const active = analyzeCatalog('Handle,Variant SKU,Variant Requires Shipping\nbook,download,TRUE', { scope: 'in_scope' });
  assert.equal(held.summary.shippingScopeHeld, 1);
  assert(!has(held, 'download', 'NSPID_MISSING'));
  assert.equal(active.summary.shippingScopeHeld, 0);
  assert(has(active, 'download', 'NSPID_MISSING'));
});

test('missing, unrecognized, and conflicting shipping flags never silently suppress checks', () => {
  for (const flag of ['', 'FALSE-ish', '0']) {
    const report = analyzeCatalog(`Handle,Variant SKU,Requires shipping\nitem,SKU,${flag}`, { scope: 'in_scope' });
    assert.equal(report.variants[0].requiresShippingStatus, 'unknown');
    assert(has(report, 'SKU', 'NSPID_MISSING'));
  }
  const absent = analyzeCatalog('Handle,Variant SKU\nitem,SKU', { scope: 'in_scope' });
  assert(has(absent, 'SKU', 'NSPID_MISSING'));
  assert.throws(() => analyzeCatalog('Handle,Variant SKU,Requires shipping,Variant Requires Shipping\nitem,SKU,FALSE,FALSE'), /Conflicting shipping requirement columns/);
});

test('public Shopify product CSV sample holds its three e-book rows without suppressing physical products', () => {
  // Public template downloaded 2026-10-07 from https://help.shopify.com/csv/product_template.csv;
  // it is not a native TITANTH store export and cannot prove typed NS-PID behavior.
  const sample = gunzipSync(readFileSync(new URL('./shopify-official-product-template-20261007.csv.gz', import.meta.url))).toString('utf8');
  assert.equal(createHash('sha256').update(sample).digest('hex'), 'f41b9562b9d9d951ff8f8184f7fe24e738304339d3e24104fc5c265fa00d28ff');
  const report = analyzeCatalog(sample, { scope: 'in_scope' });
  assert.equal(report.summary.variants, 16);
  assert.equal(report.summary.shippingScopeHeld, 3);
  for (const sku of ['HRM-EBK-PDF', 'HRM-EBK-AUD', 'HRM-EBK-KND']) {
    assert(has(report, sku, 'SHIPPING_SCOPE_REVIEW'));
    assert(!has(report, sku, 'NSPID_MISSING'));
    assert(!has(report, sku, 'MPID_MISSING'));
    assert(!buildExports(report, { only: 'supplierRequestsCsv' }).supplierRequestsCsv.includes(sku));
  }
  assert(has(report, 'TheBandTShirt-SG', 'NSPID_MISSING'));
});
