# Trilha TI

Painel pessoal de estudos para concursos (Transpetro / CREMERJ). Front-end estático (HTML + ES modules, sem build) em GitHub Pages; login, banco e sincronização via Supabase (RLS por usuário).

## Estado real da implementação

| Item | Situação |
|---|---|
| Motor de datas, revisões espaçadas, métricas, migração, CSV, sanitização | Implementado e **testado** (`npm test`, 25 testes) |
| SQL + RLS (`supabase/migrations/001_initial.sql`) | Escrito; **não executado** num Supabase real ainda |
| Teste RLS de 2 contas (`supabase/tests/rls.sql`) | Escrito; **não executado** |
| UI (Hoje, Calendário, Revisões, Questões, Anotações, Desempenho, Configurações) + Auth | Escrita; **não testada no navegador** contra Supabase |
| Offline | MVP: edição bloqueada com aviso (sem fila local) |
| As 40 sessões de 19/10–11/12 | **Não estavam disponíveis.** `data.js` traz só Linux + 7 revisões. Importe o CSV (abaixo) |

O zip original (`trilha-ti-agenda-github-pages.zip`) não foi encontrado; o app foi reconstruído. O leitor do `localStorage` (`trilha-ti-2026-v1`) assume `tasks`/`reviews`/`notes` como array ou mapa `id → objeto` com campos `date, title, status|done, questions, correct, minutes`; **confira com seus dados reais** antes de importar (a tela mostra prévia).

## Passo a passo

1. Crie projeto Supabase Free. Guarde a senha do banco fora do repositório.
2. SQL Editor → rode `supabase/migrations/001_initial.sql`. Num projeto de **teste**, rode também `supabase/tests/rls.sql` (deve terminar em `RLS OK`).
3. Authentication → URL Configuration: Site URL e Redirect URLs = endereço do GitHub Pages.
4. Copie **Project URL** e **publishable/anon key** para `config.js` (nunca `service_role`).
5. `npm run serve` → http://localhost:8080 para testar local (adicione essa URL nos redirects).
6. Suba ao GitHub; Settings → Pages → Source: GitHub Actions. O workflow roda os testes e publica.
7. Entre, vá em Configurações → importar dados anteriores / agenda CSV (`date,exam,subject,title,content,minutes`; datas `AAAA-MM-DD`).
8. (Modo aberto) rode também `002_open_single_user.sql`; o site dispensa login e qualquer um com a URL acessa os dados. Para voltar ao login: `OPEN_MODE = false` em config.js.
9. Abra no celular com a mesma conta. Exporte backup JSON periodicamente (Free não garante backup/disponibilidade; projeto pausa por inatividade).

## Regras de revisão
D+1, 3, 7, 15, 30, 45 + pré-prova (último dia útil antes). Fim de semana/feriado → próximo dia útil antes da prova, senão anterior; colisões são mescladas; nada após a prova. Idempotente (índice único `source_task_id + review_stage`). Revisão com <70% (ou "Difícil" sem questões) cria revisão extra no próximo dia útil, sinalizando excedente de 120 min sem apagar nada.

## Segurança
Só URL e chave pública no navegador; RLS e GRANTs por `user_id = auth.uid()`; notas renderizadas com `textContent`; CSV exportado neutraliza fórmulas; `noindex`. O repositório público não deve conter dados reais.
