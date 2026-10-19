import { supabase } from './supabase';
import {
  CreatorUser,
  CustomizationItem,
  PublishItemPayload,
  RoomEditorState,
  StoreAvatar,
  AvatarPoseConfig,
  PlacedObject,
} from '../types';
import { safeLocalStorageSet } from './storageUtils';
import { extractAssetUuid, getAuthenticatedApiHeaders } from './assetSyncClient';

const SHOWCASE_ROOMS_LOCAL_KEY = '3d_social_creator_lobby_rooms';

/**
 * Persists a published store item to Supabase.
 * Always stores real asset_id UUID, NEVER a signed or temporary download_url/blob.
 */
export async function persistStoreItem(
  payload: PublishItemPayload,
  user: CreatorUser | null
): Promise<{ success: boolean; id: string; error?: string }> {
  if (!Number.isInteger(payload.price) || payload.price < 0) {
    return { success: false, id: '', error: 'O preço precisa ser um número inteiro igual ou maior que zero.' };
  }
  const generatedId = payload.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.id)
    ? payload.id
    : undefined;
  const cleanAssetId = extractAssetUuid(payload.assetId || payload.originalItemId || payload.fileBlobUrl);
  if (!user || user.isGuest || !cleanAssetId) {
    return {
      success: false,
      id: '',
      error: !user || user.isGuest
        ? 'Entre com sua conta para publicar.'
        : 'O arquivo 3D precisa estar salvo no banco antes de publicar.',
    };
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || authData.user?.id !== user.id) {
      return { success: false, id: '', error: 'Sua sessão expirou. Entre novamente para publicar.' };
    }

    const itemData: any = {
      user_id: authData.user.id,
      name: payload.name,
      object_type: payload.objectType,
      price: payload.price,
      hashtags: payload.hashtags,
      thumbnail_url: payload.thumbnailUrl,
      asset_id: cleanAssetId || null,
      asset_url: cleanAssetId || null, // Guarda o UUID ou null, NUNCA download_url assinada expirável!
      rarity: payload.rarity || 'COMUM',
      description: payload.description || '',
      publish_mode: payload.publishMode,
      metadata: {
        ...(payload.metadata || {}),
        asset_id: cleanAssetId || null,
        publisher_email: user?.email?.trim().toLowerCase() || null,
        author: user?.displayName || payload.author || 'Luzenne',
        isAccessory: payload.objectType === 'acessorio',
        accessoryTransform: payload.accessoryTransform,
        actions: payload.actions || [],
        originalItemId: cleanAssetId || payload.originalItemId,
        associatedAvatarIds: payload.associatedAvatarIds || [],
        associatedAvatarNames: payload.metadata?.associatedAvatarNames || [],
      },
      is_active: true,
    };

    const query = generatedId
    ? supabase.from('store_items').update(itemData).eq('id', generatedId).eq('user_id', authData.user.id).select('id').maybeSingle()
      : supabase.from('store_items').insert(itemData).select('id').single();
    const { data, error } = await query;
    if (error || !data?.id) {
      throw error || new Error('O banco não confirmou a publicação.');
    }
    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Supabase store_items publish failed:', err?.message || err);
    return { success: false, id: '', error: 'Não foi possível salvar a publicação no banco.' };
  }
}

/**
 * Persists a showcase room to Supabase.
 * Stores asset_id UUID, never expired download_url or blob:.
 */
