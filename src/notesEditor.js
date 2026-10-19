import { h } from './dom.js';
import * as repo from './repository.js';
import { state, subjectName } from './repository.js';
import { buildTagTree, hasTag, matchesQuery, normalizeTag, normalizeTags, textToHtml, plainText } from './tags.js';

const NOTE_TYPES = { general: 'Geral', summary: 'Resumo', error: 'Erro de questão', question: 'Dúvida', flashcard: 'Comando/flashcard' };
const view = { q: '', tag: null, type: '', openId: null, collapsed: new Set(), mobileEditor: false };
let current = null;
let dirty = false;
let timer = null;
let root = null;

const PURIFY = {
  ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'a', 'mark', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

export function sanitize(html) {
  if (!window.DOMPurify) return null;
  return window.DOMPurify.sanitize(html, { ...PURIFY, RETURN_TRUSTED_TYPE: false });
}

function safeHtml(note) {
  const html = note.format === 'html' ? note.body : textToHtml(note.body);
  return sanitize(html) ?? textToHtml(plainText(html));
}

export async function flushNotes() {
  clearTimeout(timer);
  if (dirty && current) await save();
}
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

let saveState;
const setSaveState = (t, cls = '') => { if (saveState) { saveState.textContent = t; saveState.className = `muted ${cls}`; } };

async function save() {
  if (!current) return;
  const editor = root?.querySelector('.doc-body');
  const row = {
    ...current, format: 'html', body: editor ? sanitize(editor.innerHTML) ?? '' : current.body,
    title: root.querySelector('.doc-title').value.trim() || 'Sem título', tags: normalizeTags(current.tags),
  };
  if (!row.id) delete row.id;
  setSaveState('Salvando…');
  clearTimeout(timer);
  try {
    await repo.saveNote(row);
    const saved = state.notes.find((n) => (row.id ? n.id === row.id : n.id === state.notes[0]?.id));
    current = { ...saved };
    view.openId = saved.id;
    dirty = false;
    setSaveState('✓ Salvo na nuvem', 'ok');
    renderSide();
  } catch (e) {
    setSaveState(e.message === 'offline' ? '✕ Offline: não salvo' : `✕ Erro ao salvar: ${e.message ?? e}`, 'bad');
  }
}

const touch = () => { dirty = true; setSaveState('Alterações não salvas…'); clearTimeout(timer); timer = setTimeout(save, 1500); };

function filtered() {
  return state.notes.filter((n) => (!view.type || n.note_type === view.type) && (view.tag === null || (view.tag === '' ? !(n.tags ?? []).length : hasTag(n, view.tag))) && matchesQuery(n, view.q));
}

function treeNodes(nodes, depth = 0) {
  return nodes.flatMap((n) => {
    const open = !view.collapsed.has(n.path);
    const btn = h('button', { class: `ghost tag-btn ${view.tag === n.path ? 'sel' : ''}`, style: `padding-left:${8 + depth * 14}px`, onClick: () => { view.tag = n.path; view.mobileEditor = false; renderSide(); } }, `${n.name} (${n.count})`);
    const tog = n.children.length ? h('button', { class: 'ghost tog', 'aria-label': open ? 'Recolher' : 'Expandir', onClick: () => { open ? view.collapsed.add(n.path) : view.collapsed.delete(n.path); renderSide(); } }, open ? '▾' : '▸') : h('span', { class: 'tog' });
    return [h('div', { class: 'row tagrow' }, tog, btn), ...(open ? treeNodes(n.children, depth + 1) : [])];
  });
}

function renderSide() {
  if (!root) return;
  const side = root.querySelector('.notes-side');
  const list = filtered();
  side.replaceChildren(
    h('input', { type: 'search', placeholder: 'Buscar nas anotações…', value: view.q, id: 'nq', onInput: (e) => { view.q = e.target.value; renderSide(); document.getElementById('nq').focus(); document.getElementById('nq').setSelectionRange(view.q.length, view.q.length); } }),
    h('select', { onChange: (e) => { view.type = e.target.value; renderSide(); } }, h('option', { value: '' }, 'Todas categorias'), Object.entries(NOTE_TYPES).map(([v, l]) => h('option', { value: v, selected: v === view.type }, l))),
    h('div', { class: 'tagtree' },
      h('button', { class: `ghost tag-btn ${view.tag === null ? 'sel' : ''}`, onClick: () => { view.tag = null; renderSide(); } }, `Todas (${state.notes.length})`),
      treeNodes(buildTagTree(state.notes)),
      h('button', { class: `ghost tag-btn ${view.tag === '' ? 'sel' : ''}`, onClick: () => { view.tag = ''; renderSide(); } }, `Sem tag (${state.notes.filter((n) => !(n.tags ?? []).length).length})`)),
    h('div', {}, list.length ? list.map((n) => h('button', { class: `notecard ${n.id === view.openId ? 'sel' : ''}`, onClick: () => openNote(n.id) },
      h('strong', {}, n.title), h('div', { class: 'muted' }, (n.tags ?? []).join(' · ') || NOTE_TYPES[n.note_type]),
      h('div', { class: 'muted snippet' }, (n.format === 'html' ? plainText(n.body) : n.body).slice(0, 90)))) : h('p', { class: 'muted' }, 'Nenhuma anotação aqui.')));
}

async function openNote(id) {
  await flushNotes();
  current = id ? { ...state.notes.find((n) => n.id === id) } : { title: '', body: '', note_type: 'summary', tags: view.tag ? [view.tag] : [], subject_id: null, mastered: false, format: 'html' };
  view.openId = id ?? null;
  view.mobileEditor = true;
  renderEditor();
  renderSide();
  root.classList.add('editing');
}

const CMD = [
  ['B', 'Negrito', 'bold'], ['I', 'Itálico', 'italic'], ['U', 'Sublinhado', 'underline'], ['S', 'Riscado', 'strikeThrough'],
  ['H1', 'Título 1', 'formatBlock', 'h1'], ['H2', 'Título 2', 'formatBlock', 'h2'], ['H3', 'Título 3', 'formatBlock', 'h3'], ['¶', 'Parágrafo', 'formatBlock', 'p'],
  ['• Lista', 'Lista', 'insertUnorderedList'], ['1. Lista', 'Lista numerada', 'insertOrderedList'], ['❝', 'Citação', 'formatBlock', 'blockquote'],
  ['</>', 'Bloco de código', 'formatBlock', 'pre'], ['―', 'Linha', 'insertHorizontalRule'], ['🖍', 'Destacar', 'hiliteColor', '#fff3a3'],
  ['Tx', 'Limpar formatação', 'removeFormat'], ['↶', 'Desfazer', 'undo'], ['↷', 'Refazer', 'redo'],
];

function renderEditor() {
  const pane = root.querySelector('.notes-main');
  if (!current) { pane.replaceChildren(h('p', { class: 'muted' }, 'Selecione uma anotação ou crie uma nova.')); return; }
  const title = h('input', { class: 'doc-title', placeholder: 'Título', value: current.title, onInput: touch });
  const body = h('div', { class: 'doc-body', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Texto da anotação', spellcheck: 'true' });
  body.innerHTML = safeHtml(current);
  body.addEventListener('input', touch);
  body.addEventListener('blur', () => { if (dirty) save(); });
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const clean = html ? sanitize(html) : null;
    document.execCommand('insertHTML', false, clean ?? textToHtml(e.clipboardData.getData('text/plain')));
  });
  const chips = h('div', { class: 'chips' });
  const tagIn = h('input', { class: 'tag-input', placeholder: 'Tag ou Assunto/Subassunto + Enter', list: 'taglist' });
  const renderChips = () => chips.replaceChildren(...(current.tags ?? []).map((t) => h('span', { class: 'chip-tag' }, t, h('button', { type: 'button', 'aria-label': `Remover tag ${t}`, onClick: () => { current.tags = current.tags.filter((x) => x !== t); renderChips(); touch(); } }, '×'))));
  const addTag = () => { const t = normalizeTag(tagIn.value.replace(/,$/, '')); if (t) { current.tags = normalizeTags([...(current.tags ?? []), t]); renderChips(); touch(); } tagIn.value = ''; };
  tagIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } });
  tagIn.addEventListener('blur', addTag);
  renderChips();
  const allTags = [...new Set(state.notes.flatMap((n) => n.tags ?? []))];
  const subj = h('select', { onChange: (e) => { current.subject_id = e.target.value || null; touch(); } }, h('option', { value: '' }, 'Sem disciplina'), state.subjects.map((s) => h('option', { value: s.id, selected: s.id === current.subject_id }, s.name)));
  const type = h('select', { onChange: (e) => { current.note_type = e.target.value; touch(); } }, Object.entries(NOTE_TYPES).map(([v, l]) => h('option', { value: v, selected: v === current.note_type }, l)));
  const mastered = h('input', { type: 'checkbox', checked: current.mastered, style: 'width:auto;min-height:0', onChange: (e) => { current.mastered = e.target.checked; touch(); } });
  saveState = h('span', { class: 'muted' }, current.id ? '✓ Salvo na nuvem' : 'Nova anotação');
  const link = () => { const u = prompt('Endereço do link (https://…)'); if (u && /^(https?:|mailto:)/i.test(u)) { body.focus(); document.execCommand('createLink', false, u); body.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; }); touch(); } };
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatação' },
    CMD.map(([lbl, name, cmd, arg]) => h('button', { type: 'button', title: name, 'aria-label': name, onMousedown: (e) => e.preventDefault(), onClick: () => { body.focus(); document.execCommand(cmd, false, arg); touch(); } }, lbl)),
    h('button', { type: 'button', title: 'Inserir link', 'aria-label': 'Inserir link', onMousedown: (e) => e.preventDefault(), onClick: link }, '🔗'));
  pane.replaceChildren(
    h('div', { class: 'row' }, h('button', { class: 'ghost back', onClick: async () => { await flushNotes(); root.classList.remove('editing'); } }, '← Lista'), saveState, h('span', { class: 'grow' }),
      h('button', { onClick: () => window.print() }, 'Imprimir / PDF'),
      current.id ? h('button', { class: 'danger', onClick: async () => { if (confirm(`Excluir "${current.title}"?`)) { clearTimeout(timer); dirty = false; await repo.deleteNote(current.id); current = null; view.openId = null; renderEditor(); renderSide(); root.classList.remove('editing'); } } }, 'Excluir') : null),
    title, h('div', { class: 'grid' }, subj, type, h('label', {}, h('span', {}, mastered, ' Dominado'))),
    chips, tagIn, h('datalist', { id: 'taglist' }, allTags.map((t) => h('option', { value: t }))), toolbar, body);
}

export function notesView() {
  root = h('section', { class: `notes-app ${view.mobileEditor && current ? 'editing' : ''}` },
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Anotações'), h('button', { class: 'pri', onClick: () => openNote(null) }, '+ Nova anotação')),
    h('div', { class: 'notes-layout' }, h('aside', { class: 'notes-side card' }), h('div', { class: 'notes-main card' })));
  renderSide();
  renderEditor();
  return root;
}
