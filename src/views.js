import { h, field, download } from './dom.js';
import * as repo from './repository.js';
import { state, examName, subjectName, opts, capacity } from './repository.js';
import { formatBR, formatShort, addDays, nextStudyDay, countdown, weekday, weekStart, isValidDate } from './dates.js';
import { overflow, suggestRelief } from './reviewScheduler.js';
import { accuracy, validateAttempt, summarizeAttempts, hoursByWeek, statusCounts, hardestSubjects, recurringErrors, minutesByExam } from './metrics.js';
import { buildImportPlan, readLegacy, legacySummary, parseAgendaCsv, validateBackup, LEGACY_KEY } from './migration.js';
import { csvCell } from './sanitize.js';
import { STUDY_SEED } from '../data.js';

export const ctx = { today: '', rerender: () => {}, calMode: 'month', calCursor: '', filters: { exam: '', subject: '', kind: '', status: '' }, noteFilter: { q: '', exam: '', subject: '', type: '' } };

const KIND = { study: 'Estudo', review: 'Revisão', mock: 'Simulado', essay: 'Discursiva' };
const STATUS = { pending: 'Pendente', in_progress: 'Em andamento', done: 'Concluído', postponed: 'Adiado' };
const DIFF = { easy: 'Fácil', partial: 'Parcial', hard: 'Difícil' };
const NOTE = { general: 'Geral', summary: 'Resumo', error: 'Erro de questão', question: 'Dúvida', flashcard: 'Comando/flashcard' };
const examClass = (t) => (t.kind === 'review' ? 'rev' : /transpetro/i.test(examName(t.exam_id)) ? 'tp' : /cremerj/i.test(examName(t.exam_id)) ? 'cr' : '');

const dlg = () => document.getElementById('dlg');
export function openDialog(title, body) {
  const d = dlg();
  d.replaceChildren(h('h2', {}, title), body);
  if (!d.open) d.showModal();
}
export const closeDialog = () => dlg().close();

async function guard(fn) {
  try { await fn(); } catch (e) { if (e.message !== 'offline') console.error(e); }
  ctx.rerender();
}

