import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan, parseAgendaCsv, validateBackup, legacySummary } from '../src/migration.js';
import { STUDY_SEED } from '../data.js';

test('seed: 1 estudo Linux + exatamente 7 revisões', () => {
  const p = buildImportPlan(STUDY_SEED, null);
  assert.equal(p.tasks.length, 1);
  assert.equal(p.reviews.length, 7);
  assert.deepEqual(p.problems, []);
});
test('estado local sobrepõe seed por id, sem duplicar (14 não)', () => {
  const legacy = {
    tasks: { 'linux-base': { status: 'done', questions: 20, correct: 16, actual_minutes: 95 } },
    reviews: [{ id: 'linux-r1', done: true }],
    notes: [{ id: 'n1', title: 'chmod x chown', type: 'error' }],
  };
  const p = buildImportPlan(STUDY_SEED, legacy);
  assert.equal(p.reviews.length, 7);
  assert.equal(p.tasks[0].status, 'done');
  assert.equal(p.reviews.find((r) => r.source_legacy_id === 'linux-r1').status, 'done');
  assert.deepEqual(p.attempts.map((a) => [a.questions, a.correct]), [[20, 16]]);
  assert.equal(p.notes[0].note_type, 'error');
  assert.deepEqual(legacySummary(legacy), { tasks: 1, reviews: 1, notes: 1 });
});
test('plano idêntico em reimportação (ids legados estáveis)', () => {
  assert.deepEqual(buildImportPlan(STUDY_SEED, null), buildImportPlan(STUDY_SEED, null));
});
test('revisão órfã e data inválida viram problemas, não sucesso', () => {
  const p = buildImportPlan({ tasks: [{ id: 'a', date: '2026-02-30', title: 'x' }], reviews: [{ id: 'r', of: 'zz', date: '2026-10-10' }] }, null);
  assert.equal(p.problems.length, 2);
});
test('CSV de agenda', () => {
  const r = parseAgendaCsv('date,exam,subject,title,content,minutes\n2026-10-19,CREMERJ,Linux,"Linux, base",x,120\n2026-13-01,A,B,C,,\n');
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].title, 'Linux, base');
  assert.equal(r.problems.length, 1);
  assert.ok(parseAgendaCsv('a,b\n1,2').problems[0].includes('obrigatórias'));
});
test('validação de backup', () => {
  assert.ok(validateBackup({}));
  assert.equal(validateBackup({ schema_version: 1, exams: [], subjects: [], tasks: [], attempts: [], notes: [] }), null);
});
