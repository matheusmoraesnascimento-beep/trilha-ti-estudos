import { supabase } from './supabaseClient.js';
import { SCHEMA_VERSION } from './migration.js';
import { suggestReviews, planSync, extraReviewDate, DEFAULT_MINUTES } from './reviewScheduler.js';

export const state = { exams: [], subjects: [], tasks: [], attempts: [], notes: [], prefs: null };
const listeners = new Set();
export const status = { value: 'idle', detail: '' };

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setStatus(value, detail = '') { status.value = value; status.detail = detail; listeners.forEach((f) => f()); }

async function run(label, fn) {
  if (!navigator.onLine) { setStatus('offline', 'Sem internet: alteração NÃO foi salva.'); throw new Error('offline'); }
  setStatus('saving');
  try {
    const r = await fn();
    setStatus('saved');
    return r;
  } catch (e) {
    setStatus('error', `${label}: ${e.message ?? e}`);
    throw e;
  }
}

const must = ({ data, error }) => { if (error) throw error; return data; };

export async function loadAll() {
  setStatus('saving', 'Carregando…');
  try {
    const [exams, subjects, tasks, attempts, notes, prefs] = await Promise.all([
      supabase.from('exams').select('*').order('exam_date'),
      supabase.from('subjects').select('*').order('name'),
      supabase.from('tasks').select('*').order('date'),
      supabase.from('attempts').select('*').order('recorded_at'),
      supabase.from('notes').select('*').order('updated_at', { ascending: false }),
      supabase.from('preferences').select('*').maybeSingle(),
    ]);
    Object.assign(state, { exams: must(exams), subjects: must(subjects), tasks: must(tasks), attempts: must(attempts), notes: must(notes), prefs: must(prefs) });
    if (!state.prefs) state.prefs = must(await supabase.from('preferences').upsert({}, { onConflict: 'user_id' }).select().single());
    setStatus('saved');
  } catch (e) {
    setStatus('error', `Falha ao carregar: ${e.message ?? e}`);
    throw e;
  }
}

export const opts = () => ({ weekdays: state.prefs?.study_weekdays ?? [1, 2, 3, 4, 5], holidays: state.prefs?.holidays ?? [] });
export const capacity = () => state.prefs?.daily_minutes ?? 120;
export const examName = (id) => state.exams.find((e) => e.id === id)?.name ?? '—';
export const subjectName = (id) => state.subjects.find((s) => s.id === id)?.name ?? '—';

async function upsertRows(table, rows, onConflict) {
  const out = [];
  for (let i = 0; i < rows.length; i += 100) out.push(...must(await supabase.from(table).upsert(rows.slice(i, i + 100), { onConflict }).select()));
  return out;
}

export const savePrefs = (patch) => run('Salvar preferências', async () => {
  state.prefs = must(await supabase.from('preferences').update(patch).eq('user_id', state.prefs.user_id).select().single());
});

export const saveExam = (e) => run('Salvar concurso', async () => {
  const row = must(await supabase.from('exams').upsert(e, { onConflict: e.id ? 'id' : 'user_id,name' }).select().single());
  state.exams = [...state.exams.filter((x) => x.id !== row.id), row].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  return row;
});

export async function ensureSubject(name) {
  if (!name) return null;
  const found = state.subjects.find((s) => s.name === name);
  if (found) return found.id;
  return run('Salvar disciplina', async () => {
    const row = must(await supabase.from('subjects').upsert({ name }, { onConflict: 'user_id,name' }).select().single());
    state.subjects = [...state.subjects, row].sort((a, b) => a.name.localeCompare(b.name));
    return row.id;
  });
}

export const saveTask = (t) => run('Salvar atividade', async () => {
  const row = must(await supabase.from('tasks').upsert(t, { onConflict: 'id' }).select().single());
  state.tasks = [...state.tasks.filter((x) => x.id !== row.id), row].sort((a, b) => a.date.localeCompare(b.date));
  return row;
});

