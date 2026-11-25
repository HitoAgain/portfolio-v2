// Run: node tests/cert-date.test.mjs
import assert from 'node:assert/strict';
import { findDate } from '../assets/cert-date.js';

const iso = (t) => findDate(t)?.iso ?? null;

assert.equal(iso('ให้ไว้ ณ วันที่ 26 กรกฎาคม พ.ศ. 2569'), '2026-07-26');
assert.equal(iso('ให้ไว้ ณ วันที่ ๒๖ กรกฎาคม พ.ศ. ๒๕๖๙'), '2026-07-26', 'Thai digits');
assert.equal(iso('ให้ ไว้ ณ วัน ที่ 6 ก ัน ย า ย น 25 68'), '2025-09-06', 'OCR spaces inside words and numbers');
assert.equal(iso('วันที่ 3 เดือน มีนาคม พ.ศ. 2567'), '2024-03-03', 'with the word เดือน');
assert.equal(iso('6 ก.ย. 2568'), '2025-09-06', 'abbreviated month');
assert.equal(iso('6 กย 2568'), '2025-09-06', 'abbreviation with dots lost');
assert.equal(iso('Given on 14 August 2026'), '2026-08-14', 'English');
assert.equal(iso('14/08/2569'), '2026-08-14', 'numeric Buddhist year');
assert.equal(iso('แข่งขันวันที่ 1 มกราคม 2569 ให้ไว้ ณ วันที่ 20 มกราคม 2569'), '2026-01-20', 'last date wins');
assert.equal(iso('31 กุมภาพันธ์ 2569'), null, 'impossible day');
assert.equal(iso('เกียรติบัตรนี้ให้ไว้เพื่อแสดงว่า'), null, 'no date');
console.log('cert-date: all tests passed');
