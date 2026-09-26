import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkOffer, shareOfferText } from '../model.js';

test('a share message contains only selected help and the volunteer own contact', () => {
  const offer = checkOffer({ province: 'เชียงใหม่', kind: 'relay', contactKind: 'line_id', contactValue: ' demo_id ' });
  const message = shareOfferText(offer);
  assert.match(message, /จังหวัดเชียงใหม่/);
  assert.match(message, /LINE ID: demo_id/);
  assert.match(message, /ยังไม่มีการตรวจตัวตน/);
  assert.match(message, /1784/);
  assert.match(message, /1669/);
});

test('contact input cannot smuggle extra address or links into the public text', () => {
  const base = { province: 'เชียงใหม่', kind: 'relay', contactKind: 'line_id' };
  for (const value of ['demo_id\nบ้านเลขที่ 1', 'demo_id https://example.test', '@helper', '']) {
    assert.throws(() => checkOffer({ ...base, contactValue: value }));
  }
  assert.throws(() => checkOffer({ ...base, province: 'ไม่ใช่จังหวัด' }));
});

test('the immediate help page contains no backend calls, signup or public case intake', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(html, /ไม่ต้องสมัคร/);
  assert.match(html, /ไม่ได้แปลว่ามีใครได้รับข้อความแล้ว/);
  assert.doesNotMatch(html + js, /supabase|signUp|submit_case|claim_case|aid_post|api\.js/);
});
