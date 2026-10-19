import { isValidDate } from './dates.js';

export const LEGACY_KEY = 'trilha-ti-2026-v1';
export const SCHEMA_VERSION = 1;

const toList = (c) => (Array.isArray(c) ? c : c && typeof c === 'object' ? Object.entries(c).map(([id, v]) => ({ id, ...v })) : []);
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
const statusOf = (r) => (r.status === 'done' || r.done === true || r.concluido === true ? 'done'
  : ['in_progress', 'postponed', 'pending'].includes(r.status) ? r.status : 'pending');

export function readLegacy(storage) {
  try {
    const raw = storage.getItem(LEGACY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function legacySummary(state) {
  return state ? { tasks: toList(state.tasks).length, reviews: toList(state.reviews).length, notes: toList(state.notes).length } : null;
}

function attemptFrom(legacyId, r) {
  const q = num(r.questions ?? r.questoes);
  const c = num(r.correct ?? r.acertos);
  return q > 0 && c <= q ? { source_legacy_id: `att:${legacyId}`, task_legacy_id: legacyId, questions: q, correct: c } : null;
}

// Mescla seed + estado local (estado local prevalece por id). Não gera cópias: a chave é o id legado.
export function buildImportPlan(seed, legacyState) {
  const tasks = new Map();
  const reviews = new Map();
  const notes = new Map();
  const subjects = new Set();
  const examNames = new Set((seed?.exams ?? []).map((e) => e.name));

  for (const t of seed?.tasks ?? []) tasks.set(t.id, { ...t });
  for (const r of seed?.reviews ?? []) reviews.set(r.id, { ...r });
  for (const t of toList(legacyState?.tasks)) tasks.set(t.id, { ...tasks.get(t.id), ...t });
  for (const r of toList(legacyState?.reviews)) reviews.set(r.id, { ...reviews.get(r.id), ...r });
  for (const n of toList(legacyState?.notes)) notes.set(n.id, n);

  const problems = [];
  const outTasks = [];
  const outReviews = [];
  const attempts = [];

  for (const [id, t] of tasks) {
    if (!isValidDate(t.date)) { problems.push(`tarefa ${id}: data inválida`); continue; }
    if (t.subject) subjects.add(t.subject);
    outTasks.push({
      source_legacy_id: id, date: t.date, exam: t.exam ?? null, subject: t.subject ?? null,
      title: t.title ?? id, content: t.content ?? '', instructions: t.instructions ?? '',
      kind: ['study', 'mock', 'essay'].includes(t.kind) ? t.kind : 'study',
      status: statusOf(t), planned_minutes: num(t.minutes ?? t.planned_minutes ?? 0),
      actual_minutes: num(t.actual_minutes ?? t.horasReais), result_notes: t.notes ?? t.anotacoes ?? '',
    });
    const a = attemptFrom(id, t);
    if (a) attempts.push(a);
  }
  for (const [id, r] of reviews) {
    if (!isValidDate(r.date)) { problems.push(`revisão ${id}: data inválida`); continue; }
    const parent = r.of ?? r.source ?? r.taskId;
    if (!tasks.has(parent)) { problems.push(`revisão ${id}: origem ${parent} inexistente`); continue; }
    outReviews.push({
      source_legacy_id: id, of: parent, review_stage: r.stage ?? null, date: r.date,
      title: r.title ?? `Revisão ${id}`, status: statusOf(r), planned_minutes: num(r.minutes ?? r.planned_minutes),
      actual_minutes: num(r.actual_minutes), exam: tasks.get(parent).exam ?? null, subject: tasks.get(parent).subject ?? null,
    });
    const a = attemptFrom(id, r);
    if (a) attempts.push(a);
  }
  const outNotes = [...notes].map(([id, n]) => ({
    source_legacy_id: id, task_legacy_id: n.taskId ?? null, subject: n.subject ?? null,
    note_type: ['summary', 'error', 'question', 'flashcard', 'general'].includes(n.type) ? n.type : 'general',
    title: n.title ?? 'Nota', body: n.body ?? n.text ?? '', mastered: n.mastered === true,
  }));

  return { exams: seed?.exams ?? [], examNames: [...examNames], subjects: [...subjects], tasks: outTasks, reviews: outReviews, attempts, notes: outNotes, problems };
}

export function parseAgendaCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; if (row.some((c) => c.trim())) rows.push(row); row = [];
    } else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim())) rows.push(row);
  if (!rows.length) return { tasks: [], problems: ['CSV vazio'] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const need = ['date', 'title'];
  const miss = need.filter((n) => col(n) < 0);
  if (miss.length) return { tasks: [], problems: [`colunas obrigatórias ausentes: ${miss.join(', ')}`] };
  const tasks = [];
  const problems = [];
  rows.slice(1).forEach((r, i) => {
    const g = (n) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : '');
    const date = g('date');
    if (!isValidDate(date)) return problems.push(`linha ${i + 2}: data inválida "${date}"`);
    tasks.push({ id: g('id') || `csv-${date}-${i + 1}`, date, exam: g('exam') || null, subject: g('subject') || null, title: g('title'), content: g('content'), minutes: num(g('minutes') || 120) });
  });
  return { tasks, problems };
}

export function validateBackup(json) {
  if (!json || typeof json !== 'object') return 'JSON inválido';
  if (json.schema_version !== SCHEMA_VERSION) return `versão de esquema incompatível (${json.schema_version})`;
  for (const k of ['exams', 'subjects', 'tasks', 'attempts', 'notes']) if (!Array.isArray(json[k])) return `campo ${k} ausente`;
  return null;
}