const sel = (items, value, empty) => {
  const s = h('select', {}, empty != null ? h('option', { value: '' }, empty) : null, items.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  return s;
};
const examOptions = () => state.exams.map((e) => [e.id, e.name]);
const subjOptions = () => state.subjects.map((s) => [s.id, s.name]);

function taskCard(t) {
  const late = t.status !== 'done' && t.date < ctx.today;
  const actions = t.status === 'done'
    ? [h('button', { onClick: () => editTaskDialog(t) }, 'Editar')]
    : [
      t.status !== 'in_progress' ? h('button', { onClick: () => guard(() => repo.saveTask({ ...t, status: 'in_progress' })) }, 'Iniciar') : h('span', { class: 'tag warn' }, 'Em andamento'),
      h('button', { class: 'pri', onClick: () => completeDialog(t) }, 'Concluir'),
      h('button', { onClick: () => postponeDialog([t]) }, 'Adiar'),
      h('button', { onClick: () => editTaskDialog(t) }, 'Editar'),
      h('button', { onClick: () => noteDialog({ task_id: t.id, subject_id: t.subject_id }) }, 'Anotação'),
    ];
  return h('article', { class: `card task k-${examClass(t)} ${t.status === 'done' ? 'done' : ''}` },
    h('div', { class: 'row' },
      h('span', { class: `tag ${examClass(t)}` }, t.exam_id ? examName(t.exam_id) : 'Sem concurso'),
      h('span', { class: 'tag' }, KIND[t.kind]), t.subject_id ? h('span', { class: 'tag' }, subjectName(t.subject_id)) : null,
      t.review_stage ? h('span', { class: 'tag rev' }, t.review_stage) : null,
      t.status === 'done' ? h('span', { class: 'tag ok' }, '✓ Concluído') : null,
      late ? h('span', { class: 'tag bad' }, `⚠ Pendente desde ${formatShort(t.date)}`) : null),
    h('strong', {}, t.title),
    t.content ? h('div', { class: 'muted' }, t.content) : null,
    h('div', { class: 'muted' }, `${formatBR(t.date)} · ${t.planned_minutes} min previstos${t.actual_minutes ? ` · ${t.actual_minutes} min reais` : ''}`),
    h('div', { class: 'row', style: 'margin-top:8px' }, actions));
}

export function today() {
  const day = ctx.today;
  const all = state.tasks;
  const overdue = all.filter((t) => t.date < day && t.status !== 'done');
  const todays = all.filter((t) => t.date === day);
  const order = (a, b) => (a.kind === 'review' ? 0 : 1) - (b.kind === 'review' ? 0 : 1);
  const over = overflow(all, day, capacity());
  const done = todays.filter((t) => t.status === 'done');
  const dayAttempts = state.attempts.filter((a) => done.some((t) => t.id === a.task_id));
  const q = dayAttempts.reduce((s, a) => s + a.questions, 0);
  const c = dayAttempts.reduce((s, a) => s + a.correct, 0);
  const upcoming = state.exams.filter((e) => !e.archived && e.exam_date >= day);

  return h('section', {},
    h('h2', {}, `Hoje · ${formatBR(day)} (${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][weekday(day)]})`),
    h('div', { class: 'grid' }, upcoming.length ? upcoming.map((e) => h('div', { class: 'card' }, h('div', { class: 'muted' }, `${e.name}${e.role_name ? ' — ' + e.role_name : ''}`), h('div', { class: 'big' }, `${countdown(e.exam_date, day)} dias`), h('div', { class: 'muted' }, `Prova ${formatBR(e.exam_date)}`)))
      : h('div', { class: 'card muted' }, 'Nenhuma prova futura cadastrada. Adicione em Configurações.')),
    h('div', { class: 'card row' },
      h('div', { class: 'grow' }, h('div', { class: 'muted' }, 'Tempo hoje'), h('strong', {}, `${todays.reduce((s, t) => s + t.planned_minutes, 0)} / ${capacity()} min planejados`),
        h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (todays.reduce((s, t) => s + t.planned_minutes, 0) / capacity()) * 100)}%` }))),
      h('div', {}, h('div', { class: 'muted' }, 'Estudado'), h('strong', {}, `${done.reduce((s, t) => s + t.actual_minutes, 0)} min`)),
      h('div', {}, h('div', { class: 'muted' }, 'Questões'), h('strong', {}, q ? `${c}/${q} (${accuracy(c, q)}%)` : '—'))),
    over ? h('div', { class: 'alert' }, `Plano de hoje excede ${capacity()} min em ${over} min. `,
      (() => { const r = suggestRelief(all, day, capacity(), opts()); return r?.move ? h('button', { onClick: () => postponeDialog([all.find((t) => t.id === r.move)], r.to) }, `Sugestão: adiar "${all.find((t) => t.id === r.move).title}" para ${formatShort(r.to)}`) : 'Redistribua manualmente.'; })()) : null,
    h('div', { class: 'row', style: 'margin-bottom:8px' },
      h('button', { onClick: () => missedDayDialog(overdue.concat(todays.filter((t) => t.status !== 'done'))) }, 'Não consegui estudar hoje'),
      h('button', { onClick: () => editTaskDialog(null, { date: day }) }, '+ Atividade')),
    overdue.length ? [h('h3', {}, `Atrasadas (${overdue.length})`), h('div', { class: 'row', style: 'margin-bottom:8px' }, h('button', { onClick: () => postponeDialog(overdue) }, 'Reagendar todas'), h('span', { class: 'muted' }, 'ou mantenha em atraso')), overdue.map(taskCard)] : null,
    h('h3', {}, 'Revisões e estudo de hoje'),
    todays.length ? todays.sort(order).map(taskCard) : h('p', { class: 'muted' }, state.tasks.length ? 'Você não tem atividade hoje.' : 'Registre o primeiro estudo (ou importe sua agenda em Configurações).'));
}

function completeDialog(t) {
  const am = h('input', { type: 'number', min: 0, value: t.planned_minutes });
  const qs = h('input', { type: 'number', min: 0, value: 0 });
  const ok = h('input', { type: 'number', min: 0, value: 0 });
  const df = sel(Object.entries(DIFF), '', 'Como foi? (opcional)');
  const nt = h('textarea', {});
  const err = h('p', { class: 'alert bad', hidden: true });
  const isRev = t.kind === 'review';
  if (isRev) df.replaceChildren(h('option', { value: '' }, 'Como foi?'), h('option', { value: 'easy' }, 'Lembrei bem'), h('option', { value: 'partial' }, 'Parcial'), h('option', { value: 'hard' }, 'Difícil'));
  openDialog(`Concluir: ${t.title}`, h('form', { onSubmit: (e) => {
    e.preventDefault();
    const q = Number(qs.value), c = Number(ok.value);
    if (q > 0) { const v = validateAttempt({ questions: q, correct: c }); if (v) { err.textContent = v; err.hidden = false; return; } }
    if (Number(am.value) < 0) { err.textContent = 'Duração não pode ser negativa'; err.hidden = false; return; }
    guard(async () => {
      const info = await repo.completeTask(t, { actual_minutes: Number(am.value), questions: q, correct: c, difficulty: df.value || null, result_notes: nt.value });
      closeDialog();
      if (info.created) alert(`${info.created} revisão(ões) agendada(s).`);
      if (info.extra) alert(`Revisão extra curta agendada para ${formatBR(info.extra)}.`);
    });
  } },
  field('Tempo efetivo (min)', am), field('Questões resolvidas', qs), field('Acertos', ok), field('Dificuldade / autoavaliação', df), field('Observações', nt), err,
  h('div', { class: 'row' }, h('button', { class: 'pri', type: 'submit' }, 'Salvar'), h('button', { type: 'button', onClick: closeDialog }, 'Cancelar'))));
}

function postponeDialog(tasks, suggested) {
  const nd = suggested ?? nextStudyDay(ctx.today > tasks[0].date ? ctx.today : tasks[0].date, opts());
  const d = h('input', { type: 'date', value: nd });
  openDialog(`Adiar ${tasks.length > 1 ? tasks.length + ' atividades' : '"' + tasks[0].title + '"'}`, h('form', { onSubmit: (e) => {
    e.preventDefault();
    if (!isValidDate(d.value)) return;
    guard(async () => { await repo.postponeTasks(tasks.map((t) => t.id), d.value); closeDialog(); });
  } },
  field('Nova data (padrão: próximo dia útil)', d),
  overflow([...state.tasks.filter((t) => !tasks.some((x) => x.id === t.id)), ...tasks.map((t) => ({ ...t, date: d.value }))], d.value, capacity()) ? h('p', { class: 'alert' }, 'Esse dia ficará acima da capacidade diária; você decide o que priorizar.') : null,
  h('div', { class: 'row' }, h('button', { class: 'pri', type: 'submit' }, 'Reagendar'), h('button', { type: 'button', onClick: closeDialog }, 'Cancelar'))));
}

function missedDayDialog(tasks) {
  const pend = tasks.filter((t) => t.status !== 'done');
  openDialog('Não consegui estudar hoje', h('div', {},
    h('p', {}, `${pend.length} atividade(s) pendente(s). Nada será marcado como concluído nem apagado.`),
    h('div', { class: 'row' },
      h('button', { class: 'pri', onClick: () => guard(async () => { await repo.postponeTasks(pend.map((t) => t.id), nextStudyDay(ctx.today, opts())); closeDialog(); }) }, 'Reagendar p/ próximo dia útil'),
      h('button', { onClick: () => { closeDialog(); postponeDialog(pend); } }, 'Escolher data'),
      h('button', { onClick: closeDialog }, 'Manter em atraso'))));
}

export function editTaskDialog(t, defaults = {}) {
  const v = t ?? { date: ctx.today, title: '', content: '', instructions: '', kind: 'study', status: 'pending', planned_minutes: 120, actual_minutes: 0, exam_id: null, subject_id: null, ...defaults };
  const date = h('input', { type: 'date', value: v.date, required: true });
  const title = h('input', { value: v.title, required: true });
  const content = h('textarea', {}, v.content ?? '');
  const kind = sel(Object.entries(KIND), v.kind);
  const exam = sel(examOptions(), v.exam_id, 'Sem concurso');
  const subj = h('input', { value: v.subject_id ? subjectName(v.subject_id) : '', list: 'subjs', placeholder: 'Disciplina' });
  const mins = h('input', { type: 'number', min: 0, value: v.planned_minutes });
  const status = sel(Object.entries(STATUS), v.status);
  openDialog(t ? 'Editar atividade' : 'Nova atividade', h('form', { onSubmit: (e) => {
    e.preventDefault();
    if (!isValidDate(date.value) || Number(mins.value) < 0) return;
    guard(async () => {
      const subject_id = await repo.ensureSubject(subj.value.trim());
      const row = { ...(t ?? {}), date: date.value, title: title.value.trim(), content: content.value, kind: t?.kind === 'review' ? 'review' : kind.value, status: status.value, planned_minutes: Number(mins.value), exam_id: exam.value || null, subject_id };
      if (!row.id) delete row.id;
      const saved = await repo.saveTask(row);
      if (!t && saved.kind === 'study' && saved.exam_id && confirm('Gerar revisões D+1…D+45 para essa atividade (ao concluí-la elas são geradas automaticamente)? Cancelar = só ao concluir.')) await repo.syncReviews(saved.id);
      closeDialog();
    });
  } },
  field('Data', date), field('Título', title), field('Conteúdo', content),
  h('div', { class: 'grid' }, field('Tipo', kind), field('Concurso', exam), field('Duração prevista (min)', mins), field('Situação', status)),
  field('Disciplina', subj), h('datalist', { id: 'subjs' }, state.subjects.map((s) => h('option', { value: s.name }))),
  h('div', { class: 'row' }, h('button', { class: 'pri', type: 'submit' }, 'Salvar'), h('button', { type: 'button', onClick: closeDialog }, 'Cancelar'),
    t ? h('button', { type: 'button', class: 'danger', onClick: () => { if (confirm(`Excluir "${t.title}"${t.kind !== 'review' ? ' e suas revisões' : ''}?`)) guard(async () => { await repo.deleteTask(t.id); closeDialog(); }); } }, 'Excluir') : null)));
}

function noteDialog(n = {}) {
  const title = h('input', { value: n.title ?? '', required: true });
  const type = sel(Object.entries(NOTE), n.note_type ?? 'summary');
  const subj = sel(subjOptions(), n.subject_id, 'Sem disciplina');
  const body = h('textarea', {}, n.body ?? '');
  const mastered = h('input', { type: 'checkbox', checked: n.mastered, style: 'width:auto;min-height:0' });
  openDialog(n.id ? 'Editar nota' : 'Nova nota', h('form', { onSubmit: (e) => {
    e.preventDefault();
    const row = { ...n, title: title.value.trim(), note_type: type.value, subject_id: subj.value || null, body: body.value, mastered: mastered.checked };
    if (!row.id) delete row.id;
    guard(async () => { await repo.saveNote(row); closeDialog(); });
  } }, field('Título / conceito', title), field('Categoria', type), field('Disciplina', subj),
  field('Texto (para erro: por que errei, resposta correta, fonte)', body), h('label', {}, h('span', {}, mastered, ' Dominado')),
  h('div', { class: 'row' }, h('button', { class: 'pri', type: 'submit' }, 'Salvar'), h('button', { type: 'button', onClick: closeDialog }, 'Cancelar'))));
}

function filterBar() {
  const f = ctx.filters;
  const mk = (key, items, empty) => { const s = sel(items, f[key], empty); s.addEventListener('change', () => { f[key] = s.value; ctx.rerender(); }); return s; };
  return h('div', { class: 'grid card' }, mk('exam', examOptions(), 'Todos concursos'), mk('subject', subjOptions(), 'Todas disciplinas'), mk('kind', Object.entries(KIND), 'Todos tipos'), mk('status', [...Object.entries(STATUS), ['late', 'Atrasado']], 'Toda situação'));
}
const passes = (t) => { const f = ctx.filters; return (!f.exam || t.exam_id === f.exam) && (!f.subject || t.subject_id === f.subject) && (!f.kind || t.kind === f.kind)
  && (!f.status || (f.status === 'late' ? t.status !== 'done' && t.date < ctx.today : t.status === f.status)); };

export function calendar() {
  const cur = ctx.calCursor || ctx.today;
  const tasks = state.tasks.filter(passes);
  const nav = (n) => h('button', { onClick: () => { ctx.calCursor = ctx.calMode === 'month' ? (() => { const [y, m] = cur.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10); })() : addDays(cur, n * 7); ctx.rerender(); } }, n < 0 ? '◀' : '▶');
  const head = h('div', { class: 'row card' },
    nav(-1), h('strong', { class: 'grow' }, ctx.calMode === 'month' ? new Date(`${cur.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : `Semana de ${formatBR(weekStart(cur))}`), nav(1),
    h('button', { onClick: () => { ctx.calCursor = ''; ctx.rerender(); } }, 'Hoje'),
    ['month', 'week', 'list'].map((m) => h('button', { 'aria-pressed': ctx.calMode === m, class: ctx.calMode === m ? 'pri' : '', onClick: () => { ctx.calMode = m; ctx.rerender(); } }, { month: 'Mês', week: 'Semana', list: 'Agenda' }[m])),
    h('button', { onClick: () => editTaskDialog(null) }, '+ Nova'));
  const chip = (t) => h('button', { class: `chip task k-${examClass(t)}`, title: `${t.title} (${STATUS[t.status]})`, onClick: () => editTaskDialog(t) }, `${t.status === 'done' ? '✓' : t.date < ctx.today ? '!' : '•'} ${t.kind === 'review' ? '↻ ' : ''}${t.title}`);
  const legend = h('p', { class: 'muted' }, h('span', { class: 'tag tp' }, 'Transpetro'), h('span', { class: 'tag cr' }, 'CREMERJ'), h('span', { class: 'tag rev' }, '↻ Revisão'), '✓ concluído · ! atrasado · • pendente');
  let body;
  if (ctx.calMode === 'list') {
    const list = tasks.filter((t) => t.date >= addDays(ctx.today, -30)).slice(0, 200);
    body = list.length ? list.map(taskCard) : h('p', { class: 'muted' }, 'Nada encontrado com esses filtros.');
  } else {
    const first = ctx.calMode === 'month' ? weekStart(`${cur.slice(0, 7)}-01`) : weekStart(cur);
    const weeks = ctx.calMode === 'month' ? 6 : 1;
    const cells = [];
    for (const d of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) cells.push(h('div', { class: 'hd' }, d));
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(first, i);
      cells.push(h('div', { class: `day ${d.slice(0, 7) !== cur.slice(0, 7) && ctx.calMode === 'month' ? 'out' : ''} ${d === ctx.today ? 'today' : ''}` }, h('div', {}, d.slice(8)), tasks.filter((t) => t.date === d).map(chip)));
    }
    body = h('div', { class: 'cal' }, cells);
  }
  return h('section', {}, h('h2', {}, 'Calendário'), filterBar(), head, legend, body);
}

