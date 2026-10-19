import { supabase } from './supabaseClient.js';

const redirect = () => location.origin + location.pathname;

export const getSession = async () => (await supabase.auth.getSession()).data.session;
export const onAuth = (cb) => supabase.auth.onAuthStateChange((event, session) => cb(event, session));

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export const signOut = () => supabase.auth.signOut();

export function authMessage(err) {
  const m = String(err?.message ?? err);
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail (veja a caixa de entrada) antes de entrar.';
  if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Use "Entrar".';
  if (/rate limit/i.test(m)) return 'Limite de e-mails do Supabase atingido (plano gratuito). Aguarde ~1 hora ou peça ao administrador para criar/confirmar a conta no painel.';
  if (/Password should be/i.test(m)) return 'Senha fraca: use ao menos 6 caracteres.';
  if (/fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m;
}
