CREATE OR REPLACE FUNCTION public.purchase_store_item(p_store_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_item RECORD;
  v_balance INTEGER;
  v_already_owned BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  SELECT id, name, object_type, price, thumbnail_url, asset_id, metadata
    INTO v_item
    FROM public.store_items
   WHERE id = p_store_item_id
     AND is_active = TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORE_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.asset_id IS NULL AND NOT (
    COALESCE(v_item.metadata->>'isAudio', 'false') = 'true'
    AND COALESCE(v_item.metadata->>'audioUrl', '') ~ '^https?://[^[:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'STORE_ITEM_ASSET_MISSING' USING ERRCODE = '23514';
  END IF;

  IF v_item.price < 0 THEN
    RAISE EXCEPTION 'STORE_ITEM_INVALID_PRICE' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_inventory
     WHERE user_id = v_user_id
       AND store_item_id = p_store_item_id
  )
    INTO v_already_owned;

  IF v_already_owned THEN
    SELECT coins INTO v_balance
      FROM public.profiles
     WHERE id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'USER_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('coins', v_balance, 'already_owned', TRUE);
  END IF;

  UPDATE public.profiles
     SET coins = coins - v_item.price,
         updated_at = timezone('utc'::text, now())
   WHERE id = v_user_id
     AND coins >= v_item.price
   RETURNING coins INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_COINS' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_inventory (
    user_id,
    store_item_id,
    item_name,
    item_type,
    thumbnail_url,
    is_equipped
  )
  VALUES (
    v_user_id,
    p_store_item_id,
    v_item.name,
    v_item.object_type,
    v_item.thumbnail_url,
    FALSE
  )
  ON CONFLICT (user_id, store_item_id) DO NOTHING;

  RETURN jsonb_build_object('coins', v_balance, 'already_owned', FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_store_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_store_item(UUID) TO authenticated;

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

  SELECT id, name, object_type, price, thumbnail_url, asset_id, metadata
    INTO v_item
    FROM public.store_items
   WHERE id = p_store_item_id
     AND is_active = TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORE_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_item.asset_id IS NULL AND NOT (
    COALESCE(v_item.metadata->>'isAudio', 'false') = 'true'
    AND COALESCE(v_item.metadata->>'audioUrl', '') ~ '^https?://[^[:space:]]+$'
  ) THEN
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
