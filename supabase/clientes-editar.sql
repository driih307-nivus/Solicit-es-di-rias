-- ===== CLIENTES: permitir ALTERAR e EXCLUIR =====
-- Rode UMA vez no SQL Editor do Supabase do app de Solicitações (seguro rodar de novo).
-- O cadastro já permitia ler e incluir; faltava a permissão de alterar e de excluir,
-- usada pelo card "Cadastro de Clientes" do admin (lápis e lixeira).

alter table public.clientes enable row level security;

drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_update" on public.clientes
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "clientes_delete" on public.clientes;
create policy "clientes_delete" on public.clientes
  for delete to anon, authenticated using (true);

-- garante também ler e incluir (caso não existam)
drop policy if exists "clientes_select_todos" on public.clientes;
create policy "clientes_select_todos" on public.clientes
  for select to anon, authenticated using (true);

drop policy if exists "clientes_insert_todos" on public.clientes;
create policy "clientes_insert_todos" on public.clientes
  for insert to anon, authenticated with check (true);
