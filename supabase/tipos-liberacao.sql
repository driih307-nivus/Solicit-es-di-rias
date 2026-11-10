-- =====================================================================
-- Novos tipos de solicitação: rodar UMA vez no Supabase do app de Solicitações
-- (SQL Editor > New query > colar tudo > Run). Pode rodar de novo sem problema.
--   "Liberar Recebidos comprovantes"  ->  "Liberar comprovantes recebidos - 1203"
--   novo:                                  "Liberar pedido pendente/bloqueado - 336"
-- =====================================================================

-- 1) Tira a trava antiga da lista de tipos (seja qual for o nome dela)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.solicitacoes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo_solicitacao%'
  loop
    execute format('alter table public.solicitacoes drop constraint %I', c.conname);
  end loop;
end $$;

-- 2) As solicitações que já existem passam para o nome novo
update public.solicitacoes
   set tipo_solicitacao = 'Liberar comprovantes recebidos - 1203'
 where tipo_solicitacao = 'Liberar Recebidos comprovantes';

-- 3) Trava de novo com a lista atualizada
alter table public.solicitacoes
  add constraint solicitacoes_tipo_solicitacao_check check (
    tipo_solicitacao in (
      'Liberar comprovantes recebidos - 1203',
      'Liberar pedido pendente/bloqueado - 336',
      'Aumento de limite',
      'Alteração de prazo',
      'Antecipação de boleto',
      'Retirar taxa de boleto'
    )
  );
