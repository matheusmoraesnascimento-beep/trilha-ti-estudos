import { configured } from './supabaseClient.js';
import { h, field } from './dom.js';
import { todayIn } from './dates.js';
import * as repo from './repository.js';
import * as views from './views.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const statusEl = document.getElementById('status');
const logout = document.getElementById('logout');

const TABS = [['hoje', 'Hoje', views.today], ['calendario', 'Calendário', views.calendar], ['revisoes', 'Revisões', views.reviews], ['questoes', 'Questões', views.questions],
  ['notas', 'Anotações', views.notes], ['desempenho', 'Desempenho', views.performance], ['config', 'Configurações', views.settings]];
let tab = 'hoje';

const STATUS_TEXT = { idle: '', saving: 'Salvando…', saved: '✓ Salvo na nuvem', error: '✕ Erro ao salvar', offline: '✕ Offline' };
repo.subscribe(() => {
  statusEl.className = `status ${repo.status.value}`;
  statusEl.textContent = [STATUS_TEXT[repo.status.value], repo.status.detail].filter(Boolean).join(' — ');
});
addEventListener('offline', () => repo.setStatus('offline', 'Sem internet: edições estão bloqueadas.'));
addEventListener('online', () => repo.setStatus('idle'));

function render() {
  views.ctx.today = todayIn(repo.state.prefs?.timezone);
  nav.replaceChildren(...TABS.map(([id, label]) => h('button', { 'aria-current': id === tab ? 'page' : null, onClick: () => { tab = id; render(); } }, label)));
  app.replaceChildren(TABS.find(([id]) => id === tab)[2]());
}
views.ctx.rerender = render;

function authScreen(message = '') {
  nav.hidden = true; logout.hidden = true;
  const email = h('input', { type: 'email', required: true, autocomplete: 'email' });
  const pass = h('input', { type: 'password', required: true, minlength: 6, autocomplete: 'current-password' });
  const msg = h('p', { role: 'alert', class: message ? 'alert' : '' }, message);
  const say = (m) => { msg.textContent = m; msg.className = 'alert'; };
  const act = (fn) => async (e) => { e?.preventDefault(); try { await fn(); } catch (err) { const { authMessage } = await import('./auth.js'); say(authMessage(err)); } };
  const auth = import('./auth.js');
  app.replaceChildren(h('form', { class: 'card', style: 'max-width:420px;margin:auto', onSubmit: act(async () => (await auth).signIn(email.value, pass.value)) },
    h('h2', {}, 'Entrar'), field('E-mail', email), field('Senha', pass), msg,
    h('div', { class: 'row' },
      h('button', { class: 'pri', type: 'submit' }, 'Entrar'),
      h('button', { type: 'button', onClick: act(async () => { const r = await (await auth).signUp(email.value, pass.value); say(r.needsConfirmation ? 'Conta criada. Confirme o e-mail para entrar.' : 'Conta criada.'); }) }, 'Criar conta'),
      h('button', { type: 'button', class: 'ghost', onClick: act(async () => { if (!email.value) return say('Informe o e-mail.'); await (await auth).resetPassword(email.value); say('Enviamos um link de recuperação ao e-mail.'); }) }, 'Esqueci a senha')),
    h('p', { class: 'muted' }, 'Seus dados ficam na sua conta; ninguém mais os acessa.')));
}

function recoveryScreen(auth) {
  const pass = h('input', { type: 'password', required: true, minlength: 6, autocomplete: 'new-password' });
  const msg = h('p', { role: 'alert' });
  app.replaceChildren(h('form', { class: 'card', style: 'max-width:420px;margin:auto', onSubmit: async (e) => {
    e.preventDefault();
    try { await auth.updatePassword(pass.value); await start(); } catch (err) { msg.textContent = auth.authMessage(err); }
  } }, h('h2', {}, 'Nova senha'), field('Nova senha', pass), msg, h('button', { class: 'pri', type: 'submit' }, 'Salvar')));
}

async function start() {
  logout.hidden = false; nav.hidden = false;
  try {
    await repo.loadAll();
    render();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'alert bad' }, `Não foi possível carregar seus dados: ${e.message ?? e}`), h('button', { onClick: start }, 'Tentar de novo'));
  }
}

async function boot() {
  if (!configured) {
    app.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Configuração pendente'), h('p', {}, 'Preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em config.js (veja o README).')));
    return;
  }
  const auth = await import('./auth.js');
  logout.addEventListener('click', async () => { await auth.signOut(); });
  let started = false;
  auth.onAuth(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') return recoveryScreen(auth);
    if (event === 'SIGNED_OUT') { started = false; return authScreen(session ? '' : 'Sessão encerrada. Entre novamente.'); }
    if (session && !started) { started = true; await start(); }
  });
  const s = await auth.getSession();
  if (!s) authScreen();
}

boot();
