import test from 'node:test';
import assert from 'node:assert/strict';
import { accuracy, validateAttempt, minutesByExam, statusCounts, summarizeAttempts } from '../src/metrics.js';
import { escapeHtml, csvCell } from '../src/sanitize.js';

test('20 questões e 16 acertos = 80%', () => assert.equal(accuracy(16, 20), 80));
test('sem questões não divide por zero', () => assert.equal(accuracy(0, 0), null));
test('validação de tentativa', () => {
  assert.ok(validateAttempt({ questions: 10, correct: 11 }));
  assert.ok(validateAttempt({ questions: 0, correct: 0 }));
  assert.ok(validateAttempt({ questions: 10, correct: -1 }));
  assert.equal(validateAttempt({ questions: 20, correct: 16 }), null);
});
test('minutos por concurso sem contagem dupla', () => {
  const m = minutesByExam([{ exam_id: 'a', actual_minutes: 60 }, { exam_id: 'a', actual_minutes: 30 }, { exam_id: 'b', actual_minutes: 20 }]);
  assert.equal(m.get('a'), 90);
  assert.equal(m.get('b'), 20);
});
test('contagem de status inclui atrasadas', () => {
  const r = statusCounts([{ status: 'done', date: '2026-10-01' }, { status: 'pending', date: '2026-10-01' }, { status: 'pending', date: '2026-10-30' }], '2026-10-19');
  assert.deepEqual(r, { done: 1, pending: 1, overdue: 1 });
});
test('agrega tentativas por chave', () => {
  const r = summarizeAttempts([{ s: 'x', questions: 10, correct: 5 }, { s: 'x', questions: 10, correct: 10 }], (a) => a.s);
  assert.equal(r[0].rate, 75);
});
test('escape de HTML e injeção de fórmula em CSV', () => {
  assert.equal(escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
});
