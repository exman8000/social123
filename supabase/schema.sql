-- ==============================================================================
-- 3D SOCIAL CREATOR & SHOWROOM — FULL PERSISTENCE SCHEMA (POSTGRESQL / SUPABASE)
-- ==============================================================================
-- Este script cria todas as tabelas, relacionamentos, políticas de segurança (RLS)
-- e gatilhos para persistir usuários, itens da loja, salas da vitrine, inventários e poses.
-- Execute este script no "SQL Editor" do seu painel Supabase.

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA DE PERFIS DE USUÁRIOS (Vinculada ao auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT NOT NULL DEFAULT 'Criador Anônimo',
    username TEXT NOT NULL,
    avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    coins INTEGER NOT NULL DEFAULT 2450,
    gems INTEGER NOT NULL DEFAULT 180,
    level INTEGER NOT NULL DEFAULT 1,
    bio TEXT DEFAULT 'Criador no 3D Social Studio',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE public.profiles
   SET username = lower(
       regexp_replace(
           split_part(COALESCE(email, 'criador'), '@', 1) || '_' || substring(id::text, 1, 6),
           '[^a-z0-9_]+',
           '_',
           'g'
       )
   )
 WHERE username IS NULL OR btrim(username) = '';

ALTER TABLE public.profiles
    ALTER COLUMN username SET NOT NULL;

-- 3. TABELA DE ITENS DA LOJA (Avatares, Acessórios, Itens/Roupas, Poses, Salas e Móveis)
-- Suporta publicação no Modo Simples e Modo Avançado
CREATE TABLE IF NOT EXISTS public.store_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    name TEXT NOT NULL,
    object_type TEXT NOT NULL CHECK (object_type IN ('avatar', 'acessorio', 'item', 'pose', 'sala', 'moveis')),
    price INTEGER NOT NULL DEFAULT 0,
    hashtags TEXT[] NOT NULL DEFAULT ARRAY['#comunidade', '#3d'],
    thumbnail_url TEXT NOT NULL DEFAULT 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=400&q=80',
    asset_url TEXT,
    asset_id UUID,
    rarity TEXT NOT NULL DEFAULT 'COMUM' CHECK (rarity IN ('COMUM', 'RARO', 'ÉLITE')),
    description TEXT,
    publish_mode TEXT NOT NULL DEFAULT 'simples' CHECK (publish_mode IN ('simples', 'avancado')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sales_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TABELA DE SALAS DA VITRINE (Showcase Rooms com Delimitador, Spots e Objetos)
CREATE TABLE IF NOT EXISTS public.showcase_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    model_url TEXT,
    boundary JSONB NOT NULL DEFAULT '{"x": 10, "y": 4, "z": 10, "centerX": 0, "centerZ": 0}'::jsonb,
    spots JSONB NOT NULL DEFAULT '[]'::jsonb,
    placed_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
    hashtags TEXT[] NOT NULL DEFAULT ARRAY['#sala', '#vitrine3d'],
    price INTEGER NOT NULL DEFAULT 0,
    publish_mode TEXT NOT NULL DEFAULT 'simples' CHECK (publish_mode IN ('simples', 'avancado')),
    is_published BOOLEAN NOT NULL DEFAULT true,
    visits_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. TABELA DE INVENTÁRIO DO USUÁRIO (Itens comprados ou criados pelo usuário)
CREATE TABLE IF NOT EXISTS public.user_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_item_id UUID REFERENCES public.store_items(id) ON DELETE SET NULL,
    item_code TEXT,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL,
    thumbnail_url TEXT,
    is_equipped BOOLEAN NOT NULL DEFAULT false,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, store_item_id)
);

CREATE TABLE IF NOT EXISTS public.user_audio_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    is_radio BOOLEAN NOT NULL DEFAULT false,
    published_store_item_id UUID REFERENCES public.store_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

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

-- 6. TABELA DE POSES CUSTOMIZADAS DO USUÁRIO
CREATE TABLE IF NOT EXISTS public.user_poses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    pose_key TEXT NOT NULL,
    hashtags TEXT[] DEFAULT ARRAY['#pose'],
    pose_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- ÍNDICES PARA ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_store_items_type ON public.store_items(object_type);
