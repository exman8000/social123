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
    avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    coins INTEGER NOT NULL DEFAULT 2450,
    gems INTEGER NOT NULL DEFAULT 180,
    level INTEGER NOT NULL DEFAULT 1,
    bio TEXT DEFAULT 'Criador no 3D Social Studio',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

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
CREATE INDEX IF NOT EXISTS idx_user_poses_user_id ON public.user_poses(user_id);

-- ==============================================================================
-- SEGURANÇA: ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_poses ENABLE ROW LEVEL SECURITY;

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
    INSERT INTO public.profiles (id, email, display_name, avatar_url, coins, gems, level)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Criador Luzenne'),
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