export function reviews() {
  const all = state.tasks.filter((t) => t.kind === 'review');
  const late = all.filter((t) => t.status !== 'done' && t.date < ctx.today);
  const next = all.filter((t) => t.status !== 'done' && t.date >= ctx.today).slice(0, 30);
  const done = all.filter((t) => t.status === 'done').slice(-10).reverse();
  return h('section', {}, h('h2', {}, 'Revisões'),
    h('h3', {}, `Vencidas (${late.length})`), late.length ? late.map(taskCard) : h('p', { class: 'muted' }, 'Nenhuma revisão vencida.'),
    h('h3', {}, 'Próximas'), next.length ? next.map(taskCard) : h('p', { class: 'muted' }, 'Você não tem revisão agendada. Conclua um estudo para gerar as revisões.'),
    h('h3', {}, 'Concluídas recentemente'), done.map(taskCard));
}

export function questions() {
  const task = sel(state.tasks.slice().reverse().slice(0, 100).map((t) => [t.id, `${formatShort(t.date)} · ${t.title}`]), '');
  const q = h('input', { type: 'number', min: 1, required: true });
  const c = h('input', { type: 'number', min: 0, required: true });
  const err = h('p', { class: 'alert bad', hidden: true });
  const taskOf = (id) => state.tasks.find((t) => t.id === id);
  const bySubject = summarizeAttempts(state.attempts, (a) => subjectName(taskOf(a.task_id)?.subject_id));
  const byExam = summarizeAttempts(state.attempts, (a) => examName(taskOf(a.task_id)?.exam_id));
  const tbl = (rows) => h('table', {}, h('tr', {}, ['', 'Questões', 'Acertos', 'Erros', 'Taxa'].map((x) => h('th', {}, x))), rows.map((r) => h('tr', {}, h('td', {}, r.key), h('td', {}, r.questions), h('td', {}, r.correct), h('td', {}, r.wrong), h('td', {}, r.rate == null ? '—' : `${r.rate}%`))));
  return h('section', {}, h('h2', {}, 'Questões'),
    h('form', { class: 'card', onSubmit: (e) => {
      e.preventDefault();
      const v = validateAttempt({ questions: Number(q.value), correct: Number(c.value) });
      if (v) { err.textContent = v; err.hidden = false; return; }
      err.hidden = true;
      guard(() => repo.saveAttempt({ task_id: task.value, questions: Number(q.value), correct: Number(c.value) }));
    } }, h('div', { class: 'grid' }, field('Atividade', task), field('Questões', q), field('Acertos', c)), err, h('button', { class: 'pri', type: 'submit', disabled: !state.tasks.length }, 'Registrar')),
    state.attempts.length ? [h('h3', {}, 'Por disciplina'), tbl(bySubject), h('h3', {}, 'Por concurso'), tbl(byExam)] : h('p', { class: 'muted' }, 'Nenhum registro de questões ainda.'));
}

