INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-audios', 'store-audios', true, 26214400, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Áudios publicados são públicos" ON storage.objects;
CREATE POLICY "Áudios publicados são públicos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-audios');

DROP POLICY IF EXISTS "Usuários podem enviar seus áudios" ON storage.objects;
CREATE POLICY "Usuários podem enviar seus áudios"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-audios'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Usuários podem atualizar seus áudios" ON storage.objects;
CREATE POLICY "Usuários podem atualizar seus áudios"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-audios'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'store-audios'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
