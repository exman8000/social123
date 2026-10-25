CREATE TABLE IF NOT EXISTS public.user_friendships (
  user_low_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_low_id, user_high_id),
  CHECK (user_low_id < user_high_id),
  CHECK (requested_by IN (user_low_id, user_high_id))
);

CREATE INDEX IF NOT EXISTS idx_user_friendships_high_user
  ON public.user_friendships(user_high_id);

ALTER TABLE public.user_friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas conexões de amizade" ON public.user_friendships;
CREATE POLICY "Usuários podem ver suas conexões de amizade"
  ON public.user_friendships FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (user_low_id, user_high_id));

DROP POLICY IF EXISTS "Usuários podem enviar solicitações de amizade" ON public.user_friendships;
CREATE POLICY "Usuários podem enviar solicitações de amizade"
  ON public.user_friendships FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = requested_by
    AND status = 'pending'
    AND (SELECT auth.uid()) IN (user_low_id, user_high_id)
  );

DROP POLICY IF EXISTS "Destinatários podem aceitar solicitações de amizade" ON public.user_friendships;
CREATE POLICY "Destinatários podem aceitar solicitações de amizade"
  ON public.user_friendships FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND (SELECT auth.uid()) = CASE
      WHEN requested_by = user_low_id THEN user_high_id
      ELSE user_low_id
    END
  )
  WITH CHECK (
    status = 'accepted'
    AND (SELECT auth.uid()) IN (user_low_id, user_high_id)
  );

GRANT SELECT, INSERT ON public.user_friendships TO authenticated;
GRANT UPDATE (status) ON public.user_friendships TO authenticated;
