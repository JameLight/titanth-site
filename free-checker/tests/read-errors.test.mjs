import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('// Turn a file-reading failure');
const end = script.indexOf('const FREE_ROWS=25;', start);
assert(start >= 0 && end > start, 'the test must exercise readProblem as shipped in app.html');
const readProblem = runInNewContext(`${script.slice(start, end)}\nreadProblem`, { label: (en) => en });

test('a file re-saved with semicolons gets a re-export instruction', () => {
  const message = readProblem(new Error('Malformed CSV at line 2: quote inside an unquoted field.'), 'Handle;Title;Variant SKU\nx;"A";S1\n');
  assert.match(message, /semicolons \(;\)/);
  assert.match(message, /Export it again from Shopify/);
});

test('a file that is not UTF-8 says so', () => {
  const e = new TypeError("Failed to execute 'decode' on 'TextDecoder': The encoded data was not valid.");
  assert.match(readProblem(e, ''), /not saved as UTF-8/);
});

test('an empty file, including a byte-order mark alone, is called empty', () => {
  assert.match(readProblem(new Error('CSV is empty. Include a header row.'), ''), /This file is empty/);
  assert.match(readProblem(new Error('CSV is empty. Include a header row.'), '﻿'), /This file is empty/);
});

test('messages already written for the owner pass through, other problems keep their detail', () => {
  const e = new Error('This file has column names but no product rows.'); e.friendly = true;
  assert.equal(readProblem(e, 'Handle,Title\n'), 'This file has column names but no product rows.');
  assert.match(readProblem(new Error('Malformed CSV at line 2: unterminated quoted field.'), 'Handle,Title\n"x,y\n'), /Cannot read this CSV\..*unterminated quoted field/);
});

test('changing the scope before a catalog loads keeps the message', () => {
  assert.match(script, /\$\('scope'\)\.addEventListener\('change',\(\)=>\{if\(text\)invalidate\(\);\}\);/);
});

test('a file over the free checker's 25,000-row parse limit is told to export a smaller set', () => {
  assert.match(readProblem(new Error('CSV exceeds the 25000 data-row limit.'), 'Handle,Title\n'), /more than 25,000 data rows/);
});
