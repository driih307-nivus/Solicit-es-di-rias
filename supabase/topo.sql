-- Solicitações: botão "Subir ao topo" (13/11/2026)
-- Rode uma vez no SQL Editor do Supabase do app de Solicitações.
-- Guarda quando a solicitação foi colocada de novo no topo da lista (sem mudar o status nem a data de envio).
alter table public.solicitacoes add column if not exists topo_em timestamp with time zone;