export async function persistShowcaseRoom(
  room: RoomEditorState,
  user: CreatorUser | null,
  options?: {
    publishMode?: 'simples' | 'avancado';
    price?: number;
    hashtags?: string[];
    thumbnailUrl?: string;
    radioUrl?: string;
    playlist?: any[];
    audioEnabled?: boolean;
  }
): Promise<{ success: boolean; id: string; error?: string }> {
  let roomId = room.id && room.id.includes('-') && room.id.length === 36
    ? room.id
    : `pub-room-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const finalThumb =
    options?.thumbnailUrl ||
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80';

  const sceneAssetId =
    extractAssetUuid(room.sceneAssetId || room.sceneAssetBlobUrl) ||
    extractAssetUuid(room.placedObjects?.find((obj) => obj.type === 'cenario'));

  // Sanitize placed_objects: extract assetId UUID and strip transient fileBlobUrl
  const cleanedPlacedObjects: PlacedObject[] = (room.placedObjects || [])
    .filter((obj) => {
      const objAssetUuid = extractAssetUuid(obj.assetId || obj.fileBlobUrl);
      return !(obj.type === 'cenario' && sceneAssetId && objAssetUuid === sceneAssetId);
    })
    .map((obj) => {
      const objAssetUuid = extractAssetUuid(obj.assetId || obj.fileBlobUrl);
      return {
        ...obj,
        assetId: objAssetUuid || obj.assetId,
        fileBlobUrl: undefined, // URLs são resolvidas sob demanda via /resolve
      };
    });

  const finalRadioUrl = options?.radioUrl || room.radioUrl || 'https://music.poprockenlinea.com/listen/poprock/radio.mp3';
  const finalPlaylist = options?.playlist || room.playlist || [];
  const finalAudioEnabled = options?.audioEnabled !== undefined ? options.audioEnabled : (room.audioEnabled ?? true);

  const showcaseRoomEntry = {
    id: roomId,
    name: room.name,
    description: `Sala criada por ${user?.displayName || 'Luzenne'}`,
    occupancy: '1/8',
    currentUsers: 1,
    maxUsers: 8,
    theme: options?.hashtags?.[0] || '#vitrine3d',
    thumb: finalThumb,
    badge: 'CRIADOR',
    isFromEditor: true,
    editorRoom: {
      ...room,
      sceneAssetId: sceneAssetId || null,
      sceneAssetBlobUrl: undefined,
      placedObjects: cleanedPlacedObjects,
      isPublished: true,
      isMissingAsset: !sceneAssetId,
      radioUrl: finalRadioUrl,
      playlist: finalPlaylist,
      audioEnabled: finalAudioEnabled,
    },
    assetId: sceneAssetId || undefined,
    isMissingAsset: !sceneAssetId,
    price: options?.price || 0,
    publishMode: options?.publishMode || 'simples',
    radioUrl: finalRadioUrl,
    playlist: finalPlaylist,
    audioEnabled: finalAudioEnabled,
    likesCount: 0,
  };

  // 1. Sync to Supabase (works for logged-in or guest users)
  try {
    const safeUserId =
      user && !user.isGuest && user.id && user.id.includes('-') && user.id.length === 36
        ? user.id
        : null;

    const payload: any = {
      user_id: safeUserId,
      name: room.name,
      title: room.name,
      description: `Sala criada por ${user?.displayName || 'Luzenne'}`,
      boundary: room.boundary,
      spots: room.spots,
      placed_objects: cleanedPlacedObjects,
      hashtags: options?.hashtags || ['#sala', '#vitrine3d'],
      price: options?.price || 0,
      publish_mode: options?.publishMode || 'simples',
      thumbnail_url: finalThumb,
      cover_url: finalThumb,
      asset_id: sceneAssetId || null,
      model_url: sceneAssetId || null, // Guarda o UUID, nunca download_url expirada!
      is_published: true,
      radio_url: finalRadioUrl,
      audio_playlist: finalPlaylist,
      audio_enabled: finalAudioEnabled,
    };

    const { data: insertedData, error: insertError } = await supabase
      .from('showcase_rooms')
      .insert([payload])
      .select();

    if (!insertError && insertedData && insertedData[0]?.id) {
      roomId = insertedData[0].id;
      showcaseRoomEntry.id = roomId;
      showcaseRoomEntry.editorRoom.id = roomId;
    }
  } catch (err: any) {
    console.warn('Supabase showcase_rooms insert fallback:', err?.message);
  }

  // 2. Persist to LocalStorage for offline resilience
  try {
    const savedRoomsRaw = localStorage.getItem(SHOWCASE_ROOMS_LOCAL_KEY);
    const roomsList = savedRoomsRaw ? JSON.parse(savedRoomsRaw) : [];
    const updated = [showcaseRoomEntry, ...roomsList.filter((r: any) => r.id !== roomId)];
    safeLocalStorageSet(SHOWCASE_ROOMS_LOCAL_KEY, JSON.stringify(updated));

    // Also update editor rooms
    const editorRoomsRaw = localStorage.getItem('3d_social_creator_rooms');
    if (editorRoomsRaw) {
      const editorRooms: RoomEditorState[] = JSON.parse(editorRoomsRaw);
      const updatedEditorRooms = editorRooms.map((r) =>
        r.id === room.id ? { ...r, name: room.name, isPublished: true, publishedAt: new Date().toISOString() } : r
      );
      safeLocalStorageSet('3d_social_creator_rooms', JSON.stringify(updatedEditorRooms));
    }
  } catch (err) {
    console.warn('Failed to update showcase rooms in localStorage:', err);
  }

  return { success: true, id: roomId };
}

/**
 * Fetch all published showcase rooms created by the user or stored locally.
 */
export async function fetchMyPublishedRooms(user: CreatorUser | null): Promise<any[]> {
  const localRaw = localStorage.getItem(SHOWCASE_ROOMS_LOCAL_KEY);
  const localList = localRaw ? JSON.parse(localRaw) : [];
  const map = new Map<string, any>();

  // 1. Tenta carregar via API do backend com acesso direto ao banco
  try {
    const res = await fetch('/api/v1/showcase-rooms');
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.rooms)) {
        json.rooms.forEach((r: any) => {
          map.set(r.id, {
            id: r.id,
            name: r.name || r.title || 'Sala 3D',
            description: r.description || 'Sala publicada',
            thumb: r.cover_url || r.thumbnail_url || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80',
            createdAt: r.created_at,
            price: r.price || 0,
            publishMode: r.publish_mode || 'simples',
            isPublished: true,
            spots: r.spots || [],
            placedObjects: r.placed_objects || [],
            boundary: r.boundary,
          });
        });
      }
    }
  } catch (apiErr) {
    console.warn('API /showcase-rooms fallback:', apiErr);
  }

  // 2. Tenta também via Supabase client
  try {
    const { data, error } = await supabase
      .from('showcase_rooms')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      data.forEach((r: any) => {
        if (!map.has(r.id)) {
          map.set(r.id, {
            id: r.id,
            name: r.name || r.title || 'Sala 3D',
            description: r.description || 'Sala publicada',
            thumb: r.cover_url || r.thumbnail_url || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80',
            createdAt: r.created_at,
            price: r.price || 0,
            publishMode: r.publish_mode || 'simples',
            isPublished: true,
            spots: r.spots || [],
            placedObjects: r.placed_objects || [],
            boundary: r.boundary,
          });
        }
      });
    }
  } catch (err: any) {
    console.warn('Supabase fetchMyPublishedRooms fallback:', err?.message);
  }

  // 3. Mescla com dados locais caso offline
  localList.forEach((r: any) => {
    if (!map.has(r.id)) {
      map.set(r.id, r);
    }
  });

  return Array.from(map.values());
}

/**
 * Fetch all published store items (avatars, accessories, clothes, poses) from Supabase across all accounts and tabs.
 * Never loads expired signed URLs or transient blob URLs directly.
 */
export async function fetchPublicStoreItems(): Promise<{
  items: CustomizationItem[];
  avatars: StoreAvatar[];
  poses: AvatarPoseConfig[];
}> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id;
    const { data, error } = await supabase
      .from('store_items')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (data && data.length > 0) {
      const items: CustomizationItem[] = [];
      const avatars: StoreAvatar[] = [];
      const poses: AvatarPoseConfig[] = [];
      const seenAssets = new Set<string>();

      for (const row of data) {
        const extractedUuid = extractAssetUuid(row);
        const hasPrice = row.price !== null && row.price !== undefined && String(row.price).trim() !== '';
        const price = Number(row.price);
        if (!row.id || !extractedUuid || seenAssets.has(extractedUuid) || !hasPrice || !Number.isFinite(price) || price < 0) continue;
        seenAssets.add(extractedUuid);
        const isOwnedByCurrentUser = Boolean(currentUserId && row.user_id === currentUserId);

        if (row.object_type === 'avatar') {
          avatars.push({
            id: row.id,
            createdAt: row.created_at || undefined,
            name: row.name,
            price,
            rarity: row.rarity || 'RARO',
            tags: row.hashtags || ['#avatar', '#3d'],
            thumb: row.thumbnail_url || '',
            author: row.metadata?.author || 'Criador',
            isUserPublished: isOwnedByCurrentUser,
            ownerUserId: row.user_id || (isOwnedByCurrentUser ? currentUserId : undefined),
            owned: isOwnedByCurrentUser,
            applied: false,
            description: row.description,
            assetId: extractedUuid || undefined,
            fileBlobUrl: undefined, // URLs assinadas são resolvidas sob demanda via /resolve
            originalItemId: extractedUuid || row.metadata?.originalItemId || row.id,
            isMissingAsset: false,
            actions: row.metadata?.actions || [],
          });
        } else if (row.object_type === 'pose') {
          poses.push({
            id: row.id,
            createdAt: row.created_at || undefined,
            name: row.name,
            applied: false,
            assetId: extractedUuid || undefined,
            originalItemId: extractedUuid || row.metadata?.originalItemId || row.id,
            sourceObjectId: row.metadata?.sourceObjectId || undefined,
            thumbnailUrl: row.thumbnail_url || '',
            description: row.description,
            price,
            owned: isOwnedByCurrentUser,
            author: row.metadata?.author || 'Criador',
            ownerUserId: row.user_id || (isOwnedByCurrentUser ? currentUserId : undefined),
            isPublishedByCreator: isOwnedByCurrentUser,
            associatedAvatarIds: row.metadata?.associatedAvatarIds || [],
            associatedAvatarNames: row.metadata?.associatedAvatarNames || [],
            access: row.metadata?.poseAccess || undefined,
            pendingAvatarKey: row.metadata?.pendingAvatarKey || undefined,
            pendingAvatarName: row.metadata?.pendingAvatarName || undefined,
            rarity: row.rarity || 'COMUM',
          });
        } else {
          const isAcessorio = row.object_type === 'acessorio' || Boolean(row.metadata?.isAccessory);
          items.push({
            id: row.id,
            storeObjectType: row.object_type,
            createdAt: row.created_at || undefined,
            code: `#${isAcessorio ? 'AC' : 'IT'}${row.id.slice(0, 3).toUpperCase()}`,
            name: row.name,
            category: isAcessorio
              ? 'acessorios'
              : row.object_type === 'moveis'
                ? 'mobilia'
                : row.object_type === 'sala'
                  ? 'salas'
                  : 'publicados',
            thumb: row.thumbnail_url || '',
            owned: isOwnedByCurrentUser,
            equipped: false,
            price,
            rarity: row.rarity || 'RARO',
            isPublishedByCreator: isOwnedByCurrentUser,
            ownerUserId: row.user_id || (isOwnedByCurrentUser ? currentUserId : undefined),
            author: row.metadata?.author || 'Criador',
            assetId: extractedUuid || undefined,
            fileBlobUrl: undefined, // URLs são resolvidas dinamicamente via /resolve
            description: row.description,
            isAccessory: isAcessorio,
            accessoryAttachment: row.metadata?.accessoryAttachment || (isAcessorio ? 'companion_float' : undefined),
            accessoryTransform: row.metadata?.accessoryTransform,
            actions: row.metadata?.actions || [],
            activeActionId: row.metadata?.actions?.[0]?.id || null,
            originalItemId: extractedUuid || row.metadata?.originalItemId || row.id,
            isMissingAsset: false,
          });
        }
      }
      return { items, avatars, poses };
    }
  } catch (err: any) {
    console.error('Supabase fetchPublicStoreItems error:', err?.message || err);
    throw err;
  }
  return { items: [], avatars: [], poses: [] };
}

