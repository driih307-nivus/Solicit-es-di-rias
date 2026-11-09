-- =====================================================================
-- Funcionário solicitante — rodar UMA vez no Supabase do app de Solicitações
-- (SQL Editor > New query > colar tudo > Run)
-- Pode rodar de novo sem problema: nada é apagado nem duplicado.
-- =====================================================================

-- 1) Nova coluna na tabela de solicitações
--    (as solicitações antigas ficam com o campo vazio)
alter table public.solicitacoes
  add column if not exists solicitante text;

create index if not exists solicitacoes_solicitante_idx
  on public.solicitacoes (solicitante);

-- 2) Tabela de funcionários (a lista do campo "Funcionário solicitante")
--    Só o nome fica aqui: a lista é lida pelo app sem login,
--    então e-mails não devem ser guardados nesta tabela.
create table if not exists public.funcionarios (
  id        bigint generated always as identity primary key,
  nome      text not null unique,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.funcionarios enable row level security;

-- O app só LÊ a lista (incluir/remover é feito por aqui, no Supabase)
drop policy if exists "funcionarios_leitura" on public.funcionarios;
create policy "funcionarios_leitura"
  on public.funcionarios
  for select
  to anon, authenticated
  using (true);

-- 3) Funcionários atuais
insert into public.funcionarios (nome) values
  ('Adriano Valério'),
  ('Jacqueline Calheiro'),
  ('Fabrício Roderico'),
  ('Anne Silva'),
  ('Jennifer Santos')
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- Para o futuro (rode só a linha que precisar):
--
-- Incluir alguém novo:
--   insert into public.funcionarios (nome) values ('Nome Sobrenome');
--
-- Tirar alguém da lista (o nome continua nas solicitações antigas):
--   update public.funcionarios set ativo = false where nome = 'Nome Sobrenome';
-- ---------------------------------------------------------------------