export const deleteTask = (id) => run('Excluir atividade', async () => {
  must(await supabase.from('tasks').delete().eq('id', id));
  state.tasks = state.tasks.filter((t) => t.id !== id && t.source_task_id !== id);
  state.attempts = state.attempts.filter((a) => a.task_id !== id);
});

export const postponeTasks = (ids, date) => run('Reagendar', async () => {
  const rows = must(await supabase.from('tasks').update({ date, status: 'pending' }).in('id', ids).select());
  const map = new Map(rows.map((r) => [r.id, r]));
  state.tasks = state.tasks.map((t) => map.get(t.id) ?? t);
});

export const saveAttempt = (a) => run('Salvar questões', async () => {
  const row = must(await supabase.from('attempts').insert(a).select().single());
  state.attempts = [...state.attempts, row];
});

export const saveNote = (n) => run('Salvar nota', async () => {
  const row = must(await supabase.from('notes').upsert(n, { onConflict: 'id' }).select().single());
  state.notes = [row, ...state.notes.filter((x) => x.id !== row.id)];
});

export const deleteNote = (id) => run('Excluir nota', async () => {
  must(await supabase.from('notes').delete().eq('id', id));
  state.notes = state.notes.filter((n) => n.id !== id);
});

async function insertReviews(parent, suggestions) {
  const rows = suggestions.map((s) => ({
    kind: 'review', source_task_id: parent.id, exam_id: parent.exam_id, subject_id: parent.subject_id, date: s.date,
    review_stage: s.stage, title: `Revisão ${s.stage === 'pre' ? 'pré-prova' : s.stage.toUpperCase().replace('D', 'D+')}: ${parent.title}`,
    planned_minutes: DEFAULT_MINUTES[s.stage] ?? 20, status: 'pending',
  }));
  for (const r of rows) {
    const { data, error } = await supabase.from('tasks').insert(r).select().single();
    if (error && error.code !== '23505') throw error;
    if (data) state.tasks = [...state.tasks, data];
  }
  state.tasks.sort((a, b) => a.date.localeCompare(b.date));
  return rows.length;
}

export async function syncReviews(parentId) {
  const parent = state.tasks.find((t) => t.id === parentId);
  const exam = state.exams.find((e) => e.id === parent?.exam_id);
  if (!parent || parent.kind === 'review' || !exam) return { created: 0, reason: 'sem concurso vinculado' };
  const { reviews, skipped } = suggestReviews({ startDate: parent.date, examDate: exam.exam_date, weekdays: opts().weekdays, holidays: opts().holidays });
  const existing = state.tasks.filter((t) => t.source_task_id === parentId && t.kind === 'review');
  const plan = planSync(existing, reviews, parent.date);
  return run('Gerar revisões', async () => {
    const created = await insertReviews(parent, plan.create);
    for (const u of plan.update) await saveTaskQuiet({ id: u.id, date: u.date });
    return { created, moved: plan.update.length, skipped };
  });
}

async function saveTaskQuiet(patch) {
  const row = must(await supabase.from('tasks').update({ date: patch.date }).eq('id', patch.id).select().single());
  state.tasks = state.tasks.map((t) => (t.id === row.id ? row : t));
}

export async function completeTask(task, { actual_minutes, questions, correct, difficulty, result_notes }) {
  const patch = { status: 'done', actual_minutes, difficulty, result_notes, completed_at: new Date().toISOString() };
  const row = await saveTask({ ...task, ...patch });
  if (questions > 0) await saveAttempt({ task_id: task.id, questions, correct });
  let info = { created: 0, extra: null };
  if (task.kind === 'review') {
    const parentId = task.source_task_id;
    const percent = questions > 0 ? (correct / questions) * 100 : null;
    const exam = state.exams.find((e) => e.id === task.exam_id);
    const date = extraReviewDate({
      percent, selfRating: difficulty, date: task.date > row.date ? task.date : row.date, examDate: exam?.exam_date ?? '9999-12-31', ...opts(),
      existingReviewDates: state.tasks.filter((t) => t.source_task_id === parentId && t.kind === 'review' && t.status !== 'done').map((t) => t.date),
    });
    if (date) {
      const parent = state.tasks.find((t) => t.id === parentId) ?? task;
      await run('Revisão extra', () => insertReviews(parent, [{ stage: `x${date.replaceAll('-', '')}`, date }]));
      info.extra = date;
    }
  } else if (task.kind === 'study') {
    const r = await syncReviews(task.id);
    info.created = r.created;
  }
  return info;
}

