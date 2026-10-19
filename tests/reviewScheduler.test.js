import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestReviews, planSync, extraReviewDate, overflow, suggestRelief } from '../src/reviewScheduler.js';

const base = { startDate: '2026-10-19', examDate: '2026-12-13', weekdays: [1, 2, 3, 4, 5] };

test('Linux: 7 revisões nas datas da especificação', () => {
  const { reviews } = suggestReviews(base);
  assert.deepEqual(reviews.map((r) => r.date), ['2026-10-20', '2026-10-22', '2026-10-26', '2026-11-03', '2026-11-18', '2026-12-03', '2026-12-11']);
  assert.deepEqual(reviews.map((r) => r.stage), ['d1', 'd3', 'd7', 'd15', 'd30', 'd45', 'pre']);
});
test('nenhuma revisão na/depois da prova (prova antecipada)', () => {
  const { reviews } = suggestReviews({ ...base, examDate: '2026-11-10' });
  assert.ok(reviews.every((r) => r.date < '2026-11-10'));
  assert.ok(reviews.length < 7);
});
test('fim de semana vai para dia útil seguinte; colisão é mesclada', () => {
  const { reviews } = suggestReviews({ startDate: '2026-10-23', examDate: '2026-12-20', weekdays: [1, 2, 3, 4, 5] });
  const dates = reviews.map((r) => r.date);
  assert.equal(new Set(dates).size, dates.length);
  assert.ok(reviews.every((r) => ![0, 6].includes(new Date(`${r.date}T00:00:00Z`).getUTCDay())));
});
test('prova logo após estudo: registra motivo ao não criar', () => {
  const { reviews, skipped } = suggestReviews({ ...base, examDate: '2026-10-20' });
  assert.equal(reviews.length, 0);
  assert.ok(skipped.length > 0);
});
test('planSync é idempotente e preserva concluídas', () => {
  const { reviews } = suggestReviews(base);
  const existing = reviews.map((r, i) => ({ id: `r${i}`, review_stage: r.stage, date: r.date, status: i === 0 ? 'done' : 'pending' }));
  const again = planSync(existing, reviews, '2026-10-19');
  assert.equal(again.create.length, 0);
  assert.equal(again.update.length, 0);
  const moved = planSync(existing, suggestReviews({ ...base, examDate: '2026-12-20' }).reviews, '2026-10-19');
  assert.ok(moved.update.every((u) => u.id !== 'r0'));
});
test('revisão extra: <70% ou difícil sem questões; sem duplicar', () => {
  const o = { date: '2026-10-22', examDate: '2026-12-13', weekdays: [1, 2, 3, 4, 5] };
  assert.equal(extraReviewDate({ ...o, percent: 60 }), '2026-10-23');
  assert.equal(extraReviewDate({ ...o, percent: 80 }), null);
  assert.equal(extraReviewDate({ ...o, percent: null, selfRating: 'hard' }), '2026-10-23');
  assert.equal(extraReviewDate({ ...o, percent: 60, existingReviewDates: ['2026-10-23'] }), null);
});
test('excedente diário sinalizado, nunca silencioso', () => {
  const tasks = [
    { id: 'a', date: '2026-10-19', status: 'pending', kind: 'study', planned_minutes: 120 },
    { id: 'b', date: '2026-10-19', status: 'pending', kind: 'review', planned_minutes: 30 },
  ];
  assert.equal(overflow(tasks, '2026-10-19', 120), 30);
  assert.equal(overflow(tasks, '2026-10-20', 120), 0);
  assert.equal(suggestRelief(tasks, '2026-10-19', 120, { weekdays: [1, 2, 3, 4, 5] }).move, 'a');
});