export function notes() {
  const f = ctx.noteFilter;
  const bind = (el, k) => { el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { f[k] = el.value; ctx.rerender(); document.getElementById('nq')?.focus(); }); return el; };
  const nq = bind(h('input', { id: 'nq', type: 'search', placeholder: 'Buscar…', value: f.q }), 'q');
  const list = state.notes.filter((n) => (!f.type || n.note_type === f.type) && (!f.subject || n.subject_id === f.subject)
    && (!f.q || `${n.title} ${n.body}`.toLowerCase().includes(f.q.toLowerCase())));
  const rec = recurringErrors(state.notes, subjectName);
  return h('section', {}, h('h2', {}, 'Anotações e caderno de erros'),
    h('div', { class: 'grid card' }, nq, bind(sel(Object.entries(NOTE), f.type, 'Todas categorias'), 'type'), bind(sel(subjOptions(), f.subject, 'Todas disciplinas'), 'subject'), h('button', { class: 'pri', onClick: () => noteDialog() }, '+ Nova nota')),
    rec.length ? h('div', { class: 'card' }, h('h3', {}, 'Erros recorrentes (não dominados)'), rec.map(([s, ns]) => h('div', {}, h('strong', {}, s), ` — ${ns.length}: `, ns.slice(0, 4).map((n) => n.title).join('; ')))) : null,
    list.length ? list.map((n) => h('article', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'tag' }, NOTE[n.note_type]), n.subject_id ? h('span', { class: 'tag' }, subjectName(n.subject_id)) : null, n.mastered ? h('span', { class: 'tag ok' }, 'Dominado') : null),
      h('strong', {}, n.title), h('div', { style: 'white-space:pre-wrap' }, n.body),
      h('div', { class: 'row' }, h('button', { onClick: () => noteDialog(n) }, 'Editar'), h('button', { class: 'danger', onClick: () => { if (confirm('Excluir esta nota?')) guard(() => repo.deleteNote(n.id)); } }, 'Excluir'))))
      : h('p', { class: 'muted' }, 'Nenhuma nota encontrada.'));
}

