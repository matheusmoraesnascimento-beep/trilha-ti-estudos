import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, weekday, isValidDate, countdown, todayIn, nextStudyDay, prevStudyDay, diffDays } from '../src/dates.js';

test('addDays cruza fim de mês e ano', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
test('weekday e validação', () => {
  assert.equal(weekday('2026-10-19'), 1);
  assert.ok(!isValidDate('2026-02-30'));
  assert.ok(isValidDate('2026-10-19'));
});
test('countdown nunca negativo', () => {
  assert.equal(countdown('2026-12-13', '2026-12-10'), 3);
  assert.equal(countdown('2026-12-13', '2026-12-20'), 0);
  assert.equal(diffDays('2026-10-19', '2026-12-13'), 55);
});
test('todayIn usa fuso America/Sao_Paulo', () => {
  assert.equal(todayIn('America/Sao_Paulo', new Date('2026-10-20T01:30:00Z')), '2026-10-19');
});
test('próximo/anterior dia de estudo pulam fim de semana e feriado', () => {
  assert.equal(nextStudyDay('2026-10-23'), '2026-10-26');
  assert.equal(prevStudyDay('2026-10-26'), '2026-10-23');
  assert.equal(nextStudyDay('2026-10-23', { holidays: ['2026-10-26'] }), '2026-10-27');
});