/**
 * Record an item acquisition to the user's Supabase inventory table.
 */
export async function recordUserInventoryItem(
  user: CreatorUser | null,
  item: {
    storeItemId: string;
    itemCode?: string;
    itemName: string;
    itemType: string;
    thumbnailUrl?: string;
  }
): Promise<void> {
  if (!user || user.isGuest || !user.id || !item.storeItemId) {
    throw new Error('An authenticated user and store item are required.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== user.id) {
    throw authError || new Error('Authenticated user does not match inventory owner.');
  }

  const { error } = await supabase.from('user_inventory').upsert(
      {
        user_id: user.id,
        store_item_id: item.storeItemId,
        item_code: item.itemCode || `#IT${Math.floor(100 + Math.random() * 900)}`,
        item_name: item.itemName,
        item_type: item.itemType,
        thumbnail_url: item.thumbnailUrl,
        is_equipped: false,
        acquired_at: new Date().toISOString(),
      },
      { onConflict: 'user_id, store_item_id' }
    );
  if (error) throw error;
}

/**
 * Fetch all inventory items recorded for the user in Supabase.
 */
export async function fetchUserInventoryFromDatabase(
  user: CreatorUser | null
): Promise<any[]> {
  if (!user || user.isGuest) return [];
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== user.id) {
    throw authError || new Error('Authenticated user does not match inventory owner.');
  }

  const { data, error } = await supabase
    .from('user_inventory')
    .select('*')
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchUserWalletFromDatabase(user: CreatorUser | null): Promise<number> {
  if (!user || user.isGuest) {
    throw new Error('Entre com sua conta para consultar o saldo.');
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== user.id) {
    throw authError || new Error('Sua sessão expirou. Entre novamente.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('coins')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  if (!data || typeof data.coins !== 'number') {
    throw new Error('O banco não retornou o saldo da conta.');
  }
  return data.coins;
}

export async function purchaseStoreItemFromDatabase(
  user: CreatorUser | null,
  storeItemId: string
): Promise<{ coins: number; alreadyOwned: boolean }> {
  if (!user || user.isGuest) {
    throw new Error('Entre com sua conta para comprar itens.');
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== user.id) {
    throw authError || new Error('Sua sessão expirou. Entre novamente para comprar.');
  }

  const { data, error } = await supabase.rpc('purchase_store_item', {
    p_store_item_id: storeItemId,
  });
  if (error) {
    if (error.message.includes('INSUFFICIENT_COINS')) {
      throw new Error('Saldo insuficiente para comprar este item.');
    }
    if (error.message.includes('STORE_ITEM_NOT_FOUND')) {
      throw new Error('Este item não está mais disponível na loja.');
    }
    if (error.message.includes('STORE_ITEM_ASSET_MISSING')) {
      throw new Error('O arquivo 3D deste item não está disponível no banco.');
    }
    if (error.message.includes('STORE_ITEM_INVALID_PRICE')) {
      throw new Error('Este item tem um preço inválido e não pode ser comprado.');
    }
    throw error;
  }
  if (!data || typeof data.coins !== 'number') {
    throw new Error('O banco não confirmou a compra.');
  }
  return { coins: data.coins, alreadyOwned: Boolean(data.already_owned) };
}

/**
 * Fetch all published showcase rooms from Supabase across all accounts and tabs.
 * Does not fall back to localStorage as source.
 */
export async function fetchPublicShowcaseRooms(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('showcase_rooms')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const supabaseRooms = data.map((row) => {
        let extractedSceneUuid = extractAssetUuid(row);
        if (!extractedSceneUuid && Array.isArray(row.placed_objects)) {
          for (const obj of row.placed_objects) {
            if (obj.type === 'cenario') {
              extractedSceneUuid = extractAssetUuid(obj);
              if (extractedSceneUuid) break;
            }
          }
        }

        // Auto-fix row in database if asset_id was null but extracted
        if (extractedSceneUuid && !row.asset_id) {
          supabase.from('showcase_rooms').update({ asset_id: extractedSceneUuid }).eq('id', row.id).then();
        }

        // Sanitize placed_objects: strip old signed URLs / blob:
        const cleanedPlacedObjects = (row.placed_objects || [])
          .filter((obj: any) => {
            const objAssetUuid = extractAssetUuid(obj);
            return !(obj.type === 'cenario' && extractedSceneUuid && objAssetUuid === extractedSceneUuid);
          })
          .map((obj: any) => {
            const objAssetUuid = extractAssetUuid(obj);
            return {
              ...obj,
              assetId: objAssetUuid || obj.assetId,
              fileBlobUrl: undefined, // dynamically resolved via /resolve
              isMissingAsset: !objAssetUuid,
            };
          });

        const isPresetArchitecture =
          !extractedSceneUuid &&
          (row.id?.startsWith('00000000') ||
            ['SALA SERENA', 'SALÃO ESCARLATE', 'SALA DE SINUCA'].includes(row.name));

        const localLikesRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('3d_social_liked_rooms') : null;
        let likedIds: string[] = [];
        try {
          likedIds = localLikesRaw ? JSON.parse(localLikesRaw) : [];
        } catch {}

        return {
          id: row.id,
          name: row.name || row.title || 'Sala 3D',
          ownerUserId: row.user_id || undefined,
          description: row.description || `Sala criada por criador 3D`,
          occupancy: '1/8',
          currentUsers: 1,
          maxUsers: 8,
          theme: row.hashtags?.[0] || '#vitrine3d',
          thumb: row.cover_url || row.thumbnail_url || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
          badge: 'CRIADOR',
          isFromEditor: true,
          price: row.price || 0,
          publishMode: row.publish_mode || 'simples',
          assetId: extractedSceneUuid || undefined,
          isMissingAsset: !extractedSceneUuid && !isPresetArchitecture,
          radioUrl: row.radio_url || 'https://music.poprockenlinea.com/listen/poprock/radio.mp3',
          playlist: Array.isArray(row.audio_playlist) ? row.audio_playlist : [],
          audioEnabled: row.audio_enabled !== undefined ? row.audio_enabled : true,
          likesCount: Number(row.likes_count) || 0,
          isLiked: likedIds.includes(row.id),
          editorRoom: {
            id: row.id,
            name: row.name || row.title || 'Sala 3D',
            ownerUserId: row.user_id || undefined,
            sceneAssetId: extractedSceneUuid || null,
            sceneAssetBlobUrl: undefined,
            placedObjects: cleanedPlacedObjects,
            spots: row.spots || [],
            boundary: row.boundary || { x: 8, y: 3, z: 8, isConfirmed: true },
            isPublished: true,
            isMissingAsset: !extractedSceneUuid && !isPresetArchitecture,
            radioUrl: row.radio_url || 'https://music.poprockenlinea.com/listen/poprock/radio.mp3',
            playlist: Array.isArray(row.audio_playlist) ? row.audio_playlist : [],
            audioEnabled: row.audio_enabled !== undefined ? row.audio_enabled : true,
          },
        };
      });

      return supabaseRooms;
    }
  } catch (err: any) {
    console.warn('Supabase fetchPublicShowcaseRooms error:', err?.message);
  }
  return [];
}

