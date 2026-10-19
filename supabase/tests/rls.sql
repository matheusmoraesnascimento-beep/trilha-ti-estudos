-- Teste de isolamento RLS com duas contas. Rodar no SQL Editor de um projeto DE TESTE.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@teste.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@teste.local');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into public.exams (name, exam_date) values ('A-exam', '2026-12-13');
insert into public.tasks (date, title) values ('2026-10-19', 'A-task');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.tasks;
  assert n = 0, 'B enxerga tarefas de A';
  select count(*) into n from public.exams;
  assert n = 0, 'B enxerga exams de A';
  update public.tasks set title = 'hack';
  get diagnostics n = row_count;
  assert n = 0, 'B alterou tarefa de A';
  delete from public.tasks;
  get diagnostics n = row_count;
  assert n = 0, 'B apagou tarefa de A';
  begin
    insert into public.tasks (user_id, date, title) values ('00000000-0000-0000-0000-0000000000a1', '2026-10-19', 'forjada');
    assert false, 'B inseriu como A';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

select 'RLS OK' as resultado;
rollback;
