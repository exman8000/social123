CREATE TABLE IF NOT EXISTS public.user_wishlists (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_item_id UUID NOT NULL REFERENCES public.store_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, store_item_id)
);

ALTER TABLE public.user_inventory
  ADD COLUMN IF NOT EXISTS gift_from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ver wishlists" ON public.user_wishlists;
CREATE POLICY "Usuários autenticados podem ver wishlists"
  ON public.user_wishlists FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Usuários podem salvar itens na própria wishlist" ON public.user_wishlists;
CREATE POLICY "Usuários podem salvar itens na própria wishlist"
  ON public.user_wishlists FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar a própria wishlist" ON public.user_wishlists;
CREATE POLICY "Usuários podem atualizar a própria wishlist"
  ON public.user_wishlists FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem remover itens da própria wishlist" ON public.user_wishlists;
CREATE POLICY "Usuários podem remover itens da própria wishlist"
  ON public.user_wishlists FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wishlists TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
         FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'user_inventory'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_inventory;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_store_item_and_clear_wishlist(p_store_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.purchase_store_item(p_store_item_id);
  DELETE FROM public.user_wishlists
   WHERE user_id = auth.uid()
     AND store_item_id = p_store_item_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_store_item_and_clear_wishlist(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_store_item_and_clear_wishlist(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_store_gift(
  p_store_item_id UUID,
  p_recipient_user_id UUID,
  p_require_wishlist BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender_id UUID := auth.uid();
  v_item RECORD;
  v_balance INTEGER;
  v_low_id UUID;
  v_high_id UUID;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF p_recipient_user_id IS NULL OR p_recipient_user_id = v_sender_id THEN
    RAISE EXCEPTION 'INVALID_GIFT_RECIPIENT' USING ERRCODE = '22023';
  END IF;

  IF NOT p_require_wishlist THEN
    v_low_id := LEAST(v_sender_id, p_recipient_user_id);
    v_high_id := GREATEST(v_sender_id, p_recipient_user_id);
    IF NOT EXISTS (
      SELECT 1
        FROM public.user_friendships
       WHERE user_low_id = v_low_id
         AND user_high_id = v_high_id
         AND status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'GIFT_RECIPIENT_NOT_FRIEND' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
      FROM public.user_wishlists
     WHERE user_id = p_recipient_user_id
       AND store_item_id = p_store_item_id
  ) THEN
    RAISE EXCEPTION 'ITEM_NOT_ON_RECIPIENT_WISHLIST' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, name, object_type, price, thumbnail_url, asset_id
    INTO v_item
    FROM public.store_items
   WHERE id = p_store_item_id
     AND is_active = TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORE_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_item.asset_id IS NULL THEN
    RAISE EXCEPTION 'STORE_ITEM_ASSET_MISSING' USING ERRCODE = '23514';
  END IF;
  IF v_item.price < 0 THEN
    RAISE EXCEPTION 'STORE_ITEM_INVALID_PRICE' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.user_inventory
     WHERE user_id = p_recipient_user_id
       AND store_item_id = p_store_item_id
  ) THEN
    RAISE EXCEPTION 'RECIPIENT_ALREADY_OWNS_ITEM' USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles
     SET coins = coins - v_item.price,
         updated_at = timezone('utc'::text, now())
   WHERE id = v_sender_id
     AND coins >= v_item.price
   RETURNING coins INTO v_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_COINS' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_inventory (
    user_id, store_item_id, item_name, item_type, thumbnail_url, is_equipped, gift_from_user_id
  )
  VALUES (
    p_recipient_user_id, p_store_item_id, v_item.name, v_item.object_type,
    v_item.thumbnail_url, FALSE, v_sender_id
  );

  DELETE FROM public.user_wishlists
   WHERE user_id = p_recipient_user_id
     AND store_item_id = p_store_item_id;

  RETURN jsonb_build_object('coins', v_balance, 'recipient_user_id', p_recipient_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_store_gift(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_store_gift(UUID, UUID, BOOLEAN) TO authenticated;
