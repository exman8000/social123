CREATE TABLE IF NOT EXISTS public.showcase_room_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.showcase_rooms(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_showcase_room_purchases_user_id
  ON public.showcase_room_purchases(user_id);

ALTER TABLE public.showcase_room_purchases ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.showcase_room_purchases TO authenticated;

DROP POLICY IF EXISTS "Usuários podem visualizar suas salas adquiridas"
  ON public.showcase_room_purchases;
CREATE POLICY "Usuários podem visualizar suas salas adquiridas"
  ON public.showcase_room_purchases FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.purchase_showcase_room(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_balance INTEGER;
  v_already_owned BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  SELECT id, user_id, price
    INTO v_room
    FROM public.showcase_rooms
   WHERE id = p_room_id
     AND is_published = TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOWCASE_ROOM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_room.price IS NULL OR v_room.price < 0 THEN
    RAISE EXCEPTION 'SHOWCASE_ROOM_INVALID_PRICE' USING ERRCODE = '23514';
  END IF;
  IF v_room.price = 0 THEN
    RAISE EXCEPTION 'SHOWCASE_ROOM_NOT_FOR_SALE' USING ERRCODE = '23514';
  END IF;
  IF v_room.user_id = v_user_id THEN
    RAISE EXCEPTION 'SELF_PURCHASE_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.showcase_room_purchases
     WHERE user_id = v_user_id
       AND room_id = p_room_id
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
     SET coins = coins - v_room.price,
         updated_at = timezone('utc'::text, now())
   WHERE id = v_user_id
     AND coins >= v_room.price
  RETURNING coins INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_COINS' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.showcase_room_purchases (user_id, room_id)
  VALUES (v_user_id, p_room_id)
  ON CONFLICT (user_id, room_id) DO NOTHING;

  RETURN jsonb_build_object('coins', v_balance, 'already_owned', FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_showcase_room(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_showcase_room(UUID) TO authenticated;