/**
 * Toggle like for a showcase room (persists to Supabase, localStorage, and updates like count).
 */
export async function toggleRoomLike(
  roomId: string,
  userIdentifier: string = 'guest'
): Promise<{ success: boolean; likesCount: number; isLiked: boolean }> {
  const localLikesKey = '3d_social_liked_rooms';
  let likedRooms: string[] = [];
  try {
    const raw = localStorage.getItem(localLikesKey);
    likedRooms = raw ? JSON.parse(raw) : [];
  } catch {}

  const alreadyLiked = likedRooms.includes(roomId);
  const nextIsLiked = !alreadyLiked;

  if (nextIsLiked) {
    likedRooms.push(roomId);
  } else {
    likedRooms = likedRooms.filter((id) => id !== roomId);
  }
  localStorage.setItem(localLikesKey, JSON.stringify(likedRooms));

  let newCount = 0;
  try {
    const { data } = await supabase.from('showcase_rooms').select('likes_count').eq('id', roomId).single();
    const current = Number(data?.likes_count) || 0;
    newCount = Math.max(0, nextIsLiked ? current + 1 : current - 1);
    await supabase.from('showcase_rooms').update({ likes_count: newCount }).eq('id', roomId);

    if (nextIsLiked) {
      await supabase.from('room_likes').insert([{ room_id: roomId, user_identifier: userIdentifier }]);
    } else {
      await supabase.from('room_likes').delete().eq('room_id', roomId).eq('user_identifier', userIdentifier);
    }
  } catch (err) {
    console.warn('Supabase toggleRoomLike fallback:', err);
  }

  // Also update local showcase rooms cache
  try {
    const saved = localStorage.getItem('3d_social_creator_lobby_rooms');
    if (saved) {
      const list = JSON.parse(saved);
      const updated = list.map((r: any) => {
        if (r.id === roomId) {
          const count = Number(r.likesCount ?? r.likes_count ?? 0);
          return {
            ...r,
            likesCount: Math.max(0, nextIsLiked ? count + 1 : count - 1),
            isLiked: nextIsLiked,
          };
        }
        return r;
      });
      localStorage.setItem('3d_social_creator_lobby_rooms', JSON.stringify(updated));
    }
  } catch {}

  return { success: true, likesCount: newCount, isLiked: nextIsLiked };
}