export function performance() {
  const tasks = state.tasks;
  const sc = statusCounts(tasks, ctx.today);
  const weeks = hoursByWeek(tasks);
  const mins = minutesByExam(tasks);
  const totalMin = [...mins.values()].reduce((a, b) => a + b, 0) || 1;
  const taskOf = (id) => tasks.find((t) => t.id === id);
  const bySubj = summarizeAttempts(state.attempts, (a) => subjectName(taskOf(a.task_id)?.subject_id));
  const hard = hardestSubjects(tasks, subjectName);
  const tq = state.attempts.reduce((s, a) => s + a.questions, 0);
  const tc = state.attempts.reduce((s, a) => s + a.correct, 0);
  const last = state.attempts.slice(-8);
  return h('section', {}, h('h2', {}, 'Desempenho'),
    h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Concluídas'), h('div', { class: 'big' }, sc.done)),
      h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Pendentes'), h('div', { class: 'big' }, sc.pending)),
      h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Atrasadas'), h('div', { class: 'big' }, sc.overdue)),
      h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Taxa de acerto'), h('div', { class: 'big' }, tq ? `${accuracy(tc, tq)}%` : '—'), h('div', { class: 'muted' }, `${tc} acertos · ${tq - tc} erros · ${tq} questões`))),
    h('h3', {}, 'Horas por semana (planejado × realizado)'),
    weeks.length ? h('table', {}, h('tr', {}, ['Semana', 'Planejado', 'Realizado'].map((x) => h('th', {}, x))), weeks.map((w) => h('tr', {}, h('td', {}, formatBR(w.week)), h('td', {}, `${(w.planned / 60).toFixed(1)} h`), h('td', {}, `${(w.actual / 60).toFixed(1)} h`)))) : h('p', { class: 'muted' }, 'Sem dados ainda.'),
    h('h3', {}, 'Distribuição de horas realizadas (sem contagem dupla)'),
    [...mins].map(([id, m]) => h('div', {}, `${id ? examName(id) : 'Sem concurso'}: ${(m / 60).toFixed(1)} h (${Math.round((m / totalMin) * 100)}%)`, h('div', { class: 'bar' }, h('i', { style: `width:${(m / totalMin) * 100}%` })))),
    h('h3', {}, 'Acerto por disciplina'), bySubj.length ? bySubj.map((r) => h('div', {}, `${r.key}: ${r.rate}% (${r.correct}/${r.questions})`, h('div', { class: 'bar' }, h('i', { style: `width:${r.rate}%` })))) : h('p', { class: 'muted' }, 'Sem questões.'),
    h('h3', {}, 'Últimos testes'), last.length ? last.map((a) => h('div', {}, `${new Date(a.recorded_at).toLocaleDateString('pt-BR')} — ${taskOf(a.task_id)?.title ?? ''}: ${accuracy(a.correct, a.questions)}%`)) : h('p', { class: 'muted' }, 'Sem testes.'),
    h('h3', {}, 'Assuntos mais difíceis'), hard.length ? hard.map(([s, n]) => h('div', {}, `${s}: ${n} marcação(ões) "Difícil"`)) : h('p', { class: 'muted' }, 'Nenhum marcado como difícil.'));
}

