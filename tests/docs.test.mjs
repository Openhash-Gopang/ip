// 서류 DB와 검색 시험 — 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { buildDocsDb, serialize, ENGINE } from '../scripts/build-docs-index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pat = JSON.parse(read('data/patent.json'));
const db = JSON.parse(read('data/docs.json'));
const CORE = buildDocsDb({ issued: [] });
const win = {}; vm.runInNewContext(read('assets/docs-search.js'), { window: win });
const D = win.NaviPatentDocs, idx = D.createIndex(db);
const titles = (r) => r.map((e) => e.t);

test('서류 DB: data/docs.json 이 patent.json 에서 만든 최신본이다', () => {
  assert.equal(read('data/docs.json'), serialize(buildDocsDb()), 'node scripts/build-docs-index.mjs 를 실행하세요');
});

test('데이터: 8분류 102종, 세부 분야 10개(분야마다 서류 6종·전문가 ID patent-attorney-…)', () => {
  assert.equal(pat.catalog.length, 8);
  assert.equal(pat.catalog.reduce((n, c) => n + c.items.length, 0), 102);
  assert.equal(pat.fields.length, 10);
  for (const f of pat.fields) assert.ok(/^patent-attorney(-[a-z]+)+$/.test(f.id) && f.forms.length === 6, f.id);
  assert.equal(CORE.docs.length, 102 + 60);
  assert.equal(db.fields.length, 10);
  for (const d of db.docs) assert.ok(d.t && d.p && d.pid && d.c, JSON.stringify(d));
  assert.ok(db.docs.some((d) => d.p === 'issued'));
});

test('엔진: 분야 없는 서류는 patent-attorney, 분야별 서류는 그 분야 ID', () => {
  assert.equal(ENGINE, 'patent-attorney');
  assert.equal(db.docs.find((d) => d.t === '특허출원서').pid, 'patent-attorney');
  assert.ok(db.docs.some((d) => d.pid === pat.fields[0].id));
});

test('검색: 서류명·별칭·초성·띄어쓰기', () => {
  assert.equal(titles(D.search(idx, '특허출원서', { limit: 3 }))[0], '특허출원서');
  assert.ok(titles(D.search(idx, '특허 신청', { limit: 8 })).includes('특허출원서'), '별칭');
  assert.ok(titles(D.search(idx, 'ㅌㅎㅊㅇㅅ', { limit: 8 })).includes('특허출원서'), '초성');
  assert.ok(titles(D.search(idx, '특허 출원서', { limit: 8 })).includes('특허출원서'), '띄어쓰기');
  assert.ok(D.search(idx, '의견서', { limit: 8 }).length > 0);
  assert.ok(D.search(idx, '상표', { limit: 8 }).length > 0);
});

test('검색: 목록에 없는 서류는 결과가 없다', () => {
  assert.equal(D.search(idx, '존재하지않는서류명zzz').length, 0);
});

test('검색: 법무·소송 서류는 섞이지 않는다', () => {
  for (const d of db.docs) assert.ok(!/등기신청|소유권이전|지급명령|개인회생/.test(d.t), d.t);
});

test('성능: 색인 위 검색이 1회 5ms 안팎', () => {
  const t0 = Date.now(); for (let i = 0; i < 200; i++) D.search(idx, i % 2 ? '의견서' : '특허출원', { limit: 8 });
  assert.ok((Date.now() - t0) / 200 < 5, '느림');
});
