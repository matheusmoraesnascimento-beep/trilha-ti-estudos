import { SUPABASE_URL as URL_, SUPABASE_PUBLISHABLE_KEY as KEY } from '../config.js';
import { STUDY_SEED } from '../data.js';
import { execFileSync } from 'node:child_process';
import { buildImportPlan, withGeneratedReviews } from '../src/migration.js';

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' };

// curl em vez de fetch: respeita o proxy do ambiente.
function post(table, rows, onConflict) {
  const args = ['-sS', '-w', '\n%{http_code}', '-X', 'POST', `${URL_}/rest/v1/${table}?on_conflict=${onConflict}`, '--data-binary', '@-'];
  for (const [k, v] of Object.entries(H)) args.push('-H', `${k}: ${v}`);
  const res = execFileSync('curl', args, { input: JSON.stringify(rows), encoding: 'utf8' });
  const i = res.lastIndexOf('\n');
  if (!res.slice(i + 1).startsWith('2')) throw new Error(`${table}: ${res}`);
  return JSON.parse(res.slice(0, i));
}

async function upsert(table, rows, onConflict) {
  const out = [];
  for (let i = 0; i < rows.length; i += 100) out.push(...post(table, rows.slice(i, i + 100), onConflict));
  return out;
}

const { seed, generated, skipped } = withGeneratedReviews(STUDY_SEED);
console.log(`revisões geradas: ${generated.length}; etapas não criadas (sem dia antes da prova): ${skipped.length}`);
const plan = buildImportPlan(seed, null);
if (plan.problems.length) throw new Error(plan.problems.join('; '));
const exams = await upsert('exams', plan.exams, 'user_id,name');
const subjects = await upsert('subjects', plan.subjects.map((name) => ({ name })), 'user_id,name');
const ex = new Map(exams.map((e) => [e.name, e.id]));
const sj = new Map(subjects.map((s) => [s.name, s.id]));
const row = (t) => ({ source_legacy_id: t.source_legacy_id, date: t.date, title: t.title, content: t.content ?? '', instructions: t.instructions ?? '', kind: t.kind, status: t.status,
  planned_minutes: t.planned_minutes, actual_minutes: t.actual_minutes, result_notes: t.result_notes ?? '', exam_id: ex.get(t.exam) ?? null, subject_id: sj.get(t.subject) ?? null });
const base = await upsert('tasks', plan.tasks.map(row), 'user_id,source_legacy_id');
const id = new Map(base.map((t) => [t.source_legacy_id, t.id]));
const rev = await upsert('tasks', plan.reviews.map((r) => ({ ...row({ ...r, kind: 'review', content: '' }), kind: 'review', review_stage: r.review_stage, source_task_id: id.get(r.of) })), 'user_id,source_legacy_id');
console.log(`exams=${exams.length} subjects=${subjects.length} tasks=${base.length} reviews=${rev.length}`);