function legacyImport(status) {
  const legacy = readLegacy(localStorage);
  const plan = buildImportPlan(STUDY_SEED, legacy);
  const s = legacySummary(legacy);
  openDialog('Importar dados anteriores para a nuvem', h('div', {},
    h('p', {}, s ? `Dados locais encontrados: ${s.tasks} tarefas, ${s.reviews} revisões, ${s.notes} notas.` : 'Nenhum dado local encontrado; será importado só o seed (Linux + 7 revisões).'),
    h('p', {}, `Prévia: ${plan.tasks.length} estudos, ${plan.reviews.length} revisões, ${plan.attempts.length} registros de questões, ${plan.notes.length} notas, ${plan.exams.length} concursos.`),
    plan.problems.length ? h('div', { class: 'alert' }, 'Ignorados: ', plan.problems.join('; ')) : null,
    h('p', { class: 'muted' }, 'Reimportar não duplica. O localStorage não é apagado.'),
    h('div', { class: 'row' },
      h('button', { onClick: () => download('backup-local-trilha.json', JSON.stringify(legacy ?? {}, null, 2)) }, 'Exportar backup local'),
      h('button', { class: 'pri', onClick: async () => {
        try {
          const r = await repo.importPlan(plan);
          status.textContent = plan.problems.length ? `Importação PARCIAL: ${r.total} itens; ${plan.problems.length} ignorados.` : `Importado: ${r.total} itens (${r.existing} já existiam).`;
        } catch (e) { status.textContent = `Falha na importação (pode repetir com segurança): ${e.message}`; }
        closeDialog(); ctx.rerender();
      } }, 'Importar'), h('button', { onClick: closeDialog }, 'Cancelar'))));
}

