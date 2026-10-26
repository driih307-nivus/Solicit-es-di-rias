-- 1. Criação da tabela de solicitações
create table if not exists public.solicitacoes (
  id uuid default gen_random_uuid() primary key,
  cod_liberacao text not null,
  rca text not null,
  tipo_solicitacao text not null check (
    tipo_solicitacao in (
      'Liberar Recebidos comprovantes',
      'Aumento de limite',
      'Alteração de prazo',
      'Antecipação de boleto',
      'Retirar taxa de boleto'
    )
  ),
  status text not null default 'PENDENTE' check (status in ('SIM', 'NAO', 'PENDENTE')),
  observacoes text,
  motivo_recusa text,
  data_enviada timestamp with time zone default timezone('utc'::text, now()) not null,
  data_finalizada timestamp with time zone,
  criado_em timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habilitar Realtime no Supabase para notificações instantâneas
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table public.solicitacoes;
commit;
