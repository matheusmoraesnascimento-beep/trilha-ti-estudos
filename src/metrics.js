import { weekStart } from './dates.js';

export function accuracy(correct, questions) {
  return questions > 0 ? Math.round((correct / questions) * 1000) / 10 : null;
}

export function validateAttempt({ questions, correct }) {
  if (!Number.isInteger(questions) || questions <= 0) return 'Questões deve ser inteiro maior que 0';
  if (!Number.isInteger(correct) || correct < 0 || correct > questions) return 'Acertos deve estar entre 0 e o total de questões';
  return null;
}

export function summarizeAttempts(attempts, keyFn) {
  const m = new Map();
  for (const a of attempts) {
    const k = keyFn(a) ?? '—';
    const c = m.get(k) ?? { key: k, questions: 0, correct: 0 };
    c.questions += a.questions;
    c.correct += a.correct;
    m.set(k, c);
  }
  return [...m.values()].map((c) => ({ ...c, wrong: c.questions - c.correct, rate: accuracy(c.correct, c.questions) }));
}

export function hoursByWeek(tasks) {
  const m = new Map();
  for (const t of tasks) {
    const w = weekStart(t.date);
    const c = m.get(w) ?? { week: w, planned: 0, actual: 0 };
    c.planned += t.planned_minutes || 0;
    c.actual += t.actual_minutes || 0;
    m.set(w, c);
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export function minutesByExam(tasks) {
  const m = new Map();
  for (const t of tasks) m.set(t.exam_id ?? null, (m.get(t.exam_id ?? null) ?? 0) + (t.actual_minutes || 0));
  return m;
}

export function statusCounts(tasks, today) {
  const r = { done: 0, pending: 0, overdue: 0 };
  for (const t of tasks) {
    if (t.status === 'done') r.done++;
    else if (t.date < today) r.overdue++;
    else r.pending++;
  }
  return r;
}

export function hardestSubjects(tasks, subjectName, limit = 5) {
  const m = new Map();
  for (const t of tasks.filter((x) => x.difficulty === 'hard')) {
    const k = subjectName(t.subject_id);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function recurringErrors(notes, subjectName) {
  const m = new Map();
  for (const n of notes.filter((x) => x.note_type === 'error' && !x.mastered)) {
    const k = subjectName(n.subject_id);
    m.set(k, [...(m.get(k) ?? []), n]);
  }
  return [...m].sort((a, b) => b[1].length - a[1].length);
}