export function settings() {
  const p = state.prefs;
  const status = h('p', { role: 'status' });
  const dm = h('input', { type: 'number', min: 15, max: 600, value: p.daily_minutes });
  const days = [1, 2, 3, 4, 5, 6, 0].map((d) => [d, h('input', { type: 'checkbox', checked: p.study_weekdays.includes(d), style: 'width:auto;min-height:0' })]);
  const hol = h('textarea', {}, (p.holidays ?? []).join('\n'));
  const csvIn = h('input', { type: 'file', accept: '.csv,text/csv' });
  const jsonIn = h('input', { type: 'file', accept: 'application/json' });
  return h('section', {}, h('h2', {}, 'Configurações'),
    h('form', { class: 'card', onSubmit: (e) => {
      e.preventDefault();
      const hs = hol.value.split(/[\s,;]+/).filter(Boolean);
      if (hs.some((x) => !isValidDate(x))) { status.textContent = 'Feriado com data inválida (use AAAA-MM-DD).'; return; }
      guard(() => repo.savePrefs({ daily_minutes: Number(dm.value), study_weekdays: days.filter(([, i]) => i.checked).map(([d]) => d), holidays: hs }));
    } }, h('h3', {}, 'Estudo'), field('Minutos por dia', dm),
    h('div', { class: 'row' }, days.map(([d, i]) => h('label', {}, ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d], i))),
    field('Feriados / dias sem estudo (AAAA-MM-DD, um por linha)', hol), h('button', { class: 'pri', type: 'submit' }, 'Salvar preferências')),
    h('div', { class: 'card' }, h('h3', {}, 'Concursos'),
      state.exams.map((e) => h('div', { class: 'row' }, h('span', { class: 'grow' }, `${e.name}${e.role_name ? ' — ' + e.role_name : ''} · ${formatBR(e.exam_date)}${e.archived ? ' (arquivado)' : ''}`),
        h('button', { onClick: () => examDialog(e) }, 'Editar'))),
      h('button', { onClick: () => examDialog() }, '+ Concurso')),
    h('div', { class: 'card' }, h('h3', {}, 'Importar e backup'),
      h('div', { class: 'row' }, h('button', { class: 'pri', onClick: () => legacyImport(status) }, 'Importar meus dados anteriores para a nuvem')),
      field('Importar agenda (CSV: date,exam,subject,title,content,minutes)', csvIn),
      h('button', { onClick: async () => {
        const f = csvIn.files[0]; if (!f) return;
        const r = parseAgendaCsv(await f.text());
        if (!r.tasks.length) { status.textContent = r.problems.join('; '); return; }
        if (!confirm(`Importar ${r.tasks.length} atividades? ${r.problems.length} linhas inválidas serão ignoradas.`)) return;
        const plan = buildImportPlan({ exams: [], tasks: r.tasks, reviews: [] }, null);
        guard(async () => { const x = await repo.importPlan(plan); status.textContent = `CSV importado: ${x.total} (${x.existing} já existiam).`; });
      } }, 'Importar CSV'),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { onClick: () => download(`trilha-backup-${ctx.today}.json`, JSON.stringify(repo.exportBackup(), null, 2)) }, 'Exportar backup JSON'),
        h('button', { onClick: () => download(`trilha-agenda-${ctx.today}.csv`, agendaCsv(), 'text/csv') }, 'Exportar agenda CSV')),
      field('Restaurar backup JSON', jsonIn),
      h('button', { onClick: async () => {
        const f = jsonIn.files[0]; if (!f) return;
        let b; try { b = JSON.parse(await f.text()); } catch { status.textContent = 'JSON ilegível.'; return; }
        const bad = validateBackup(b); if (bad) { status.textContent = bad; return; }
        if (!confirm(`Backup de ${b.exported_at ?? 'data desconhecida'} com ${b.tasks.length} atividades. Mesclar com os dados atuais (não duplica; sobrescreve itens de mesmo id)?`)) return;
        guard(async () => { await repo.restoreBackup(b); status.textContent = 'Backup restaurado.'; });
      } }, 'Restaurar'),
      status));
}