CREATE INDEX IF NOT EXISTS idx_store_items_user_id ON public.store_items(user_id);
CREATE INDEX IF NOT EXISTS idx_store_items_active ON public.store_items(is_active);
CREATE INDEX IF NOT EXISTS idx_store_items_created_at ON public.store_items(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_showcase_rooms_user_id ON public.showcase_rooms(user_id);
CREATE INDEX IF NOT EXISTS idx_showcase_rooms_published ON public.showcase_rooms(is_published);
CREATE INDEX IF NOT EXISTS idx_showcase_rooms_created_at ON public.showcase_rooms(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON public.user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_audio_assets_user_created
    ON public.user_audio_assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_friendships_high_user
    ON public.user_friendships(user_high_id);
CREATE INDEX IF NOT EXISTS idx_user_poses_user_id ON public.user_poses(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username));

-- ==============================================================================
-- SEGURANÇA: ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_poses ENABLE ROW LEVEL SECURITY;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-avatars', 'profile-avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-audios', 'store-audios', true, 26214400, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas para Profiles
DROP POLICY IF EXISTS "Perfis públicos são legíveis por todos" ON public.profiles;
CREATE POLICY "Perfis públicos são legíveis por todos"
    ON public.profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios perfis" ON public.profiles;
CREATE POLICY "Usuários podem atualizar seus próprios perfis"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = id)
    WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Usuários podem inserir seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem inserir seu próprio perfil"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

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

DROP POLICY IF EXISTS "Fotos de perfil são públicas" ON storage.objects;
CREATE POLICY "Fotos de perfil são públicas"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "Usuários podem enviar sua foto de perfil" ON storage.objects;
CREATE POLICY "Usuários podem enviar sua foto de perfil"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Usuários podem atualizar sua foto de perfil" ON storage.objects;
CREATE POLICY "Usuários podem atualizar sua foto de perfil"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Áudios publicados são públicos" ON storage.objects;
CREATE POLICY "Áudios publicados são públicos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'store-audios');

DROP POLICY IF EXISTS "Usuários podem enviar seus áudios" ON storage.objects;
CREATE POLICY "Usuários podem enviar seus áudios"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'store-audios' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Usuários podem atualizar seus áudios" ON storage.objects;
CREATE POLICY "Usuários podem atualizar seus áudios"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'store-audios' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'store-audios' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- Políticas para Store Items (Itens da Loja)
DROP POLICY IF EXISTS "Itens ativos da loja são visíveis por todos" ON public.store_items;
CREATE POLICY "Itens ativos da loja são visíveis por todos"
    ON public.store_items FOR SELECT
    USING (true);

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

-- Políticas para Showcase Rooms (Salas da Vitrine)
DROP POLICY IF EXISTS "Salas públicas da vitrine são visíveis por todos" ON public.showcase_rooms;
DROP POLICY IF EXISTS "Salas da vitrine são visíveis por todos" ON public.showcase_rooms;
CREATE POLICY "Salas da vitrine são visíveis por todos"
    ON public.showcase_rooms FOR SELECT
    USING (true);

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

-- Políticas para Inventário do Usuário
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

-- Políticas para Poses
DROP POLICY IF EXISTS "Usuários podem gerenciar suas próprias poses" ON public.user_poses;
CREATE POLICY "Usuários podem gerenciar suas próprias poses"
    ON public.user_poses FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ==============================================================================
-- TRIGGER AUTOMÁTICO: CRIAÇÃO DE PERFIL AO CADASTRAR NOVO USUÁRIO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, username, avatar_url, coins, gems, level)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Criador Luzenne'),
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || '_' || substring(NEW.id::text, 1, 6)),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'),
        2450,
        180,
        1
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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
        user_id, store_item_id, item_name, item_type, thumbnail_url, is_equipped
    )
    VALUES (
        v_user_id, p_store_item_id, v_item.name, v_item.object_type, v_item.thumbnail_url, FALSE
    )
    ON CONFLICT (user_id, store_item_id) DO NOTHING;

    RETURN jsonb_build_object('coins', v_balance, 'already_owned', FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_store_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_store_item(UUID) TO authenticated;

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
    ON public.user_wishlists FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuários podem salvar itens na própria wishlist" ON public.user_wishlists;
CREATE POLICY "Usuários podem salvar itens na própria wishlist"
    ON public.user_wishlists FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar a própria wishlist" ON public.user_wishlists;
CREATE POLICY "Usuários podem atualizar a própria wishlist"
    ON public.user_wishlists FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Usuários podem remover itens da própria wishlist" ON public.user_wishlists;
CREATE POLICY "Usuários podem remover itens da própria wishlist"
    ON public.user_wishlists FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wishlists TO authenticated;

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
            SELECT 1 FROM public.user_friendships
             WHERE user_low_id = v_low_id
               AND user_high_id = v_high_id
               AND status = 'accepted'
        ) THEN
            RAISE EXCEPTION 'GIFT_RECIPIENT_NOT_FRIEND' USING ERRCODE = '42501';
        END IF;
    ELSIF NOT EXISTS (
        SELECT 1 FROM public.user_wishlists
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
        SELECT 1 FROM public.user_inventory
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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'user_inventory'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.user_inventory;
    END IF;
END;
$$;