export async function importPlan(plan) {
  return run('Importar', async () => {
    const before = new Set(state.tasks.map((t) => t.source_legacy_id).filter(Boolean));
    const examRows = plan.exams.length ? await upsertRows('exams', plan.exams.map((e) => ({ ...e })), 'user_id,name') : [];
    const exMap = new Map([...state.exams, ...examRows].map((e) => [e.name, e.id]));
    const subjRows = plan.subjects.length ? await upsertRows('subjects', plan.subjects.map((name) => ({ name })), 'user_id,name') : [];
    const sMap = new Map([...state.subjects, ...subjRows].map((s) => [s.name, s.id]));
    const toRow = (t) => ({
      source_legacy_id: t.source_legacy_id, date: t.date, title: t.title, content: t.content ?? '', instructions: t.instructions ?? '',
      kind: t.kind, status: t.status, planned_minutes: t.planned_minutes, actual_minutes: t.actual_minutes, result_notes: t.result_notes ?? '',
      exam_id: exMap.get(t.exam) ?? null, subject_id: sMap.get(t.subject) ?? null,
    });
    const base = await upsertRows('tasks', plan.tasks.map(toRow), 'user_id,source_legacy_id');
    const idOf = new Map(base.map((t) => [t.source_legacy_id, t.id]));
    const rev = await upsertRows('tasks', plan.reviews.map((r) => ({
      ...toRow({ ...r, kind: 'review', content: '' }), kind: 'review', review_stage: r.review_stage, source_task_id: idOf.get(r.of),
    })), 'user_id,source_legacy_id');
    for (const r of rev) idOf.set(r.source_legacy_id, r.id);
    const att = plan.attempts.filter((a) => idOf.has(a.task_legacy_id)).map((a) => ({ source_legacy_id: a.source_legacy_id, task_id: idOf.get(a.task_legacy_id), questions: a.questions, correct: a.correct }));
    if (att.length) await upsertRows('attempts', att, 'user_id,source_legacy_id');
    if (plan.notes.length) await upsertRows('notes', plan.notes.map((n) => ({
      source_legacy_id: n.source_legacy_id, note_type: n.note_type, title: n.title, body: n.body, mastered: n.mastered,
      task_id: idOf.get(n.task_legacy_id) ?? null, subject_id: sMap.get(n.subject) ?? null,
    })), 'user_id,source_legacy_id');
    const all = [...base, ...rev];
    await loadAll();
    return { total: all.length, existing: all.filter((t) => before.has(t.source_legacy_id)).length, attempts: att.length, notes: plan.notes.length };
  });
}

export function exportBackup() {
  return { schema_version: SCHEMA_VERSION, exported_at: new Date().toISOString(), exams: state.exams, subjects: state.subjects, tasks: state.tasks, attempts: state.attempts, notes: state.notes, preferences: state.prefs };
}

// Reimportação de backup JSON: upsert por id (idempotente). Só restaura registros do próprio usuário.
export async function restoreBackup(b) {
  return run('Restaurar backup', async () => {
    const uid = state.prefs.user_id;
    const own = (r) => ({ ...r, user_id: uid });
    if (b.exams.length) await upsertRows('exams', b.exams.map(own), 'id');
    if (b.subjects.length) await upsertRows('subjects', b.subjects.map(own), 'id');
    const ordered = [...b.tasks.filter((t) => !t.source_task_id), ...b.tasks.filter((t) => t.source_task_id)];
    if (ordered.length) await upsertRows('tasks', ordered.map(own), 'id');
    if (b.attempts.length) await upsertRows('attempts', b.attempts.map(own), 'id');
    if (b.notes.length) await upsertRows('notes', b.notes.map(own), 'id');
    await loadAll();
  });
}