function agendaCsv() {
  const rows = [['date', 'exam', 'subject', 'kind', 'title', 'status', 'planned_minutes', 'actual_minutes']];
  for (const t of state.tasks) rows.push([t.date, examName(t.exam_id), subjectName(t.subject_id), t.kind, t.title, t.status, t.planned_minutes, t.actual_minutes]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

function examDialog(e) {
  const v = e ?? { name: '', role_name: '', board: '', exam_date: '', archived: false };
  const name = h('input', { value: v.name, required: true });
  const role = h('input', { value: v.role_name ?? '' });
  const board = h('input', { value: v.board ?? '' });
  const date = h('input', { type: 'date', value: v.exam_date, required: true });
  const arch = h('input', { type: 'checkbox', checked: v.archived, style: 'width:auto;min-height:0' });
  openDialog(e ? 'Editar concurso' : 'Novo concurso', h('form', { onSubmit: (ev) => {
    ev.preventDefault();
    guard(async () => {
      const dateChanged = e && e.exam_date !== date.value;
      const row = { ...(e ?? {}), name: name.value.trim(), role_name: role.value, board: board.value, exam_date: date.value, archived: arch.checked };
      if (!row.id) delete row.id;
      const saved = await repo.saveExam(row);
      if (dateChanged && confirm('Data da prova mudou. Recalcular apenas revisões futuras não concluídas?')) {
        for (const t of state.tasks.filter((x) => x.exam_id === saved.id && x.kind === 'study')) await repo.syncReviews(t.id);
      }
      closeDialog();
    });
  } }, field('Nome', name), field('Cargo', role), field('Banca', board), field('Data da prova (confirme no edital)', date), h('label', {}, h('span', {}, arch, ' Arquivado')),
  h('div', { class: 'row' }, h('button', { class: 'pri', type: 'submit' }, 'Salvar'), h('button', { type: 'button', onClick: closeDialog }, 'Cancelar'))));
}
