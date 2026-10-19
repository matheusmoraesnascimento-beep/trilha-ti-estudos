-- MODO ABERTO (uso pessoal, sem login). Qualquer pessoa com a URL do site + chave publishable
-- passa a ler/alterar/apagar estes dados. Dono fixo = usuário já criado.
do $$
declare
  owner uuid := 'ca163d7c-7ae7-4d4c-bc4b-c45ef4d89f44';
  t text;
begin
  foreach t in array array['exams','subjects','tasks','attempts','notes','preferences']
  loop
    execute format('alter table public.%I alter column user_id set default %L::uuid', t, owner);
    execute format('grant select, insert, update, delete on table public.%I to anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_open_all', t);
    execute format('create policy %I on public.%I for all to anon using (user_id = %L::uuid) with check (user_id = %L::uuid)',
                   t || '_open_all', t, owner, owner);
  end loop;
end $$;
