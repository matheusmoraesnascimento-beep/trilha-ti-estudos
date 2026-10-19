import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTag, normalizeTags, buildTagTree, hasTag, plainText, textToHtml, matchesQuery } from '../src/tags.js';

test('normaliza tags hierárquicas', () => {
  assert.equal(normalizeTag('  Linux /  Permissões  / '), 'Linux/Permissões');
  assert.deepEqual(normalizeTags(['a', 'a ', '', ' b/c']), ['a', 'b/c']);
});
test('árvore de tags conta cada nota uma vez por nó', () => {
  const tree = buildTagTree([{ tags: ['Linux/Permissões', 'Linux/Comandos'] }, { tags: ['Redes'] }]);
  const linux = tree.find((n) => n.name === 'Linux');
  assert.equal(linux.count, 1);
  assert.deepEqual(linux.children.map((c) => c.name), ['Comandos', 'Permissões']);
  assert.equal(tree.find((n) => n.name === 'Redes').count, 1);
});
test('filtro por tag inclui subtags e não confunde prefixos', () => {
  assert.ok(hasTag({ tags: ['Linux/Permissões'] }, 'Linux'));
  assert.ok(!hasTag({ tags: ['LinuxMint'] }, 'Linux'));
});
test('texto puro e conversão texto→html escapada', () => {
  assert.equal(plainText('<p>a&nbsp;<b>b</b></p>'), 'a b');
  assert.equal(textToHtml('<img src=x onerror=1>\nx'), '<p>&lt;img src=x onerror=1&gt;<br>x</p>');
});
test('busca em título, tags e corpo html', () => {
  const n = { title: 'chmod', tags: ['Linux'], format: 'html', body: '<p>Permissões <b>octais</b></p>' };
  assert.ok(matchesQuery(n, 'octais'));
  assert.ok(matchesQuery(n, 'linux'));
  assert.ok(!matchesQuery(n, 'redes'));
});
