-- Trilha TI — esquema inicial (baseado na especificação, com unique de exams e anti auto-referência)
create extension if not exists pgcrypto;

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  role_name text,
  board text,
  exam_date date not null,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam_id uuid,
  subject_id uuid,
  source_task_id uuid,
  source_legacy_id text,
  date date not null,
  title text not null,
  content text not null default '',
  instructions text not null default '',
  kind text not null default 'study'
    check (kind in ('study', 'review', 'mock', 'essay')),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done', 'postponed')),
  planned_minutes integer not null default 0 check (planned_minutes >= 0),
  actual_minutes integer not null default 0 check (actual_minutes >= 0),
  review_stage text,
  difficulty text check (difficulty in ('easy', 'partial', 'hard')),
  result_notes text not null default '',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, source_legacy_id),
  foreign key (exam_id, user_id) references public.exams(id, user_id),
  foreign key (subject_id, user_id) references public.subjects(id, user_id),
  foreign key (source_task_id, user_id) references public.tasks(id, user_id),
  check (kind <> 'review' or source_task_id is not null),
  check (source_task_id is null or source_task_id <> id)
);

-- Impede duplicar automaticamente a mesma etapa de revisão para a mesma origem.
create unique index tasks_unique_review_stage
  on public.tasks (user_id, source_task_id, review_stage)
  where kind = 'review' and review_stage is not null;

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null,
  source_legacy_id text,
  questions integer not null check (questions > 0),
  correct integer not null check (correct >= 0 and correct <= questions),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_legacy_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid,
  subject_id uuid,
  source_legacy_id text,
  note_type text not null default 'general'
    check (note_type in ('general', 'summary', 'error', 'question', 'flashcard')),
  title text not null,
  body text not null default '',
  mastered boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, source_legacy_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id),
  foreign key (subject_id, user_id) references public.subjects(id, user_id)
);

create table public.preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  daily_minutes integer not null default 120
    check (daily_minutes between 15 and 600),
  study_weekdays integer[] not null default array[1,2,3,4,5],
  holidays date[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index tasks_user_date_idx on public.tasks(user_id, date);
create index tasks_user_status_idx on public.tasks(user_id, status);
create index attempts_user_date_idx on public.attempts(user_id, recorded_at);
create index notes_user_type_idx on public.notes(user_id, note_type);
create index exams_user_date_idx on public.exams(user_id, exam_date);
create index subjects_user_idx on public.subjects(user_id);

-- Manter updated_at controlado pelo servidor.
create or replace function public.trilha_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['exams','subjects','tasks','attempts','notes','preferences']
  loop
    execute format('create trigger %I before update on public.%I '
                   || 'for each row execute function public.trilha_touch_updated_at()',
                   t || '_updated_at_trigger', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    execute format('create policy %I on public.%I for select to authenticated '
                   || 'using ((select auth.uid()) = user_id)',
                   t || '_own_select', t);
    execute format('create policy %I on public.%I for insert to authenticated '
                   || 'with check ((select auth.uid()) = user_id)',
                   t || '_own_insert', t);
    execute format('create policy %I on public.%I for update to authenticated '
                   || 'using ((select auth.uid()) = user_id) '
                   || 'with check ((select auth.uid()) = user_id)',
                   t || '_own_update', t);
    execute format('create policy %I on public.%I for delete to authenticated '
                   || 'using ((select auth.uid()) = user_id)',
                   t || '_own_delete', t);
  end loop;
end;
$$;
