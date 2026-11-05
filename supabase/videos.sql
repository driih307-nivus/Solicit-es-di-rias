-- ===== VÍDEOS NOS ANEXOS =====
-- Rode UMA vez no SQL Editor do Supabase do app de Solicitações (seguro rodar de novo).
-- Libera vídeo no bucket "anexos" e sobe o limite por arquivo para 50 MB
-- (os vídeos são comprimidos no aparelho antes de enviar).
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/*', 'audio/*', 'video/*', 'application/pdf']
 where id = 'anexos';
