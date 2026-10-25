CREATE TABLE IF NOT EXISTS public.user_audio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  is_radio BOOLEAN NOT NULL DEFAULT false,
  published_store_item_id UUID REFERENCES public.store_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_audio_assets_user_created
  ON public.user_audio_assets(user_id, created_at DESC);

ALTER TABLE public.user_audio_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ler seus próprios áudios" ON public.user_audio_assets;
CREATE POLICY "Usuários podem ler seus próprios áudios"
  ON public.user_audio_assets FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem salvar seus próprios áudios" ON public.user_audio_assets;
CREATE POLICY "Usuários podem salvar seus próprios áudios"
  ON public.user_audio_assets FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios áudios" ON public.user_audio_assets;
CREATE POLICY "Usuários podem atualizar seus próprios áudios"
  ON public.user_audio_assets FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
