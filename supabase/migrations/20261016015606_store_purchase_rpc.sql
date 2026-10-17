ALTER TABLE public.store_items
  ADD COLUMN IF NOT EXISTS asset_id UUID;

UPDATE public.store_items
   SET asset_id = COALESCE(
     (regexp_match(asset_url, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::UUID,
     (regexp_match(metadata->>'asset_id', '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::UUID,
     (regexp_match(metadata->>'originalItemId', '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::UUID
   )
 WHERE asset_id IS NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_poses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios perfis" ON public.profiles;
CREATE POLICY "Usuários podem atualizar seus próprios perfis"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Criadores autenticados podem publicar itens na loja" ON public.store_items;
DROP POLICY IF EXISTS "Criadores podem publicar itens na loja" ON public.store_items;
CREATE POLICY "Criadores podem publicar seus próprios itens na loja"
  ON public.store_items FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Criadores podem atualizar seus próprios itens na loja" ON public.store_items;
DROP POLICY IF EXISTS "Criadores podem atualizar itens" ON public.store_items;
CREATE POLICY "Criadores podem atualizar seus próprios itens na loja"
  ON public.store_items FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Criadores podem excluir seus próprios itens na loja" ON public.store_items;
DROP POLICY IF EXISTS "Criadores podem excluir itens" ON public.store_items;
CREATE POLICY "Criadores podem excluir seus próprios itens na loja"
  ON public.store_items FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Criadores podem publicar novas salas na vitrine" ON public.showcase_rooms;
DROP POLICY IF EXISTS "Criadores podem publicar salas na vitrine" ON public.showcase_rooms;
CREATE POLICY "Criadores podem publicar suas próprias salas na vitrine"
  ON public.showcase_rooms FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Criadores podem atualizar suas próprias salas da vitrine" ON public.showcase_rooms;
DROP POLICY IF EXISTS "Criadores podem atualizar salas" ON public.showcase_rooms;
CREATE POLICY "Criadores podem atualizar suas próprias salas"
  ON public.showcase_rooms FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Criadores podem excluir suas próprias salas" ON public.showcase_rooms;
DROP POLICY IF EXISTS "Criadores podem excluir salas" ON public.showcase_rooms;
CREATE POLICY "Criadores podem excluir suas próprias salas"
  ON public.showcase_rooms FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem visualizar apenas seu próprio inventário" ON public.user_inventory;
CREATE POLICY "Usuários podem visualizar apenas seu próprio inventário"
  ON public.user_inventory FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem adicionar itens ao seu próprio inventário" ON public.user_inventory;
CREATE POLICY "Usuários podem adicionar itens ao seu próprio inventário"
  ON public.user_inventory FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar itens do seu próprio inventário (equipar)" ON public.user_inventory;
CREATE POLICY "Usuários podem atualizar itens do seu próprio inventário (equipar)"
  ON public.user_inventory FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem remover itens do seu próprio inventário" ON public.user_inventory;
CREATE POLICY "Usuários podem remover itens do seu próprio inventário"
  ON public.user_inventory FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem gerenciar suas próprias poses" ON public.user_poses;
CREATE POLICY "Usuários podem gerenciar suas próprias poses"
  ON public.user_poses FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

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