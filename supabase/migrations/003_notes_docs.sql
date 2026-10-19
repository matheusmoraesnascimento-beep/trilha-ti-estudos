-- Anotações como documentos: texto formatado (HTML sanitizado no cliente) + tags hierárquicas ("Linux/Permissões").
alter table public.notes
  add column if not exists tags text[] not null default '{}',
  add column if not exists format text not null default 'text' check (format in ('text', 'html'));
create index if not exists notes_tags_idx on public.notes using gin (tags);
