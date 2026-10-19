export function normalizeTag(raw) {
  return String(raw ?? '').split('/').map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean).join('/').slice(0, 80);
}

export function normalizeTags(list) {
  return [...new Set((list ?? []).map(normalizeTag).filter(Boolean))];
}

export function hasTag(note, path) {
  return (note.tags ?? []).some((t) => t === path || t.startsWith(`${path}/`));
}

export function buildTagTree(notes) {
  const root = { name: '', path: '', count: 0, children: new Map() };
  for (const n of notes) {
    const seen = new Set();
    for (const tag of n.tags ?? []) {
      let node = root;
      let path = '';
      for (const part of tag.split('/')) {
        path = path ? `${path}/${part}` : part;
        if (!node.children.has(part)) node.children.set(part, { name: part, path, count: 0, children: new Map() });
        node = node.children.get(part);
        if (!seen.has(path)) { node.count++; seen.add(path); }
      }
    }
  }
  const sort = (node) => ({ ...node, children: [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(sort) });
  return sort(root).children;
}

export function plainText(html) {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

export function textToHtml(text) {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return String(text ?? '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') || '<p><br></p>';
}

export function matchesQuery(note, q) {
  if (!q) return true;
  const hay = `${note.title} ${(note.tags ?? []).join(' ')} ${note.format === 'html' ? plainText(note.body) : note.body}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}
