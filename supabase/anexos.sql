-- ===== ANEXOS (imagens, áudios e PDF) =====
-- Rode UMA vez no SQL Editor do Supabase (seguro rodar de novo).

-- 1. Coluna que guarda a lista de anexos de cada solicitação
alter table public.solicitacoes
  add column if not exists anexos jsonb not null default '[]'::jsonb;

-- 2. Bucket privado (links temporários), 10 MB por arquivo, só imagem/áudio/PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760, array['image/*', 'audio/*', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Permissões do app (usa a chave anon) para enviar, ver e apagar anexos
drop policy if exists "anexos_select" on storage.objects;
drop policy if exists "anexos_insert" on storage.objects;
drop policy if exists "anexos_delete" on storage.objects;

create policy "anexos_select" on storage.objects
  for select to anon, authenticated using (bucket_id = 'anexos');
create policy "anexos_insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'anexos');
create policy "anexos_delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'anexos');