/**
 * Delete a specific user uploaded inventory item from database & backend.
 */
export async function deleteRemoteInventoryItem(
  assetIdOrItemId: string,
  userId?: string
): Promise<boolean> {
  try {
    const headers = await getAuthenticatedApiHeaders(userId);
    const response = await fetch(`/api/v1/inventory/${encodeURIComponent(assetIdOrItemId)}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (e) {
    console.error('API delete inventory item failed:', e);
    return false;
  }
}

/**
 * Clear all uploaded inventory items for the user from database & backend.
 */
export async function clearAllRemoteInventory(userId?: string): Promise<boolean> {
  try {
    const headers = await getAuthenticatedApiHeaders(userId);
    const response = await fetch('/api/v1/inventory/clear-all', {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (e) {
    console.error('API clear all inventory failed:', e);
    return false;
  }
}

/**
 * Delete a published room from Supabase and local storage.
 */
export async function deletePublishedRoom(
  roomId: string,
  user: CreatorUser | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!user || user.isGuest) {
      return { success: false, error: 'Entre com sua conta para excluir a sala publicada.' };
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || authData.user?.id !== user.id) {
      throw authError || new Error('Sua sessão expirou. Entre novamente.');
    }
    const { data, error } = await supabase
      .from('showcase_rooms')
      .delete()
      .eq('id', roomId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('A sala não foi localizada na conta conectada.');

    const saved = localStorage.getItem(SHOWCASE_ROOMS_LOCAL_KEY);
    if (saved) {
      const list = JSON.parse(saved);
      const filtered = list.filter((r: any) => r.id !== roomId);
      safeLocalStorageSet(SHOWCASE_ROOMS_LOCAL_KEY, JSON.stringify(filtered));
    }
    // Also mark in editor rooms if needed
    const editorRoomsRaw = localStorage.getItem('3d_social_creator_rooms');
    if (editorRoomsRaw) {
      const editorRooms: RoomEditorState[] = JSON.parse(editorRoomsRaw);
      const updated = editorRooms.map((r) =>
        r.id === roomId ? { ...r, isPublished: false, publishedAt: undefined } : r
      );
      safeLocalStorageSet('3d_social_creator_rooms', JSON.stringify(updated));
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err instanceof Error ? err.message : 'Não foi possível excluir a sala.' };
  }
}

/**
 * Delete a published item (avatar, pose, or customization item).
 */
export async function deletePublishedItem(
  itemId: string,
  itemType: 'avatar' | 'pose' | 'item' | 'moveis' | 'sala',
  user: CreatorUser | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const [{ data: authData, error: authError }, { data: publishedItem, error: lookupError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('store_items')
        .select('id,user_id,metadata,is_active')
        .eq('id', itemId)
        .maybeSingle(),
    ]);

    if (authError) {
      return { success: false, error: `Não foi possível validar a conta: ${authError.message}` };
    }
    if (lookupError) {
      return { success: false, error: `Não foi possível localizar a publicação: ${lookupError.message}` };
    }

    if (publishedItem) {
      const currentUserId = authData.user?.id || (user && !user.isGuest ? user.id : null);
      const accountEmail = (authData.user?.email || user?.email || '').trim().toLowerCase();
      const accountName = accountEmail.split('@')[0];
      const author = String(publishedItem.metadata?.author || '').trim().toLowerCase();
      const isOwner = publishedItem.user_id
        ? Boolean(currentUserId && publishedItem.user_id === currentUserId)
        : Boolean(
            (accountEmail &&
              String(publishedItem.metadata?.publisher_email || '').trim().toLowerCase() === accountEmail) ||
              (accountName && author === accountName)
          );

      if (!isOwner) {
        return { success: false, error: 'Esta publicação não pertence à conta conectada.' };
      }

      if (publishedItem.is_active) {
        let updateQuery = supabase
          .from('store_items')
          .update({ is_active: false })
          .eq('id', itemId);

        updateQuery = publishedItem.user_id
          ? updateQuery.eq('user_id', publishedItem.user_id)
          : publishedItem.metadata?.publisher_email
            ? updateQuery.eq('metadata->>publisher_email', publishedItem.metadata.publisher_email)
            : updateQuery.eq('metadata->>author', publishedItem.metadata?.author);

        const { data: deactivated, error: updateError } = await updateQuery.select('id');
        if (updateError) {
          return { success: false, error: `Não foi possível remover o item da loja: ${updateError.message}` };
        }
        if (!deactivated?.length) {
          return { success: false, error: 'O item não foi removido da loja; atualize a página e tente novamente.' };
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    console.warn('Supabase delete store_item error:', err?.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate standard PostgreSQL / Supabase INSERT scripts for published rooms and items,
 * allowing the creator to easily copy & paste into their Supabase SQL editor!
 */
export function generateSqlPersistenceScript(
  publishedRooms: any[] = [],
  publishedItems: {
    avatars?: any[];
    customizationItems?: any[];
    poses?: any[];
  } = {}
): string {
  const timestamp = new Date().toISOString();
  let sql = `-- ==============================================================================
-- SCRIPT DE PERSISTÊNCIA SQL — 3D SOCIAL CREATOR (SUPABASE / POSTGRESQL)
-- Gerado em: ${timestamp}
-- Cole este script no "SQL Editor" do Supabase para persistir suas salas e itens!
-- ==============================================================================

-- 0. GARANTIR SUPORTE AO TIPO 'acessorio' E PERMISSÕES PÚBLICAS
DO $$
BEGIN
    ALTER TABLE public.store_items DROP CONSTRAINT IF EXISTS store_items_object_type_check;
    ALTER TABLE public.store_items ADD CONSTRAINT store_items_object_type_check CHECK (object_type IN ('avatar', 'acessorio', 'item', 'pose', 'sala', 'moveis'));
EXCEPTION
    WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS "Itens ativos da loja são visíveis por todos" ON public.store_items;
CREATE POLICY "Itens ativos da loja são visíveis por todos" ON public.store_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Criadores podem publicar itens na loja" ON public.store_items;
CREATE POLICY "Criadores podem publicar itens na loja" ON public.store_items FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Salas da vitrine são visíveis por todos" ON public.showcase_rooms;
CREATE POLICY "Salas da vitrine são visíveis por todos" ON public.showcase_rooms FOR SELECT USING (true);
DROP POLICY IF EXISTS "Criadores podem publicar salas na vitrine" ON public.showcase_rooms;
CREATE POLICY "Criadores podem publicar salas na vitrine" ON public.showcase_rooms FOR INSERT WITH CHECK (true);

`;

  if (publishedRooms.length > 0) {
    sql += `-- 1. PERSISTÊNCIA DAS SALAS PUBLICADAS (SHOWCASE ROOMS)\n`;
    for (const r of publishedRooms) {
      const safeId = r.id?.includes('-') && r.id.length === 36 ? `'${r.id}'` : `gen_random_uuid()`;
      const name = (r.name || 'Sala 3D').replace(/'/g, "''");
      const desc = (r.description || `Sala publicada no 3D Social Studio`).replace(/'/g, "''");
      const boundaryJson = JSON.stringify(r.boundary || r.editorRoom?.boundary || { x: 10, y: 4, z: 10 }).replace(/'/g, "''");
      const spotsJson = JSON.stringify(r.spots || r.editorRoom?.spots || []).replace(/'/g, "''");
      const objectsJson = JSON.stringify(r.placed_objects || r.editorRoom?.placedObjects || []).replace(/'/g, "''");
      const price = Number(r.price) || 0;
      const hashtags = (r.hashtags || ['#vitrine3d', '#sala']).map((h: string) => `'${h.replace(/'/g, "''")}'`).join(', ');

      sql += `INSERT INTO public.showcase_rooms (
    id, name, description, boundary, spots, placed_objects, hashtags, price, is_published, created_at
) VALUES (
    ${safeId},
    '${name}',
    '${desc}',
    '${boundaryJson}'::jsonb,
    '${spotsJson}'::jsonb,
    '${objectsJson}'::jsonb,
    ARRAY[${hashtags}],
    ${price},
    true,
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    boundary = EXCLUDED.boundary,
    spots = EXCLUDED.spots,
    placed_objects = EXCLUDED.placed_objects,
    price = EXCLUDED.price,
    updated_at = NOW();\n\n`;
    }
  }

  const avatars = (publishedItems.avatars || []).filter((a) => a.isUserPublished);
  const items = (publishedItems.customizationItems || []).filter((i) => i.isPublishedByCreator);
  const poses = (publishedItems.poses || []).filter((p) => p.isPublishedByCreator);

  if (avatars.length > 0 || items.length > 0 || poses.length > 0) {
    sql += `-- 2. PERSISTÊNCIA DOS ITENS DA LOJA (STORE ITEMS)\n`;

    for (const a of avatars) {
      const name = (a.name || 'Avatar 3D').replace(/'/g, "''");
      const price = Number(a.price) || 0;
      const rarity = a.rarity || 'RARO';
      const thumb = a.thumb?.replace(/'/g, "''") || '';
      const tags = (a.tags || ['#avatar', '#3d']).map((t: string) => `'${t.replace(/'/g, "''")}'`).join(', ');

      sql += `INSERT INTO public.store_items (
    name, object_type, price, hashtags, thumbnail_url, rarity, description, is_active, created_at
) VALUES (
    '${name}',
    'avatar',
    ${price},
    ARRAY[${tags}],
    '${thumb}',
    '${rarity}',
    'Avatar criado e publicado pelo usuário.',
    true,
    NOW()
);\n`;
    }

    for (const item of items) {
      const name = (item.name || 'Item 3D').replace(/'/g, "''");
      const price = Number(item.price) || 0;
      const rarity = item.rarity || 'COMUM';
      const thumb = item.thumb?.replace(/'/g, "''") || '';
      const isAcessorio = item.isAccessory || item.category === 'acessorios';
      const objType = isAcessorio ? 'acessorio' : item.category === 'outros' ? 'moveis' : 'item';
      const metaJson = JSON.stringify({
        isAccessory: isAcessorio,
        accessoryAttachment: item.accessoryAttachment,
        accessoryTransform: item.accessoryTransform,
        actions: item.actions || [],
      }).replace(/'/g, "''");

      sql += `INSERT INTO public.store_items (
    name, object_type, price, hashtags, thumbnail_url, rarity, description, metadata, is_active, created_at
) VALUES (
    '${name}',
    '${objType}',
    ${price},
    ARRAY['#${objType}', '#3d'],
    '${thumb}',
    '${rarity}',
    '${(item.description || '').replace(/'/g, "''")}',
    '${metaJson}'::jsonb,
    true,
    NOW()
);\n`;
    }

    for (const p of poses) {
      const name = (p.name || 'Pose 3D').replace(/'/g, "''");
      const price = Number(p.price) || 0;
      const rarity = p.rarity || 'COMUM';
      const thumb = p.thumbnailUrl?.replace(/'/g, "''") || '';

      sql += `INSERT INTO public.store_items (
    name, object_type, price, hashtags, thumbnail_url, rarity, description, is_active, created_at
) VALUES (
    '${name}',
    'pose',
    ${price},
    ARRAY['#pose', '#avatar'],
    '${thumb}',
    '${rarity}',
    'Pose personalizada para avatares.',
    true,
    NOW()
);\n`;
    }
  }

  sql += `\n-- Fim do script de persistência. Suas salas e itens agora estarão salvos no Supabase!`;
  return sql;
}
