import React, { useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { CreatorHeader } from './components/CreatorHeader';
import { CreatorSidebar } from './components/CreatorSidebar';
import { CreatorEditorCanvas3D } from './components/CreatorEditorCanvas3D';
import { UploadGLBModal } from './components/UploadGLBModal';
import { BoundaryModal } from './components/BoundaryModal';
import { AuthModal } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { AudioUploadModal } from './components/AudioUploadModal';
import { PublishModal } from './components/PublishModal';
import { PublishItemModal } from './components/PublishItemModal';
import { MyPublicationsModal } from './components/MyPublicationsModal';
import { SpotVisualConfigModal } from './components/SpotVisualConfigModal';
import { TrajectoryTimelineModal } from './components/TrajectoryTimelineModal';
import { ProjectSaveRestoreModal } from './components/ProjectSaveRestoreModal';
import { LobbyView } from './components/LobbyView';
import { RoomView } from './components/RoomView';
import { FriendsModal, OnlineLobbyUser } from './components/FriendsModal';
import type { RoomStoreProduct } from './components/RoomStoreShowroom3D';
import { UserCustomizationView } from './components/UserCustomizationView';
import { INITIAL_ROOMS } from './data/creatorData';
import { INITIAL_ROOMS as INITIAL_LOBBY_ROOMS } from './data/initialData';
import {
  RoomEditorState,
  PlacedObject,
  InventoryItem,
  GizmoEditMode,
  SpotItem,
  SpotType,
  PlayableBoundary,
  CreatorUser,
  RoomData,
  CustomizationItem,
  StoreAvatar,
  AvatarPoseConfig,
  StoreObjectType,
  SpotMotionConfig,
  SpotVisualConfig,
  ObjectAction,
  AccessoryAttachmentPoint,
  AccessoryTransform,
  RoomAccessSlot,
  RoomMovementSettings,
} from './types';
import { supabase } from './lib/supabase';
import { addOrAcceptFriend, fetchFriendConnections, FriendConnection } from './lib/friends';
import { persistStoreItem, persistShowcaseRoom, fetchPublicStoreItems, fetchPublicShowcaseRooms, fetchUserInventoryFromDatabase, fetchUserAudioAssets, markUserAudioAssetPublished, fetchUserWalletFromDatabase, purchaseStoreItemFromDatabase, recordUserInventoryItem, deleteRemoteInventoryItem, clearAllRemoteInventory, fetchWishlistStoreItemIds, setWishlistStoreItem, purchaseStoreItemAsGift } from './lib/database';
import { getGlbFile, saveGlbFile, deleteGlbFile, clearAllGlbFiles } from './lib/storageIndexedDB';
import { safeLocalStorageSet, sanitizeItemsForStorage } from './lib/storageUtils';
import { fetchRemoteInventory } from './lib/assetSyncClient';
import { Lightbulb, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import { StoreSocialModal, StoreSocialModalState } from './components/StoreSocialModal';
import { BonePoseEditor } from './components/BonePoseEditor';
import { TransferBonesModal } from './components/TransferBonesModal';

const getStoredCreatorUserId = () => {
  try {
    const savedUser = JSON.parse(localStorage.getItem('3d_social_creator_user') || 'null');
    return typeof savedUser?.id === 'string' && savedUser.id ? savedUser.id : 'guest';
  } catch {
    return 'guest';
  }
};

const activeAvatarStorageKey = (userId: string) => `3d_social_creator_active_avatar_id:${userId}`;
const accountDataStorageKey = (userId: string) => `3d_social_account_data:${userId}`;
const poseActionAttachmentStorageKey = (userId: string) =>
  `3d_social_pose_action_attachments:${userId}`;
const poseActionExclusionStorageKey = (userId: string) =>
  `3d_social_pose_action_exclusions:${userId}`;
const localBonePoseStorageKey = (userId: string) =>
  `3d_social_local_bone_poses:${userId}`;
const magneticSnapDefaultMigrationKey = (userId: string) =>
  `3d_social_room_movement_magnetic_default_v1:${userId}`;

const dedupeInventoryPoses = (items: InventoryItem[]) => {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  return items.filter((item) => {
    if (item.type.toLowerCase() !== 'pose') return true;

    const identifiers = [item.assetId, item.sourceObjectId, item.id].filter(
      (value): value is string => Boolean(value)
    );
    const name = (item.displayName || item.name || item.fileName).trim().toLocaleLowerCase();
    const duplicate =
      identifiers.some((identifier) => seenIds.has(identifier)) ||
      (name.length > 0 && seenNames.has(name));

    if (duplicate) return false;
    identifiers.forEach((identifier) => seenIds.add(identifier));
    if (name) seenNames.add(name);
    return true;
  });
};

const dedupeAvatarPoses = (poses: AvatarPoseConfig[]) => {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  return poses.filter((pose) => {
    const identifiers = [pose.assetId, pose.sourceObjectId, pose.originalItemId, pose.id].filter(
      (value): value is string => Boolean(value)
    );
    const name = pose.name.trim().toLocaleLowerCase();
    const duplicate =
      identifiers.some((identifier) => seenIds.has(identifier)) ||
      (name.length > 0 && seenNames.has(name));

    if (duplicate) return false;
    identifiers.forEach((identifier) => seenIds.add(identifier));
    if (name) seenNames.add(name);
    return true;
  });
};

const DEFAULT_ROOM_MOVEMENT_SETTINGS: RoomMovementSettings = {
  showSpotArrows: true,
  clickSpotsEnabled: true,
  freeMoveEnabled: true,
  teleportOnSpotClick: false,
  alternateAxisWalking: false,
  magneticSnapEnabled: true,
  cameraSensitivity: 1.4,
  movementDuration: 2,
};

export const App: React.FC = () => {
  // Navigation State between Editor, Rooms Lobby, Social Room, and User Customization/Loja
  const [currentScreen, setCurrentScreen] = useState<'editor' | 'lobby' | 'room' | 'customization'>('lobby');
  const [customizationInitialTab, setCustomizationInitialTab] = useState<'loja' | 'inventario' | 'poses'>('inventario');
  const [customizationPreviewItemId, setCustomizationPreviewItemId] = useState<string | null>(null);
  const [customizationPreviewAvatarId, setCustomizationPreviewAvatarId] = useState<string | null>(null);
  const [lobbyRoomIndex, setLobbyRoomIndex] = useState<number>(1);
  const [selectedLobbyRoom, setSelectedLobbyRoom] = useState<RoomData | null>(null);
  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineLobbyUser[]>([]);
  const [onlinePresenceReady, setOnlinePresenceReady] = useState(false);
  const [friendConnections, setFriendConnections] = useState<FriendConnection[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [storeSocialModal, setStoreSocialModal] = useState<StoreSocialModalState | null>(null);
  const [wishlistItemIds, setWishlistItemIds] = useState<string[]>([]);
  const [socialWishlistItemIds, setSocialWishlistItemIds] = useState<string[]>([]);
  const [isSocialWishlistLoading, setIsSocialWishlistLoading] = useState(false);
  const [incomingRoomInvite, setIncomingRoomInvite] = useState<{
    senderName: string;
    roomId: string;
    roomName: string;
    roomData?: RoomData;
    ownerSessionId?: string;
  } | null>(null);
  const appSessionId = React.useMemo(() => crypto.randomUUID(), []);
  const onlineChannelRef = React.useRef<any>(null);
  const onlineChannelReadyRef = React.useRef(false);
  const onlinePresenceRef = React.useRef<{
    userId?: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
    roomId?: string;
    roomName?: string;
  }>({ displayName: 'Visitante' });

  const [customizationItems, setCustomizationItems] = useState<CustomizationItem[]>([]);
  const [storeAvatars, setStoreAvatars] = useState<StoreAvatar[]>([]);
  const [roomStoreCatalog, setRoomStoreCatalog] = useState<RoomStoreProduct[]>([]);
  const [activeAvatarId, setActiveAvatarId] = useState('');

  const activeUserAvatar =
    storeAvatars.find(
      (avatar) =>
        avatar.id === activeAvatarId ||
        avatar.originalItemId === activeAvatarId ||
        avatar.assetId === activeAvatarId
    ) || null;

  const [avatarPoses, setAvatarPoses] = useState<AvatarPoseConfig[]>([]);
  const [poseActionAttachments, setPoseActionAttachments] = useState<Record<string, ObjectAction[]>>({});
  const [poseActionExclusions, setPoseActionExclusions] = useState<Record<string, string[]>>({});

  // Room Access Inventory (Slots 1-8 de Acesso Rápido para Rooms)
  const [roomAccessSlots, setRoomAccessSlots] = useState<RoomAccessSlot[]>(() => {
    const saved = localStorage.getItem(`3d_social_room_access_inventory:${getStoredCreatorUserId()}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  const handleUpdateRoomAccessSlots = (newSlots: RoomAccessSlot[]) => {
    setRoomAccessSlots(newSlots);
    safeLocalStorageSet(
      `3d_social_room_access_inventory:${user?.id || 'guest'}`,
      JSON.stringify(newSlots)
    );
  };

  // Rooms State (Room A | Room B | + Nova room)
  const [rooms, setRooms] = useState<RoomEditorState[]>(() => {
    const saved = localStorage.getItem('3d_social_creator_rooms');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_ROOMS;
      }
    }
    return INITIAL_ROOMS;
  });

  const [activeRoomId, setActiveRoomId] = useState<string>('room-a');
  const [publicShowcaseRooms, setPublicShowcaseRooms] = useState<RoomData[]>([]);

  const loadPublicShowcaseRooms = async () => {
    try {
      const fetched = await fetchPublicShowcaseRooms();
      if (fetched && fetched.length > 0) {
        setPublicShowcaseRooms(fetched);
      }
    } catch (err) {
      console.warn('Error fetching public showcase rooms:', err);
    }
  };

  useEffect(() => {
    loadPublicShowcaseRooms();
    if (currentScreen === 'lobby') {
      const interval = setInterval(() => {
        loadPublicShowcaseRooms();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [currentScreen]);

  // Inventory State (GLB files uploaded) - persiste localmente e sincroniza com backend
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [walletCoins, setWalletCoins] = useState<number | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const attachableActionInventory = inventory.flatMap((item) => {
    const sourceStoreItemId = item.storeItemId || item.id;
    if (item.isActionAsset && item.actions?.length) {
      return [{
        ...item,
        actions: item.actions.map((action) => ({
          ...action,
          sourceStoreItemId: action.sourceStoreItemId || sourceStoreItemId,
        })),
      }];
    }
    if (item.isAudio && item.audioUrl) {
      return [{
        ...item,
        isActionAsset: true,
        actions: [{
          id: `audio-action-${sourceStoreItemId}`,
          name: item.displayName || item.name || 'Action de áudio',
          kind: 'audio' as const,
          audioUrl: item.audioUrl,
          audioIsRadio: item.audioIsRadio,
          sourceStoreItemId,
          motion: {
            enabled: true,
            deltaPosition: [0, 0, 0] as [number, number, number],
            speed: 1,
            loop: false,
            target: 'parent_object' as const,
          },
        }],
      }];
    }
    return [];
  });
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const loadedStoreAccountIdRef = React.useRef<string | null>(null);

  // User Auth State
  const [user, setUser] = useState<CreatorUser | null>(null);
  onlinePresenceRef.current = {
    ...(user && !user.isGuest ? { userId: user.id } : {}),
    displayName: user?.displayName || 'Visitante',
    ...(user?.username ? { username: user.username } : {}),
    ...(user?.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(currentScreen === 'room' && selectedLobbyRoom
      ? { roomId: selectedLobbyRoom.id, roomName: selectedLobbyRoom.name }
      : {}),
  };

  const trackOnlinePresence = () => {
    if (!onlineChannelRef.current || !onlineChannelReadyRef.current) return;
    void onlineChannelRef.current.track({
      sessionId: appSessionId,
      ...onlinePresenceRef.current,
    }).then((status: string) => {
      if (status !== 'ok') console.warn('[Online presence] Presence update failed:', { status });
    }).catch((error: unknown) => {
      console.warn('[Online presence] Presence update rejected:', error);
    });
  };

  useEffect(() => {
    const channel = supabase.channel('social-online-users', {
      config: { presence: { key: appSessionId } },
    });
    onlineChannelRef.current = channel;
    const syncOnlineUsers = () => {
      const nextUsers: OnlineLobbyUser[] = [];
      const state = channel.presenceState();
      Object.entries(state).forEach(([sessionId, entries]) => {
        if (sessionId === appSessionId || !entries.length) return;
        const latest = entries[entries.length - 1] as Record<string, unknown>;
        if (typeof latest.displayName !== 'string') return;
        nextUsers.push({
          sessionId,
          ...(typeof latest.userId === 'string' ? { userId: latest.userId } : {}),
          displayName: latest.displayName,
          ...(typeof latest.username === 'string' ? { username: latest.username } : {}),
          ...(typeof latest.avatarUrl === 'string' ? { avatarUrl: latest.avatarUrl } : {}),
          ...(typeof latest.roomId === 'string' ? { roomId: latest.roomId } : {}),
          ...(typeof latest.roomName === 'string' ? { roomName: latest.roomName } : {}),
        });
      });
      const uniqueUsers = new Map<string, OnlineLobbyUser>();
      nextUsers.forEach((onlineUser) => {
        const key = onlineUser.userId || onlineUser.sessionId;
        const existing = uniqueUsers.get(key);
        if (!existing || (!existing.roomId && onlineUser.roomId)) {
          uniqueUsers.set(key, onlineUser);
        }
      });
      setOnlineUsers(Array.from(uniqueUsers.values()).sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      ));
      setOnlinePresenceReady(true);
    };

    channel
      .on('presence', { event: 'sync' }, syncOnlineUsers)
      .on('broadcast', { event: 'room-invite' }, ({ payload }) => {
        const addressedToSession =
          typeof payload?.recipientSessionId === 'string' &&
          payload.recipientSessionId === appSessionId;
        const addressedToUser =
          typeof payload?.recipientUserId === 'string' &&
          payload.recipientUserId === user?.id;
        const invitedRoom = payload?.roomData;
        const isValidPrivateRoom =
          invitedRoom &&
          typeof invitedRoom === 'object' &&
          invitedRoom.isPrivate === true &&
          invitedRoom.id === payload.roomId &&
          invitedRoom.privateOwnerSessionId === payload.ownerSessionId &&
          typeof invitedRoom.name === 'string' &&
          typeof invitedRoom.description === 'string';
        if (
          !payload ||
          (!addressedToSession && !addressedToUser) ||
          typeof payload.roomId !== 'string' ||
          typeof payload.roomName !== 'string'
        ) return;
        setIncomingRoomInvite({
          senderName: typeof payload.senderName === 'string' ? payload.senderName : 'Um usuário',
          roomId: payload.roomId,
          roomName: payload.roomName,
          ...(isValidPrivateRoom ? { roomData: invitedRoom as RoomData } : {}),
          ...(typeof payload.ownerSessionId === 'string'
            ? { ownerSessionId: payload.ownerSessionId }
            : {}),
        });
      })
      .subscribe((status) => {
        if (onlineChannelRef.current !== channel) return;
        onlineChannelReadyRef.current = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') trackOnlinePresence();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Online presence] Channel subscription failed:', { status });
        }
      });

    return () => {
      onlineChannelReadyRef.current = false;
      setOnlinePresenceReady(false);
      supabase.removeChannel(channel);
      onlineChannelRef.current = null;
      setOnlineUsers([]);
    };
  }, [appSessionId, user?.id]);

  useEffect(() => {
    trackOnlinePresence();
  }, [currentScreen, selectedLobbyRoom?.id, selectedLobbyRoom?.name, user?.displayName, user?.username, user?.avatarUrl, user?.id]);

  useEffect(() => {
    const privateRoom = selectedLobbyRoom;
    if (
      !onlinePresenceReady ||
      currentScreen !== 'room' ||
      !privateRoom?.isPrivate ||
      !privateRoom.privateOwnerSessionId ||
      privateRoom.privateOwnerSessionId === appSessionId ||
      onlineUsers.some(
        (onlineUser) =>
          onlineUser.sessionId === privateRoom.privateOwnerSessionId &&
          onlineUser.roomId === privateRoom.id
      )
    ) return;
    setCurrentScreen('lobby');
    setSelectedLobbyRoom(null);
    showToast('A sala privada foi encerrada porque o dono saiu.');
  }, [onlinePresenceReady, onlineUsers, currentScreen, selectedLobbyRoom?.id, appSessionId]);

  useEffect(() => {
    if (!user || user.isGuest || user.id.startsWith('local-')) {
      setFriendConnections([]);
      setIsLoadingFriends(false);
      return;
    }
    let cancelled = false;
    setIsLoadingFriends(true);
    fetchFriendConnections(user)
      .then((connections) => {
        if (!cancelled) setFriendConnections(connections);
      })
      .catch((error: unknown) => {
        console.error('Failed to load friend connections:', error);
        if (!cancelled) showToast('Não foi possível carregar sua lista de amigos.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFriends(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || user.isGuest || user.id.startsWith('local-')) {
      setWishlistItemIds([]);
      return;
    }
    let cancelled = false;
    fetchWishlistStoreItemIds(user)
      .then((ids) => {
        if (!cancelled) setWishlistItemIds(ids);
      })
      .catch((error: unknown) => {
        console.error('Failed to load wishlist:', error);
        if (!cancelled) showToast('Não foi possível carregar sua wishlist.');
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || user.isGuest || user.id.startsWith('local-')) return;
    const channel = supabase
    .channel(`inventory-updates:${user.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'user_inventory',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        setInventoryRevision((revision) => revision + 1);
        if (payload.new?.gift_from_user_id) {
          showToast('Você recebeu um presente! Confira seu inventário.');
        }
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Inventory realtime] Subscription failed:', { status });
      }
    });
    return () => {
    void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!storeSocialModal || storeSocialModal.type === 'friend-gift' || !user || user.isGuest) {
      setSocialWishlistItemIds([]);
      setIsSocialWishlistLoading(false);
      return;
    }
    if (storeSocialModal.type === 'wishlist') {
      setSocialWishlistItemIds(wishlistItemIds);
      setIsSocialWishlistLoading(false);
      return;
    }
    let cancelled = false;
    setIsSocialWishlistLoading(true);
    fetchWishlistStoreItemIds(user, storeSocialModal.userId)
      .then((ids) => {
        if (!cancelled) setSocialWishlistItemIds(ids);
      })
      .catch((error: unknown) => {
        console.error('Failed to load public wishlist:', error);
        if (!cancelled) {
          setSocialWishlistItemIds([]);
          showToast('Não foi possível carregar a wishlist deste usuário.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsSocialWishlistLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeSocialModal, user?.id, wishlistItemIds]);

  const [roomMovementSettings, setRoomMovementSettings] =
    useState<RoomMovementSettings>(DEFAULT_ROOM_MOVEMENT_SETTINGS);
  const loadedMovementSettingsKeyRef = React.useRef<string | null>(null);
  const movementSettingsStorageKey = `3d_social_room_movement:${user?.id || 'guest'}`;

  useEffect(() => {
    const storageKey = `3d_social_room_movement:${user?.id || 'guest'}`;
    const magneticDefaultAlreadyApplied =
      localStorage.getItem(magneticSnapDefaultMigrationKey(user?.id || 'guest')) === 'true';
    let savedSettings: Partial<RoomMovementSettings> = {};
    let legacyDuration: number | undefined;
    try {
      const savedValue = localStorage.getItem(storageKey);
      const parsed = savedValue ? JSON.parse(savedValue) : {};
      if (parsed && typeof parsed === 'object') {
        savedSettings = parsed as Partial<RoomMovementSettings>;
      } else if (typeof parsed === 'number') {
        legacyDuration = parsed;
      }
    } catch {
      const parsedDuration = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(parsedDuration)) legacyDuration = parsedDuration;
    }

    const savedDuration = Number(savedSettings.movementDuration ?? legacyDuration);
    setRoomMovementSettings({
      showSpotArrows:
        typeof savedSettings.showSpotArrows === 'boolean'
          ? savedSettings.showSpotArrows
          : DEFAULT_ROOM_MOVEMENT_SETTINGS.showSpotArrows,
      clickSpotsEnabled:
        typeof savedSettings.clickSpotsEnabled === 'boolean'
          ? savedSettings.clickSpotsEnabled
          : DEFAULT_ROOM_MOVEMENT_SETTINGS.clickSpotsEnabled,
      freeMoveEnabled:
        typeof savedSettings.freeMoveEnabled === 'boolean'
          ? savedSettings.freeMoveEnabled
          : DEFAULT_ROOM_MOVEMENT_SETTINGS.freeMoveEnabled,
      teleportOnSpotClick:
        typeof savedSettings.teleportOnSpotClick === 'boolean'
          ? savedSettings.teleportOnSpotClick
          : DEFAULT_ROOM_MOVEMENT_SETTINGS.teleportOnSpotClick,
      alternateAxisWalking:
        typeof savedSettings.alternateAxisWalking === 'boolean'
          ? savedSettings.alternateAxisWalking
          : DEFAULT_ROOM_MOVEMENT_SETTINGS.alternateAxisWalking,
      magneticSnapEnabled:
        !magneticDefaultAlreadyApplied
          ? DEFAULT_ROOM_MOVEMENT_SETTINGS.magneticSnapEnabled
          : typeof savedSettings.magneticSnapEnabled === 'boolean'
          ? savedSettings.magneticSnapEnabled
          : DEFAULT_ROOM_MOVEMENT_SETTINGS.magneticSnapEnabled,
      cameraSensitivity: Number.isFinite(Number(savedSettings.cameraSensitivity))
        ? Math.max(0.5, Math.min(2.5, Number(savedSettings.cameraSensitivity)))
        : DEFAULT_ROOM_MOVEMENT_SETTINGS.cameraSensitivity,
      movementDuration: Number.isFinite(savedDuration)
        ? Math.max(0.5, Math.min(8, savedDuration))
        : DEFAULT_ROOM_MOVEMENT_SETTINGS.movementDuration,
    });
    if (!magneticDefaultAlreadyApplied) {
      safeLocalStorageSet(magneticSnapDefaultMigrationKey(user?.id || 'guest'), 'true');
    }
    loadedMovementSettingsKeyRef.current = storageKey;
  }, [user?.id]);

  useEffect(() => {
    if (loadedMovementSettingsKeyRef.current !== movementSettingsStorageKey) return;
    safeLocalStorageSet(movementSettingsStorageKey, JSON.stringify(roomMovementSettings));
  }, [movementSettingsStorageKey, roomMovementSettings]);

  const accountDataOwnerRef = React.useRef(getStoredCreatorUserId());
  const [accountDataReadyForUser, setAccountDataReadyForUser] = useState('');
  const accountDataRef = React.useRef({
    rooms,
    activeRoomId,
    roomAccessSlots,
  });
  accountDataRef.current = {
    rooms,
    activeRoomId,
    roomAccessSlots,
  };

  useEffect(() => {
    const accountId = user?.id || 'guest';
    const previousAccountId = accountDataOwnerRef.current;
    if (previousAccountId !== accountId) {
      safeLocalStorageSet(
        accountDataStorageKey(previousAccountId),
        JSON.stringify(accountDataRef.current)
      );
    }

    const savedData = localStorage.getItem(accountDataStorageKey(accountId));
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setRooms(Array.isArray(parsed.rooms) ? parsed.rooms : INITIAL_ROOMS);
        setActiveRoomId(typeof parsed.activeRoomId === 'string' ? parsed.activeRoomId : 'room-a');
        setRoomAccessSlots(Array.isArray(parsed.roomAccessSlots) ? parsed.roomAccessSlots : []);
      } catch (error) {
        console.warn('Não foi possível carregar os dados locais desta conta:', error);
        setRooms(INITIAL_ROOMS);
        setActiveRoomId('room-a');
        setRoomAccessSlots([]);
      }
    } else if (previousAccountId !== accountId) {
      setRooms(INITIAL_ROOMS);
      setActiveRoomId('room-a');
      setRoomAccessSlots([]);
    } else {
      safeLocalStorageSet(
        accountDataStorageKey(accountId),
        JSON.stringify(accountDataRef.current)
      );
    }

    accountDataOwnerRef.current = accountId;
    setAccountDataReadyForUser(accountId);
    setCustomizationItems([]);
    setStoreAvatars([]);
    setAvatarPoses([]);
    try {
      const savedAttachments = JSON.parse(
        localStorage.getItem(poseActionAttachmentStorageKey(user?.id || 'guest')) || '{}'
      );
      setPoseActionAttachments(
        savedAttachments && typeof savedAttachments === 'object' ? savedAttachments : {}
      );
      const savedExclusions = JSON.parse(
        localStorage.getItem(poseActionExclusionStorageKey(user?.id || 'guest')) || '{}'
      );
      setPoseActionExclusions(
        savedExclusions && typeof savedExclusions === 'object' ? savedExclusions : {}
      );
    } catch (error) {
      console.warn('Não foi possível carregar as actions anexadas às poses:', error);
      setPoseActionAttachments({});
    }
    setInventory([]);
    setWalletCoins(null);
    setActiveAvatarId('');
    setStoreError(null);
    setInventoryError(null);
  }, [user?.id]);

  useEffect(() => {
    const accountId = user?.id || 'guest';
    if (accountDataReadyForUser !== accountId) return;
    safeLocalStorageSet(
      accountDataStorageKey(accountId),
      JSON.stringify(accountDataRef.current)
    );
  }, [
    accountDataReadyForUser,
    user?.id,
    rooms,
    activeRoomId,
    roomAccessSlots,
  ]);

  useEffect(() => {
    const accountId = user?.id || 'guest';
    const savedAvatarId = localStorage.getItem(activeAvatarStorageKey(accountId)) || '';
    setActiveAvatarId(savedAvatarId);
    const savedSlots = localStorage.getItem(`3d_social_room_access_inventory:${accountId}`);
    try {
      setRoomAccessSlots(savedSlots ? JSON.parse(savedSlots) : []);
    } catch (error) {
      console.warn('Não foi possível carregar os slots de acesso desta conta:', error);
      setRoomAccessSlots([]);
    }
  }, [user?.id]);

  // Required Top Controls:
  // 1. Toggle MODO AVATAR: ligado = clicar nos spots como visitante (teleporta). desligado = edição completa com Gizmo.
  const [isAvatarMode, setIsAvatarMode] = useState<boolean>(false);

  // 2. Ícone OLHO: liga/desliga o ghost do LIMITE jogável. Padrão OFF.
  const [showBoundaryGhost, setShowBoundaryGhost] = useState<boolean>(false);

  // Selection & 3D Editing State
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>('spot-2');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [bonePoseEditorAvatar, setBonePoseEditorAvatar] = useState<StoreAvatar | null>(null);
  const [isTransferBonesOpen, setIsTransferBonesOpen] = useState(false);
  const [customAvatarObjectId, setCustomAvatarObjectId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [activeGizmoMode, setActiveGizmoMode] = useState<GizmoEditMode>('mover');
  const [insertionCursorPoint, setInsertionCursorPoint] = useState<[number, number, number] | null>(null);
  const [avatarCurrentSpotId, setAvatarCurrentSpotId] = useState<string | null>('spot-2');
  const [is16x9MockupMode, setIs16x9MockupMode] = useState<boolean>(true);
  const [showSpots, setShowSpots] = useState<boolean>(true);
  const [lockSpots, setLockSpots] = useState<boolean>(false);

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAudioUploadModalOpen, setIsAudioUploadModalOpen] = useState(false);
  const [isBoundaryModalOpen, setIsBoundaryModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPublishItemModalOpen, setIsPublishItemModalOpen] = useState(false);
  const [isMyPublicationsModalOpen, setIsMyPublicationsModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectModalInitialTab, setProjectModalInitialTab] = useState<'export' | 'import'>('export');
  const [publishingItem, setPublishingItem] = useState<InventoryItem | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setStatusToast(message);
    setTimeout(() => {
      setStatusToast(null);
    }, 3200);
  };

  // Spot Visualization Config State (white pulse, yellow, arrow only, sizes)
  const [spotVisualConfig, setSpotVisualConfig] = useState<SpotVisualConfig>(() => {
    const saved = localStorage.getItem('3d_social_spot_visual_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return {
      indicatorStyle: 'full',
      arrowScale: 1.0,
      signalScale: 1.0,
    };
  });

  useEffect(() => {
    safeLocalStorageSet('3d_social_spot_visual_config', JSON.stringify(spotVisualConfig));
  }, [spotVisualConfig]);

  const [isSpotVisualConfigModalOpen, setIsSpotVisualConfigModalOpen] = useState(false);
  const [isTrajectoryTimelineModalOpen, setIsTrajectoryTimelineModalOpen] = useState(false);
  const [timelineSpotId, setTimelineSpotId] = useState<string | null>(null);

  // Surface Snap Mode & Motion Spot Testing State
  const [isSurfaceSnapMode, setIsSurfaceSnapMode] = useState(false);
  const [surfaceSnapTargetObjectId, setSurfaceSnapTargetObjectId] = useState<string | null>(null);
  const [testingMotionSpotId, setTestingMotionSpotId] = useState<string | null>(null);
  const [testingObjectAction, setTestingObjectAction] = useState<{
    objectId: string;
    actionId: string;
    isPaused?: boolean;
    motion?: SpotMotionConfig;
  } | null>(null);

  // Saved Actions History & Library (persisted in localStorage)
  const [actionHistory, setActionHistory] = useState<ObjectAction[]>(() => {
    try {
      const saved = localStorage.getItem('spotverse_action_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'hist-girar-360',
        name: 'Girar 360° Contínuo',
        motion: {
          enabled: true,
          deltaPosition: [0, 0, 0],
          deltaRotation: [0, 360, 0],
          turnAngle: 360,
          curveTrajectory: 'circle_turn',
          curveRadius: 0.01,
          speed: 1.0,
          loop: true,
          target: 'parent_object',
        },
      },
      {
        id: 'hist-flutuar-onda',
        name: 'Flutuação Suave em Onda',
        motion: {
          enabled: true,
          deltaPosition: [0, 0.4, 0],
          curveTrajectory: 'wave',
          speed: 0.8,
          loop: true,
          target: 'parent_object',
        },
      },
      {
        id: 'hist-salto-arco',
        name: 'Salto Parabólico em Arco',
        motion: {
          enabled: true,
          deltaPosition: [0, 0, 3.0],
          curveHeight: 2.0,
          curveTrajectory: 'arc',
          speed: 1.2,
          loop: true,
          target: 'parent_object',
        },
      },
    ];
  });

  const handleSaveActionToHistory = (action: ObjectAction) => {
    setActionHistory((prev) => {
      const exists = prev.find((a) => a.name === action.name);
      const updated = exists
        ? prev.map((a) => (a.name === action.name ? { ...action, id: `hist-${Date.now()}` } : a))
        : [{ ...action, id: `hist-${Date.now()}` }, ...prev];
      try {
        localStorage.setItem('spotverse_action_history', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast(`Action "${action.name}" salva no histórico de actions!`);
  };

  const handleRemoveActionFromHistory = (historyId: string) => {
    setActionHistory((prev) => {
      const updated = prev.filter((a) => a.id !== historyId);
      try {
        localStorage.setItem('spotverse_action_history', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast('Action removida do histórico.');
  };

  const handleUpdateObjectActions = (objectId: string, actions: ObjectAction[]) => {
    const placedObject = activeRoom.placedObjects.find((obj) => obj.id === objectId);
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              placedObjects: r.placedObjects.map((obj) =>
                obj.id === objectId ? { ...obj, actions } : obj
              ),
            }
          : r
      )
    );
    if (placedObject) {
      setInventory((prev) =>
          prev.map((item) =>
            item.id === placedObject.assetId || item.assetId === placedObject.assetId
              ? { ...item, actions }
              : item
          )
      );
    }
  };

  const handleApplyActionFromHistoryToObject = (objectId: string, historyAction: ObjectAction) => {
    const targetObj = activeRoom.placedObjects.find((o) => o.id === objectId);
    if (!targetObj) return;
    const newAct: ObjectAction = {
      ...historyAction,
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
    const currentActions = targetObj.actions || [];
    handleUpdateObjectActions(objectId, [...currentActions, newAct]);
    showToast(`⚡ Action "${newAct.name}" inserida em "${targetObj.name}" com sucesso!`);
  };

  const handleToggleTestObjectAction = (objectId: string, actionId: string | null) => {
    if (!actionId) {
      setTestingObjectAction(null);
    } else {
      setTestingObjectAction({ objectId, actionId, isPaused: false });
    }
  };

  const handlePreviewObjectAction = useCallback((objectId: string, motion: SpotMotionConfig | null) => {
    setTestingObjectAction((current) => {
      if (!motion) {
        return current?.objectId === objectId && current.actionId === '__draft__' ? null : current;
      }
      return { objectId, actionId: '__draft__', motion, isPaused: false };
    });
  }, []);

  const handlePauseTestObjectAction = (objectId: string, actionId: string) => {
    setTestingObjectAction({ objectId, actionId, isPaused: true });
  };

  const handleResumeTestObjectAction = (objectId: string, actionId: string) => {
    setTestingObjectAction({ objectId, actionId, isPaused: false });
  };

  // Restore GLB Blob URLs from IndexedDB on page load/refresh (ensuring full persistence)
  useEffect(() => {
    const restoreBlobs = async () => {
      // 1. Restore Inventory
      let invUpdated = false;
      const updatedInventory = await Promise.all(
        inventory.map(async (item) => {
          if (!item.fileBlobUrl || item.fileBlobUrl.startsWith('blob:')) {
            const blob = await getGlbFile(item.id);
            if (blob) {
              invUpdated = true;
              return { ...item, fileBlobUrl: URL.createObjectURL(blob) };
            }
          }
          return item;
        })
      );
      if (invUpdated) {
        setInventory(updatedInventory);
      }

      // 2. Restore Customization Items (Accessories and Published items)
      let customUpdated = false;
      const updatedCustomItems = await Promise.all(
        customizationItems.map(async (cItem) => {
          if (!cItem.fileBlobUrl || cItem.fileBlobUrl.startsWith('blob:')) {
            // A. Try direct cItem.id in IndexedDB
            let blob = await getGlbFile(cItem.id);
            // B. Try originalItemId
            if (!blob && cItem.originalItemId) {
              blob = await getGlbFile(cItem.originalItemId);
            }
            // C. Try extracting id from pub prefix
            if (!blob && cItem.id.includes('-pub-')) {
              const parts = cItem.id.split('-pub-');
              if (parts[1]) {
                const sub = parts[1].replace(/-\d+$/, '');
                blob = await getGlbFile(sub);
              }
            }
            // D. Try matching updated inventory
            if (!blob) {
              const match = updatedInventory.find(inv => inv.id === cItem.originalItemId || inv.id === cItem.id);
              if (match?.fileBlobUrl) {
                customUpdated = true;
                return { ...cItem, fileBlobUrl: match.fileBlobUrl };
              }
            }
            if (blob) {
              customUpdated = true;
              return { ...cItem, fileBlobUrl: URL.createObjectURL(blob) };
            }
          }
          return cItem;
        })
      );
      if (customUpdated) {
        setCustomizationItems(updatedCustomItems);
        safeLocalStorageSet('3d_social_creator_customization_items', JSON.stringify(sanitizeItemsForStorage(updatedCustomItems)));
      }

      // 3. Restore Store Avatars
      let avatarsUpdated = false;
      const updatedAvatars = await Promise.all(
        storeAvatars.map(async (av) => {
          if (!av.fileBlobUrl || av.fileBlobUrl.startsWith('blob:')) {
            let blob = await getGlbFile(av.id);
            if (!blob && av.originalItemId) {
              blob = await getGlbFile(av.originalItemId);
            }
            if (!blob && av.id.includes('-pub-')) {
              const parts = av.id.split('-pub-');
              if (parts[1]) {
                const sub = parts[1].replace(/-\d+$/, '');
                blob = await getGlbFile(sub);
              }
            }
            if (!blob) {
              const match = updatedInventory.find(inv => inv.id === av.originalItemId || inv.id === av.id);
              if (match?.fileBlobUrl) {
                avatarsUpdated = true;
                return { ...av, fileBlobUrl: match.fileBlobUrl };
              }
            }
            if (blob) {
              avatarsUpdated = true;
              return { ...av, fileBlobUrl: URL.createObjectURL(blob) };
            }
          }
          return av;
        })
      );
      if (avatarsUpdated) {
        setStoreAvatars(updatedAvatars);
        safeLocalStorageSet('3d_social_creator_store_avatars', JSON.stringify(sanitizeItemsForStorage(updatedAvatars)));
      }

      // 4. Restore Room Scene and Placed Objects
      setRooms((prev) =>
        prev.map((room) => {
          const matchingScenario = updatedInventory.find(
            (i) => i.id === room.sceneAssetId
          );
          return {
            ...room,
            sceneAssetBlobUrl: matchingScenario?.fileBlobUrl || room.sceneAssetBlobUrl,
            placedObjects: room.placedObjects.map((obj) => {
              const matchingItem = updatedInventory.find((i) => i.id === obj.assetId);
              return matchingItem?.fileBlobUrl
                ? { ...obj, fileBlobUrl: matchingItem.fileBlobUrl }
                : obj;
            }),
          };
        })
      );
    };

    restoreBlobs();
  }, []);

  // Active room helper
  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  // Save state
  useEffect(() => {
    safeLocalStorageSet('3d_social_creator_rooms', JSON.stringify(rooms));
  }, [rooms]);

  // Auto-sync: If a room has sceneAssetBlobUrl but no corresponding 'cenario' in placedObjects,
  // register it as an editable placedObject so that the user can select and adjust it with the Gizmo!
  useEffect(() => {
    setRooms((prev) =>
      prev.map((r) => {
        if (
          r.sceneAssetBlobUrl &&
          !r.placedObjects.some(
            (o) => o.type === 'cenario' || (o.fileBlobUrl && o.fileBlobUrl === r.sceneAssetBlobUrl)
          )
        ) {
          const cenarioObj: PlacedObject = {
            id: `obj-cenario-${r.id}`,
            assetId: r.sceneAssetId || 'cenario',
            name:
              inventory.find(
                (i) => i.fileBlobUrl === r.sceneAssetBlobUrl || i.id === r.sceneAssetId
              )?.displayName || 'Cenário 3D da Sala',
            type: 'cenario',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            modelType: 'custom_glb',
            fileBlobUrl: r.sceneAssetBlobUrl,
          };
          return {
            ...r,
            placedObjects: [cenarioObj, ...r.placedObjects],
          };
        }
        return r;
      })
    );
  }, [inventory]);

  useEffect(() => {
    const uniquePoses = dedupeAvatarPoses(avatarPoses);
    if (uniquePoses.length !== avatarPoses.length) {
      setAvatarPoses(uniquePoses);
    }
  }, [avatarPoses]);

  useEffect(() => {
    const uniqueItems = dedupeInventoryPoses(inventory);
    if (uniqueItems.length !== inventory.length) {
      setInventory(uniqueItems);
    }
  }, [inventory]);

  useEffect(() => {
    const actionSources = rooms.flatMap((room) => room.placedObjects);
    const findActionSource = (assetIds: Array<string | undefined>) => {
      const matchingObjects = actionSources.filter(
        (object) => assetIds.some((assetId) => assetId && object.assetId === assetId) &&
          object.actions !== undefined
      );
      return (
        matchingObjects.find((object) => object.id === selectedObjectId) ||
        matchingObjects.find((object) => object.actions?.length) ||
        matchingObjects[0]
      );
    };

    setInventory((prev) => {
      let changed = false;
      const updated = prev.map((item) => {
        const source = findActionSource([item.id, item.assetId]);
        if (!source || JSON.stringify(item.actions || []) === JSON.stringify(source.actions || [])) {
          return item;
        }
        changed = true;
        return { ...item, actions: source.actions || [] };
      });
      return changed ? updated : prev;
    });

    setStoreAvatars((prev) => {
      let changed = false;
      const updated = prev.map((avatar) => {
        const source = findActionSource([avatar.assetId, avatar.originalItemId]);
        if (!source || JSON.stringify(avatar.actions || []) === JSON.stringify(source.actions || [])) {
          return avatar;
        }
        changed = true;
        return { ...avatar, actions: source.actions || [] };
      });
      return changed ? updated : prev;
    });
  }, [inventory, rooms, selectedObjectId, storeAvatars]);

  useEffect(() => {
    if (user) {
      safeLocalStorageSet('3d_social_creator_user', JSON.stringify(user));
    }
  }, [user]);

  // Logout Handler
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    const guestUser: CreatorUser = {
      id: `guest-${Date.now()}`,
      email: '',
      displayName: 'Visitante (Luzenne)',
      isGuest: true,
    };
    setUser(guestUser);
    safeLocalStorageSet('3d_social_creator_user', JSON.stringify(guestUser));
    showToast('Você saiu da sua conta.');
  };

  const handlePublishPose = (newPose: AvatarPoseConfig) => {
    setInventoryRevision((revision) => revision + 1);
    showToast(`Pose "${newPose.name}" publicada no banco.`);
  };

  useEffect(() => {
    let cancelled = false;
    const applySession = (authUser: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    }) => {
      const metadata = authUser.user_metadata || {};
      setUser({
        id: authUser.id,
        email: authUser.email || '',
        displayName:
          typeof metadata.display_name === 'string'
            ? metadata.display_name
            : authUser.email?.split('@')[0] || 'Criador',
        username: typeof metadata.username === 'string' ? metadata.username : undefined,
        avatarUrl: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined,
        isGuest: false,
      });
      window.setTimeout(() => {
        void supabase
          .from('profiles')
          .select('display_name, username, avatar_url')
          .eq('id', authUser.id)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) {
              console.error('Falha ao carregar perfil Supabase:', error);
              return;
            }
            if (!data) return;
            setUser((currentUser) =>
              currentUser?.id === authUser.id
                ? {
                    ...currentUser,
                    displayName: data.display_name || currentUser.displayName,
                    username: data.username || undefined,
                    avatarUrl: data.avatar_url || undefined,
                  }
                : currentUser
            );
          });
      }, 0);
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setUser(null);
        setInventoryError('Não foi possível validar sua sessão. Entre novamente.');
        return;
      }
      if (data.session?.user) applySession(data.session.user);
      else setUser(null);
    }).catch((error) => {
      if (!cancelled) {
        console.error('Falha ao verificar sessão Supabase:', error);
        setUser(null);
        setInventoryError('Não foi possível validar sua sessão. Entre novamente.');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) applySession(session.user);
      else {
        setUser(null);
        setWalletCoins(null);
        setInventory([]);
        setCustomizationItems([]);
        setStoreAvatars([]);
        setAvatarPoses([]);
        setActiveAvatarId('');
      }
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAccountStore = async () => {
      const accountId = user && !user.isGuest ? user.id : null;
      const accountChanged = loadedStoreAccountIdRef.current !== accountId;
      loadedStoreAccountIdRef.current = accountId;
      setStoreLoading(true);
      setStoreError(null);
      setRoomStoreCatalog([]);
      setInventoryLoading(Boolean(user && !user.isGuest));
      setInventoryError(null);
      setWalletCoins(null);
      if (accountChanged) {
        setCustomizationItems([]);
        setStoreAvatars([]);
        setAvatarPoses([]);
        setInventory([]);
        setActiveAvatarId('');
      }

      let storeResult: Awaited<ReturnType<typeof fetchPublicStoreItems>>;
      try {
        storeResult = await fetchPublicStoreItems();
      } catch (error) {
        if (!cancelled) {
          console.error('Falha ao carregar loja do banco:', error);
          setRoomStoreCatalog([]);
          setStoreError('Não foi possível carregar os itens publicados no banco.');
          setStoreLoading(false);
          setInventoryLoading(false);
        }
        return;
      }
      if (cancelled) return;

      let inventoryRows: any[] = [];
      let remoteAssets: Awaited<ReturnType<typeof fetchRemoteInventory>> = [];
      let userAudioAssets: Awaited<ReturnType<typeof fetchUserAudioAssets>> = [];
      const ownedStoreItemIds = new Set<string>();
      let currentAccountId: string | undefined;
      let inventoryLoadError: string | null = null;
      let walletLoadError: string | null = null;

      if (accountId && user && !user.isGuest) {
        currentAccountId = user.id;
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || sessionData.session?.user.id !== user.id) {
          inventoryLoadError = 'Sua sessão expirou. Entre novamente para acessar seu inventário.';
          walletLoadError = inventoryLoadError;
        } else {
          const [dbInventoryResult, remoteInventoryResult, walletResult, audioAssetsResult] = await Promise.allSettled([
            fetchUserInventoryFromDatabase(user),
            fetchRemoteInventory(user.id, sessionData.session.access_token),
            fetchUserWalletFromDatabase(user),
            fetchUserAudioAssets(user),
          ]);
          if (dbInventoryResult.status === 'fulfilled') {
            inventoryRows = dbInventoryResult.value;
            inventoryRows.forEach((row) => {
              if (row.store_item_id) ownedStoreItemIds.add(row.store_item_id);
            });
          } else {
            console.error('Falha ao carregar inventário Supabase:', dbInventoryResult.reason);
            inventoryLoadError = 'Não foi possível carregar os itens adquiridos da sua conta.';
          }
          if (remoteInventoryResult.status === 'fulfilled') {
            remoteAssets = remoteInventoryResult.value;
          } else {
            console.error('Falha ao carregar assets do inventário:', remoteInventoryResult.reason);
            inventoryLoadError = inventoryLoadError || 'Não foi possível carregar os arquivos 3D da sua conta.';
          }
          if (walletResult.status === 'fulfilled') {
            setWalletCoins(walletResult.value);
          } else {
            console.error('Falha ao carregar saldo Supabase:', walletResult.reason);
            walletLoadError = 'Não foi possível consultar o saldo da sua conta.';
          }
          if (audioAssetsResult.status === 'fulfilled') {
            userAudioAssets = audioAssetsResult.value;
          } else {
            console.error('Falha ao carregar áudios do inventário Supabase:', audioAssetsResult.reason);
            inventoryLoadError = inventoryLoadError || 'Não foi possível carregar os áudios da sua conta.';
          }
        }
      }
      if (cancelled) return;

      const remoteAssetIds = new Set(remoteAssets.map((asset) => asset.asset_id));
      const ownedForAccount = (id: string, assetId?: string, ownerUserId?: string) =>
        ownedStoreItemIds.has(id) ||
        Boolean(assetId && remoteAssetIds.has(assetId)) ||
        Boolean(accountId && ownerUserId === accountId);
      const items = storeResult.items.map((item) => ({
        ...item,
        owned: ownedForAccount(item.id, item.assetId, item.ownerUserId),
        equipped: false,
      }));
      const avatars = storeResult.avatars.map((avatar) => ({
        ...avatar,
        owned: ownedForAccount(avatar.id, avatar.assetId, avatar.ownerUserId),
        applied: false,
      }));
      let savedPoseActionAttachments: Record<string, ObjectAction[]> = {};
      let savedPoseActionExclusions: Record<string, string[]> = {};
      try {
        const parsedAttachments = JSON.parse(
          localStorage.getItem(poseActionAttachmentStorageKey(accountId || 'guest')) || '{}'
        );
        if (parsedAttachments && typeof parsedAttachments === 'object') {
          savedPoseActionAttachments = parsedAttachments;
        }
        const parsedExclusions = JSON.parse(
          localStorage.getItem(poseActionExclusionStorageKey(accountId || 'guest')) || '{}'
        );
        if (parsedExclusions && typeof parsedExclusions === 'object') {
          savedPoseActionExclusions = parsedExclusions;
        }
      } catch (error) {
        console.warn('Não foi possível aplicar as actions locais das poses:', error);
      }
      let localBonePoses: AvatarPoseConfig[] = [];
      try {
        const parsedLocalPoses = JSON.parse(
          localStorage.getItem(localBonePoseStorageKey(user?.id || 'guest')) || '[]'
        );
        if (Array.isArray(parsedLocalPoses)) localBonePoses = parsedLocalPoses;
      } catch (error) {
        console.warn('Não foi possível carregar as poses locais criadas com bones:', error);
      }
      const poses = [...storeResult.poses, ...localBonePoses].map((pose) => ({
        ...pose,
        actions: [
          ...(pose.actions || []).filter(
            (action) => !savedPoseActionExclusions[pose.id]?.includes(action.sourceStoreItemId || '')
          ),
          ...(savedPoseActionAttachments[pose.id] || []).filter(
            (action) => !(pose.actions || []).some((storedAction) => storedAction.id === action.id)
          ),
        ],
        owned:
          Boolean(pose.boneRotations) ||
          ownedForAccount(pose.id, pose.assetId, pose.ownerUserId) ||
          avatars.some((avatar) => {
            if (!avatar.owned) return false;
            const avatarIdentifiers = [avatar.id, avatar.originalItemId, avatar.assetId].filter(
              (identifier): identifier is string => Boolean(identifier)
            );
            const matchesId = pose.associatedAvatarIds?.some((identifier) =>
              avatarIdentifiers.includes(identifier)
            );
            const avatarName = avatar.name.trim().toLocaleLowerCase();
            const matchesName = pose.associatedAvatarNames?.some(
              (name) => name.trim().toLocaleLowerCase() === avatarName
            );
            return Boolean(matchesId || matchesName);
          }),
        applied: false,
      }));
      const avatarsWithPoses = avatars.map((avatar) => ({
        ...avatar,
        poseIds: poses
          .filter((pose) => {
            const avatarIdentifiers = [avatar.id, avatar.originalItemId, avatar.assetId].filter(
              (identifier): identifier is string => Boolean(identifier)
            );
            return (
              Boolean(pose.associatedAvatarIds?.some((identifier) => avatarIdentifiers.includes(identifier))) ||
              Boolean(
                pose.associatedAvatarNames?.some(
                  (name) => name.trim().toLocaleLowerCase() === avatar.name.trim().toLocaleLowerCase()
                )
              )
            );
          })
          .map((pose) => pose.id),
      }));
      const databaseCatalog: RoomStoreProduct[] = [
        ...storeResult.avatars.map((avatar) => ({
          id: avatar.id,
          createdAt: avatar.createdAt,
          assetId: avatar.assetId,
          name: avatar.name,
          kind: 'avatar' as const,
          price: avatar.price,
          thumbUrl: avatar.thumb,
          owned: ownedForAccount(avatar.id, avatar.assetId, avatar.ownerUserId),
        })),
        ...storeResult.items.map((item) => ({
          id: item.id,
          createdAt: item.createdAt,
          assetId: item.assetId,
          name: item.name,
          kind: item.isActionAsset
            ? 'action' as const
            : item.isAudio
            ? 'audio' as const
            : item.storeObjectType === 'sala'
              ? 'room' as const
              : item.storeObjectType === 'moveis'
                ? 'furniture' as const
                : item.isAccessory
                  ? 'accessory' as const
                  : item.category === 'publicados'
                    ? 'other' as const
                    : 'item' as const,
          audioUrl: item.audioUrl,
          price: item.price ?? 0,
          thumbUrl: item.thumb,
          owned: ownedForAccount(item.id, item.assetId, item.ownerUserId),
        })),
        ...storeResult.poses.map((pose) => ({
          id: pose.id,
          createdAt: pose.createdAt,
          assetId: pose.assetId,
          name: pose.name,
          kind: 'pose' as const,
          price: pose.price ?? 0,
          thumbUrl: pose.thumbnailUrl,
          owned:
            ownedForAccount(pose.id, pose.assetId, pose.ownerUserId) ||
            avatarsWithPoses.some((avatar) => avatar.owned && avatar.poseIds?.includes(pose.id)),
        })),
      ]
        .filter((product) =>
          (Boolean(product.assetId) || ('audioUrl' in product && Boolean(product.audioUrl))) &&
          Number.isFinite(product.price) &&
          product.price >= 0
        )
        .sort((left, right) => {
          const leftDate = Date.parse(left.createdAt || '');
          const rightDate = Date.parse(right.createdAt || '');
          return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
        });
      setRoomStoreCatalog(databaseCatalog);
      setCustomizationItems(items);
      setStoreAvatars(avatarsWithPoses);
      setAvatarPoses(dedupeAvatarPoses(poses));

      if (currentAccountId) {
        const storeItemsById = new Map<string, CustomizationItem | StoreAvatar | AvatarPoseConfig>();
        [...items, ...avatarsWithPoses, ...poses].forEach((item) => storeItemsById.set(item.id, item));
        const acquiredItems: InventoryItem[] = inventoryRows.flatMap((row) => {
          const product = row.store_item_id ? storeItemsById.get(row.store_item_id) : undefined;
          if (!product) return [];
          const avatarProduct = 'tags' in product ? product : undefined;
          const poseProduct = !avatarProduct && 'thumbnailUrl' in product ? product : undefined;
          const customItem = 'category' in product ? product : undefined;
          const type: InventoryItem['type'] = avatarProduct
            ? 'Avatar'
            : poseProduct
              ? 'Pose'
              : customItem?.isAudio
                ? 'Audio'
              : customItem?.storeObjectType === 'sala'
                ? 'Sala'
                : customItem?.storeObjectType === 'moveis'
                  ? 'Movel'
              : customItem?.isAccessory
                ? 'Acessorio'
                : 'Item';
          return [{
            id: product.id,
            storeItemId: row.store_item_id,
            assetId: product.assetId,
            ownerUserId: currentAccountId,
            isPurchased: !(
              ('tags' in product && product.isUserPublished) ||
              ('thumbnailUrl' in product && product.isPublishedByCreator) ||
              ('category' in product && product.isPublishedByCreator)
            ),
            fileName: `${product.name}.glb`,
            displayName: product.name,
            name: product.name,
            thumbUrl: avatarProduct?.thumb || poseProduct?.thumbnailUrl || customItem?.thumb || '',
            thumbnailUrl: avatarProduct?.thumb || poseProduct?.thumbnailUrl || customItem?.thumb || '',
            type,
            isAudio: customItem?.isAudio,
            isActionAsset: customItem?.isActionAsset,
            audioUrl: customItem?.audioUrl,
            audioIsRadio: customItem?.audioIsRadio,
            createdAt: row.acquired_at ? new Date(row.acquired_at).toLocaleDateString() : undefined,
            isAccessory: customItem?.isAccessory,
            isScenario: customItem?.storeObjectType === 'sala',
            actions: customItem?.actions?.map((action) => ({
              ...action,
              sourceStoreItemId: action.sourceStoreItemId || product.id,
            })) || avatarProduct?.actions,
            accessoryAttachment: customItem?.accessoryAttachment,
            accessoryTransform: customItem?.accessoryTransform,
            modelType: avatarProduct ? 'avatar' : undefined,
          }];
        });
        const explicitlyAcquiredProductIds = new Set(
          inventoryRows.map((row) => row.store_item_id).filter((id): id is string => Boolean(id))
        );
        const bundledPoseItems: InventoryItem[] = poses
          .filter((pose) => {
            if (!pose.owned || explicitlyAcquiredProductIds.has(pose.id)) return false;
            return avatarsWithPoses.some(
              (avatar) => avatar.owned && avatar.poseIds?.includes(pose.id)
            );
          })
          .map((pose) => ({
            id: pose.id,
            storeItemId: pose.id,
            assetId: pose.assetId,
            ownerUserId: currentAccountId,
            fileName: `${pose.name}.glb`,
            displayName: pose.name,
            name: pose.name,
            thumbUrl: pose.thumbnailUrl || '',
            thumbnailUrl: pose.thumbnailUrl || '',
            type: 'Pose',
            createdAt: pose.createdAt,
          }));
        const uploadedAssets: InventoryItem[] = remoteAssets.map((asset) => ({
          id: asset.asset_id,
          assetId: asset.asset_id,
          ownerUserId: currentAccountId,
          fileName: asset.filename,
          displayName: asset.custom_label || asset.filename,
          name: asset.custom_label || asset.filename,
          thumbUrl: '',
          type: asset.category === 'pose'
            ? 'Pose'
            : asset.category === 'avatar'
              ? 'Avatar'
              : asset.category === 'room_mesh'
                ? 'Sala'
                : asset.category === 'accessory'
                  ? 'Acessorio'
                  : 'Item',
          createdAt: asset.acquired_at ? new Date(asset.acquired_at).toLocaleDateString() : undefined,
          isScenario: asset.category === 'room_mesh',
          modelType: asset.category === 'avatar' ? 'avatar' : 'custom_glb',
          fileBlobUrl: asset.download_url,
        }));
        const savedAudioAssets: InventoryItem[] = userAudioAssets
          .filter((audio) => !audio.published_store_item_id)
          .map((audio) => ({
            id: audio.id,
            audioAssetId: audio.id,
            ownerUserId: currentAccountId,
            fileName: audio.name,
            displayName: audio.name,
            name: audio.name,
            thumbUrl: '',
            type: 'Audio',
            isAudio: true,
            audioUrl: audio.audio_url,
            audioIsRadio: audio.is_radio,
            createdAt: new Date(audio.created_at).toLocaleDateString(),
          }));
        setInventory(dedupeInventoryPoses([
          ...acquiredItems,
          ...bundledPoseItems,
          ...uploadedAssets,
          ...savedAudioAssets,
        ]));

        const storedAvatarId = localStorage.getItem(activeAvatarStorageKey(currentAccountId));
        const activeAvatar = avatars.find((avatar) => avatar.id === storedAvatarId && avatar.owned);
        if (activeAvatar) {
          setActiveAvatarId(activeAvatar.id);
          setStoreAvatars((previous) => previous.map((avatar) => ({
            ...avatar,
            applied: avatar.id === activeAvatar.id,
          })));
        }
        setInventoryError(inventoryLoadError || walletLoadError);
      }
      setStoreLoading(false);
      setInventoryLoading(false);
    };

    void loadAccountStore();
    return () => {
      cancelled = true;
    };
  }, [user?.id, inventoryRevision]);

  const handlePurchaseStoreItem = async (storeItemId: string) => {
    if (!user || user.isGuest) {
      const error = new Error('Entre com sua conta para comprar itens.');
      showToast(error.message);
      throw error;
    }
    try {
      const result = await purchaseStoreItemFromDatabase(user, storeItemId);
      setWalletCoins(result.coins);
      setWishlistItemIds((ids) => ids.filter((id) => id !== storeItemId));
      setInventoryRevision((revision) => revision + 1);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível concluir a compra.';
      showToast(message);
      throw error;
    }
  };

  const handleToggleWishlistItem = async (storeItemId: string) => {
    if (!user || user.isGuest) {
      setIsAuthModalOpen(true);
      return;
    }
    const shouldSave = !wishlistItemIds.includes(storeItemId);
    try {
      await setWishlistStoreItem(user, storeItemId, shouldSave);
      setWishlistItemIds((ids) =>
        shouldSave ? [...ids, storeItemId] : ids.filter((id) => id !== storeItemId)
      );
    } catch (error) {
      console.error('Could not update wishlist:', error);
      showToast('Não foi possível atualizar sua wishlist.');
    }
  };

  const handlePurchaseGift = async (
    storeItemId: string,
    recipientUserId: string,
    requireWishlist: boolean
  ) => {
    if (!user || user.isGuest) {
      setIsAuthModalOpen(true);
      throw new Error('Entre com uma conta para presentear.');
    }
    try {
      const balance = await purchaseStoreItemAsGift(user, storeItemId, recipientUserId, requireWishlist);
      setWalletCoins(balance);
      if (recipientUserId === user.id) {
        setInventoryRevision((revision) => revision + 1);
        setWishlistItemIds((ids) => ids.filter((id) => id !== storeItemId));
      }
      setStoreSocialModal(null);
      showToast('Presente enviado! O item foi adicionado ao inventário do destinatário.');
    } catch (error) {
      console.error('Could not purchase store gift:', error);
      throw error;
    }
  };

  // Customization & Shop Handlers (matching user request)
  const handleToggleEquipItem = (itemId: string) => {
    setCustomizationItems((prev) => {
      const target = prev.find((i) => i.id === itemId);
      if (!target) return prev;
      const willEquip = !target.equipped;

      return prev.map((item) => {
        if (item.id === itemId) {
          return { ...item, equipped: willEquip };
        }
        // If equipping, unequip others in the same category
        if (willEquip && item.category === target.category) {
          return { ...item, equipped: false };
        }
        return item;
      });
    });
    showToast('Aparência atualizada no pedestal!');
  };

  const handleRemoveItemFromInventory = (itemId: string) => {
    setCustomizationItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, owned: false, equipped: false } : item
      )
    );
    showToast('Item removido do inventário de comprados.');
  };

  const handleApplyPose = (poseId: string) => {
    const targetPose = avatarPoses.find((pose) => pose.id === poseId);
    if (!targetPose?.owned) {
      showToast('Adquira esta pose antes de aplicá-la.');
      return;
    }
    setAvatarPoses((prev) =>
      prev.map((p) => ({
        ...p,
        applied: p.id === poseId,
      }))
    );
  };

  const handleRemovePose = (poseId: string) => {
    setAvatarPoses((prev) =>
      prev.map((p) =>
        p.id === poseId ? { ...p, applied: false } : p
      )
    );
  };

  const handleCreateBonePose = (
    poseName: string,
    boneRotations: Record<string, [number, number, number]>,
    avatar: StoreAvatar
  ) => {
    const pose: AvatarPoseConfig = {
      id: `bone-pose-${crypto.randomUUID()}`,
      name: poseName,
      applied: false,
      createdAt: new Date().toISOString(),
      thumbnailUrl: avatar.thumb,
      owned: true,
      author: user?.displayName || 'Criador',
      ownerUserId: user?.id,
      isPublishedByCreator: false,
      associatedAvatarIds: [avatar.id, avatar.assetId, avatar.originalItemId].filter(
        (id): id is string => Boolean(id)
      ),
      associatedAvatarNames: [avatar.name],
      access: 'requires_avatar',
      boneRotations,
    };
    setAvatarPoses((current) => dedupeAvatarPoses([...current, pose]));
    try {
      const key = localBonePoseStorageKey(user?.id || 'guest');
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const savedPoses = Array.isArray(existing) ? existing : [];
      safeLocalStorageSet(key, JSON.stringify([...savedPoses.filter((saved: AvatarPoseConfig) => saved.id !== pose.id), pose]));
    } catch (error) {
      console.error('A pose foi criada, mas não foi possível salvá-la neste navegador:', error);
      showToast('A pose foi criada, mas não conseguiu ser salva neste navegador.');
      return;
    }
    showToast(`Pose "${poseName}" salva localmente para ${avatar.name}.`);
  };

  const handleOpenBonePoseEditor = (item: InventoryItem) => {
    setBonePoseEditorAvatar({
      id: item.id,
      name: item.displayName || item.name || item.fileName,
      rarity: 'COMUM',
      price: 0,
      thumb: item.thumbUrl || item.thumbnailUrl || '',
      tags: [],
      owned: true,
      applied: false,
      assetId: item.assetId || item.id,
      originalItemId: item.assetId || item.id,
      fileBlobUrl: item.fileBlobUrl,
      author: user?.displayName,
      ownerUserId: item.ownerUserId || user?.id,
      actions: item.actions,
    });
  };

  const handleTogglePoseAction = (poseId: string, action: ObjectAction, attached: boolean) => {
    const actionSourceId = action.sourceStoreItemId || action.id;
    const updatedAttachments = { ...poseActionAttachments };
    const current = updatedAttachments[poseId] || [];
    updatedAttachments[poseId] = attached
      ? [...current.filter((storedAction) => storedAction.sourceStoreItemId !== actionSourceId), action]
      : current.filter((storedAction) => storedAction.sourceStoreItemId !== actionSourceId);
    if (updatedAttachments[poseId].length === 0) delete updatedAttachments[poseId];
    setPoseActionAttachments(updatedAttachments);
    const updatedExclusions = { ...poseActionExclusions };
    const currentExclusions = updatedExclusions[poseId] || [];
    updatedExclusions[poseId] = attached
      ? currentExclusions.filter((sourceId) => sourceId !== actionSourceId)
      : [...new Set([...currentExclusions, actionSourceId])];
    if (updatedExclusions[poseId].length === 0) delete updatedExclusions[poseId];
    setPoseActionExclusions(updatedExclusions);
    safeLocalStorageSet(
      poseActionAttachmentStorageKey(user?.id || 'guest'),
      JSON.stringify(updatedAttachments)
    );
    safeLocalStorageSet(
      poseActionExclusionStorageKey(user?.id || 'guest'),
      JSON.stringify(updatedExclusions)
    );
    setAvatarPoses((prev) =>
      prev.map((pose) => {
        if (pose.id !== poseId) return pose;
        const baseActions = (pose.actions || []).filter(
          (storedAction) => storedAction.sourceStoreItemId !== actionSourceId
        );
        return {
          ...pose,
          actions: attached ? [...baseActions, action] : baseActions,
        };
      })
    );
    showToast(attached ? `Action "${action.name}" anexada à pose.` : `Action "${action.name}" removida da pose.`);
  };

  const handleSelectActiveAvatar = (avatarId: string) => {
    const targetAvatar = storeAvatars.find((avatar) => avatar.id === avatarId);
    if (!targetAvatar?.owned) {
      showToast('Adquira este avatar antes de aplicá-lo.');
      return;
    }
    setActiveAvatarId(avatarId);
    safeLocalStorageSet(activeAvatarStorageKey(user?.id || 'guest'), avatarId);
    setStoreAvatars((prev) =>
      prev.map((a) => ({
        ...a,
        applied: a.id === avatarId,
      }))
    );
  };

  const handlePublishCustomItem = (itemData: Partial<CustomizationItem>) => {
    setInventoryRevision((revision) => revision + 1);
    showToast(`"${itemData.name || 'Item'}" publicado no banco.`);
  };
  const handlePublishInventoryItemToStore = (invItem: InventoryItem) => {
    const matchingObjects = activeRoom.placedObjects.filter(
      (object) => object.assetId === invItem.id || object.assetId === invItem.assetId
    );
    const actionSource =
      matchingObjects.find((object) => object.id === selectedObjectId && object.actions?.length) ||
      matchingObjects.find((object) => object.actions?.length);
    setPublishingItem({
      ...invItem,
      actions: actionSource?.actions || invItem.actions,
    });
    setIsPublishItemModalOpen(true);
  };

  // Publish one specific placed object instance (its own name, actions and attachment settings)
  const handlePublishPlacedObject = (objectId: string) => {
    const obj = activeRoom.placedObjects.find((o) => o.id === objectId);
    if (!obj) return;
    const base = inventory.find((i) => i.id === obj.assetId || i.assetId === obj.assetId);
    const objType: InventoryItem['type'] =
      obj.type === 'avatar' || obj.isAvatar
        ? 'avatar'
        : obj.type === 'acessorio' || obj.isAccessory
        ? 'acessorio'
        : obj.type === 'pose' || obj.isPose
        ? 'pose'
        : 'item';
    setPublishingItem({
      ...(base || {
        id: obj.assetId,
        fileName: obj.name,
        thumbUrl: '',
      }),
      id: base?.id || obj.assetId,
      assetId: base?.assetId || obj.assetId,
      fileName: base?.fileName || obj.name,
      displayName: obj.name,
      thumbUrl: base?.thumbUrl || '',
      type: objType,
      fileBlobUrl: obj.fileBlobUrl || base?.fileBlobUrl,
      modelType: obj.modelType || base?.modelType,
      actions: obj.actions || base?.actions,
      isAccessory: obj.isAccessory || base?.isAccessory,
      accessoryAttachment: obj.accessoryAttachment || base?.accessoryAttachment,
      accessoryTransform: obj.accessoryTransform || base?.accessoryTransform,
      sourceObjectId: obj.id,
    } as InventoryItem);
    setIsPublishItemModalOpen(true);
  };

  const handleConfirmPublishItem = async (payload: {
    item: InventoryItem;
    name: string;
    objectType: StoreObjectType;
    price: number;
    hashtags: string[];
    thumbnailUrl: string;
    rarity: 'COMUM' | 'RARO' | 'ÉLITE';
    description: string;
    publishMode: 'simples' | 'avancado';
    associatedAvatarIds?: string[];
    associatedAvatarNames?: string[];
    poseAccess?: 'requires_avatar' | 'free';
    bundlePoses?: boolean;
    updateExistingId?: string;
    actions?: ObjectAction[];
    isActionAsset?: boolean;
    accessoryAttachment?: AccessoryAttachmentPoint;
    accessoryTransform?: AccessoryTransform;
  }) => {
    if (!user || user.isGuest) {
      showToast('Entre com sua conta para publicar itens.');
      return;
    }
    if (!Number.isInteger(payload.price) || payload.price < 0) {
      showToast('O preço precisa ser um número inteiro igual ou maior que zero.');
      return;
    }

    const assetId = payload.item.isAudio ? payload.item.assetId : payload.item.assetId || payload.item.id;
    const associatedAvatarIds = payload.associatedAvatarIds || [];
    const result = await persistStoreItem({
      id: payload.updateExistingId,
      assetId,
      originalItemId: assetId,
      name: payload.name,
      objectType: payload.objectType,
      price: payload.price,
      hashtags: payload.hashtags,
      thumbnailUrl: payload.thumbnailUrl,
      rarity: payload.rarity,
      description: payload.description,
      publishMode: payload.publishMode,
      fileBlobUrl: payload.item.fileBlobUrl,
      author: user.displayName,
      associatedAvatarIds,
      actions: payload.actions,
      accessoryAttachment: payload.accessoryAttachment,
      accessoryTransform: payload.accessoryTransform,
      metadata: {
        associatedAvatarIds,
        associatedAvatarNames: payload.associatedAvatarNames || [],
        poseAccess: payload.poseAccess,
        sourceObjectId: payload.item.sourceObjectId,
        isAccessory: payload.objectType === 'acessorio',
        isAudio: payload.item.isAudio,
        isActionAsset: payload.isActionAsset === true,
        audioUrl: payload.item.audioUrl,
        audioIsRadio: payload.item.audioIsRadio,
        accessoryAttachment: payload.accessoryAttachment,
        accessoryTransform: payload.accessoryTransform,
        actions: payload.actions || [],
      },
    }, user);

    if (!result.success || !result.id) {
      showToast(`⚠️ ${result.error || 'O banco não confirmou a publicação.'}`);
      return;
    }

    let audioInventoryLinkFailed = false;
    if (payload.item.isAudio && payload.item.audioAssetId) {
      try {
        await markUserAudioAssetPublished(user, payload.item.audioAssetId, result.id);
      } catch (error) {
        console.error('Publicação salva, mas falhou o vínculo do áudio com o item publicado:', error);
        audioInventoryLinkFailed = true;
      }
    }

    try {
      await recordUserInventoryItem(user, {
        storeItemId: result.id,
        itemName: payload.name,
        itemType: payload.objectType,
        thumbnailUrl: payload.thumbnailUrl,
      });
    } catch (error) {
      console.error('Publicação salva, mas falhou o registro do proprietário no inventário:', error);
      showToast('A publicação foi salva, mas não entrou no inventário da conta. Tente atualizar.');
      setInventoryRevision((revision) => revision + 1);
      return;
    }

    let bundledPoseFailures = 0;
    if (payload.objectType === 'avatar' && payload.bundlePoses !== false) {
      const avatarObjectIds = new Set<string>(
        [payload.item.id, assetId].filter((id): id is string => Boolean(id))
      );
      if (payload.item.sourceObjectId) avatarObjectIds.add(payload.item.sourceObjectId);
      const attachedPoses = activeRoom.placedObjects.filter(
        (object) => (object.type === 'pose' || object.isPose) &&
          object.attachedAvatarIds?.some((id) => avatarObjectIds.has(id))
      );

      for (const poseObject of attachedPoses) {
        const poseAsset = inventory.find((item) => item.assetId === poseObject.assetId || item.id === poseObject.assetId);
        if (!poseAsset?.assetId) {
          bundledPoseFailures += 1;
          continue;
        }
        const existingPose = avatarPoses.find((pose) => pose.sourceObjectId === poseObject.id);
        const poseResult = await persistStoreItem({
          id: existingPose?.id,
          assetId: poseAsset.assetId,
          originalItemId: poseAsset.assetId,
          name: poseObject.name,
          objectType: 'pose',
          price: 0,
          hashtags: ['#pose', '#avatar'],
          thumbnailUrl: poseAsset.thumbUrl || payload.thumbnailUrl,
          rarity: 'COMUM',
          description: `Pose vinculada ao avatar ${payload.name}.`,
          publishMode: 'simples',
          fileBlobUrl: poseAsset.fileBlobUrl,
          author: user.displayName,
          associatedAvatarIds: [result.id],
          metadata: {
            sourceObjectId: poseObject.id,
            associatedAvatarIds: [result.id],
            associatedAvatarNames: [payload.name],
            poseAccess: 'requires_avatar',
          },
        }, user);
        if (!poseResult.success || !poseResult.id) {
          bundledPoseFailures += 1;
          continue;
        }
        try {
          await recordUserInventoryItem(user, {
            storeItemId: poseResult.id,
            itemName: poseObject.name,
            itemType: 'pose',
            thumbnailUrl: poseAsset.thumbUrl,
          });
        } catch (error) {
          console.error('Pose publicada sem registro no inventário do proprietário:', error);
          bundledPoseFailures += 1;
        }
      }
    }

    setInventoryRevision((revision) => revision + 1);
    setIsPublishItemModalOpen(false);
    showToast(bundledPoseFailures
      ? `"${payload.name}" publicado. ${bundledPoseFailures} pose(s) anexada(s) não puderam ser registradas.`
      : audioInventoryLinkFailed
        ? `"${payload.name}" publicado, mas o áudio permaneceu na biblioteca original.`
        : `"${payload.name}" publicado e registrado na sua conta.`);
  };
  const handleRenameInventoryItem = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setInventory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, displayName: trimmed } : item))
    );
    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        name: room.sceneAssetId === id ? trimmed : room.name,
        placedObjects: room.placedObjects.map((obj) =>
          obj.assetId === id ? { ...obj, name: trimmed } : obj
        ),
      }))
    );
    showToast(`Nome alterado para "${trimmed}"`);
  };

  const handleRenamePlacedObject = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        placedObjects: room.placedObjects.map((obj) =>
          obj.id === id ? { ...obj, name: trimmed } : obj
        ),
      }))
    );
    showToast(`Objeto renomeado para "${trimmed}"`);
  };

  // Delete inventory item (including binary GLB from IndexedDB and remote database)
  const handleDeleteInventoryItem = async (itemId: string) => {
    const itemToRemove = inventory.find((i) => i.id === itemId);
    if (!(await deleteRemoteInventoryItem(itemId, user?.id))) {
      showToast('Não foi possível excluir o arquivo da sua conta. Tente novamente.');
      return;
    }
    // 2. Delete binary from IndexedDB
    await deleteGlbFile(itemId);
    // 3. Remove from inventory
    setInventory((prev) => prev.filter((i) => i.id !== itemId));
    // 4. Clear from rooms if currently used as scenario or placed object
    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        sceneAssetId: room.sceneAssetId === itemId ? null : room.sceneAssetId,
        sceneAssetBlobUrl: room.sceneAssetId === itemId ? undefined : room.sceneAssetBlobUrl,
        placedObjects: room.placedObjects.filter((o) => o.assetId !== itemId),
      }))
    );
    showToast(`Arquivo "${itemToRemove?.displayName || 'Item'}" excluído com sucesso.`);
  };

  // Delete multiple selected inventory items
  const handleDeleteMultipleInventoryItems = async (itemIds: string[]) => {
    if (!itemIds || itemIds.length === 0) return;
    const deletedIds: string[] = [];
    for (const id of itemIds) {
      if (!(await deleteRemoteInventoryItem(id, user?.id))) continue;
      await deleteGlbFile(id);
      deletedIds.push(id);
    }
    if (deletedIds.length === 0) {
      showToast('Não foi possível excluir os arquivos da sua conta. Tente novamente.');
      return;
    }
    const idSet = new Set(deletedIds);
    setInventory((prev) => prev.filter((i) => !idSet.has(i.id)));
    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        sceneAssetId: room.sceneAssetId && idSet.has(room.sceneAssetId) ? null : room.sceneAssetId,
        sceneAssetBlobUrl: room.sceneAssetId && idSet.has(room.sceneAssetId) ? undefined : room.sceneAssetBlobUrl,
        placedObjects: room.placedObjects.filter((o) => !o.assetId || !idSet.has(o.assetId)),
      }))
    );
    showToast(
      deletedIds.length === itemIds.length
        ? `${deletedIds.length} arquivos selecionados foram excluídos com sucesso.`
        : `${deletedIds.length} de ${itemIds.length} arquivos foram excluídos; os demais não foram alterados.`
    );
  };

  // Clear all inventory items
  const handleClearAllInventory = async () => {
    if (!(await clearAllRemoteInventory(user?.id))) {
      showToast('Não foi possível limpar o inventário da sua conta. Tente novamente.');
      return;
    }
    await clearAllGlbFiles();
    setInventory([]);
    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        sceneAssetId: null,
        sceneAssetBlobUrl: undefined,
        placedObjects: room.placedObjects.filter((o) => !o.assetId),
      }))
    );
    safeLocalStorageSet('3d_social_creator_inventory', JSON.stringify([]));
    showToast('Todo o inventário foi limpo com sucesso.');
  };

  // Restore project from imported .json / .3dproj package
  const handleRestoreProject = (restored: {
    rooms: RoomEditorState[];
    inventory: InventoryItem[];
    activeRoomId: string;
    customizationItems?: CustomizationItem[];
    storeAvatars?: StoreAvatar[];
    avatarPoses?: AvatarPoseConfig[];
    spotVisualConfig?: SpotVisualConfig;
  }) => {
    setRooms(restored.rooms);
    setInventory(restored.inventory);
    setActiveRoomId(restored.activeRoomId);

    if (restored.customizationItems) setCustomizationItems(restored.customizationItems);
    if (restored.storeAvatars) setStoreAvatars(restored.storeAvatars);
    if (restored.avatarPoses) setAvatarPoses(restored.avatarPoses);
    if (restored.spotVisualConfig) setSpotVisualConfig(restored.spotVisualConfig);

    safeLocalStorageSet('3d_social_creator_rooms', JSON.stringify(restored.rooms));
    safeLocalStorageSet('3d_social_creator_inventory', JSON.stringify(sanitizeItemsForStorage(restored.inventory)));
    if (restored.customizationItems) {
      safeLocalStorageSet('3d_social_creator_customization_items', JSON.stringify(sanitizeItemsForStorage(restored.customizationItems)));
    }
    if (restored.storeAvatars) {
      safeLocalStorageSet('3d_social_creator_store_avatars', JSON.stringify(sanitizeItemsForStorage(restored.storeAvatars)));
    }
    if (restored.avatarPoses) {
      safeLocalStorageSet('3d_social_creator_poses', JSON.stringify(restored.avatarPoses));
    }

    setCurrentScreen('editor');
    showToast('Projeto restaurado com sucesso! Você está exatamente de onde parou.');
  };

  // Load room for editing from MyPublicationsModal
  const handleLoadRoomForEdit = (roomState: RoomEditorState) => {
    setRooms((prev) => {
      const exists = prev.some((r) => r.id === roomState.id);
      if (exists) {
        return prev.map((r) => (r.id === roomState.id ? roomState : r));
      }
      return [roomState, ...prev];
    });
    setActiveRoomId(roomState.id);
    setCurrentScreen('editor');
    showToast(`Sala "${roomState.name}" carregada no editor para edição!`);
  };

  // Surface Snap Relative Spot Handlers
  const handleStartSurfaceSnap = (objectId?: string | null) => {
    setIsSurfaceSnapMode(true);
    if (objectId && objectId !== 'any') {
      const obj = activeRoom.placedObjects.find((o) => o.id === objectId);
      setSurfaceSnapTargetObjectId(objectId);
      showToast(`Passe o mouse sobre "${obj?.name || 'Objeto'}" e clique para fixar o spot na superfície!`);
    } else {
      setSurfaceSnapTargetObjectId('any');
      showToast('Passe o mouse sobre qualquer objeto 3D (esfera, sofá, carro, etc.) e clique para fixar o spot na superfície!');
    }
  };

  const handleCancelSurfaceSnap = () => {
    setIsSurfaceSnapMode(false);
    setSurfaceSnapTargetObjectId(null);
  };

  const handleAddRelativeSpot = (
    parentId: string,
    relativePos: [number, number, number],
    normal: [number, number, number],
    worldPos: [number, number, number]
  ) => {
    const parentObj = activeRoom.placedObjects.find((o) => o.id === parentId);
    const newSpotId = `spot-rel-${Date.now()}`;
    const newSpot: SpotItem = {
      id: newSpotId,
      name: `Spot ${parentObj?.name || 'Objeto'} #${activeRoom.spots.length + 1}`,
      type: 'sentar',
      position: worldPos,
      rotation: 0,
      rotationPitch: 0,
      targetRotation: parentObj ? [parentObj.rotation[0], parentObj.rotation[1], parentObj.rotation[2]] : undefined,
      targetScale: parentObj ? [parentObj.scale[0], parentObj.scale[1], parentObj.scale[2]] : undefined,
      parentObjectId: parentId,
      relativePosition: relativePos,
      surfaceNormal: normal,
    };

    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId ? { ...r, spots: [...r.spots, newSpot] } : r
      )
    );
    // Keep parent object selected and DO NOT trigger move gizmo on the newly added spot!
    // Keep surface snap mode active so the user can click multiple times (e.g. 5 times) without teleport or flicker!
    setSelectedSpotId(null);
    setSelectedObjectId(parentId);
    showToast(`Spot fixado na superfície de "${parentObj?.name || 'Objeto'}"!`);
  };

  const handleCaptureObjectCoordinatesToSpot = (spotId: string, objId: string) => {
    const obj = activeRoom.placedObjects.find((o) => o.id === objId);
    if (!obj) return;
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              spots: r.spots.map((s) =>
                s.id === spotId
                  ? {
                      ...s,
                      targetRotation: [obj.rotation[0], obj.rotation[1], obj.rotation[2]],
                      targetScale: [obj.scale[0], obj.scale[1], obj.scale[2]],
                    }
                  : s
              ),
            }
          : r
      )
    );
    showToast(`📐 Rotação e escala de "${obj.name}" capturadas para o spot!`);
  };

  const handleCaptureObjectRotationToSpot = (spotId: string, objId: string) => {
    const obj = activeRoom.placedObjects.find((o) => o.id === objId);
    if (!obj) return;
    const degY = Math.round((((obj.rotation[1] * (180 / Math.PI)) % 360) + 360) % 360);
    const degX = Math.round((((obj.rotation[0] * (180 / Math.PI)) % 360) + 360) % 360);
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              spots: r.spots.map((s) =>
                s.id === spotId
                  ? {
                      ...s,
                      targetRotation: [obj.rotation[0], obj.rotation[1], obj.rotation[2]],
                      rotation: degY,
                      rotationPitch: degX,
                    }
                  : s
              ),
            }
          : r
      )
    );
    showToast(`🔄 Coordenada de rotação de "${obj.name}" (${degY}°) gravada no spot!`);
  };

  const handleCaptureObjectScaleToSpot = (spotId: string, objId: string) => {
    const obj = activeRoom.placedObjects.find((o) => o.id === objId);
    if (!obj) return;
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              spots: r.spots.map((s) =>
                s.id === spotId
                  ? {
                      ...s,
                      targetScale: [obj.scale[0], obj.scale[1], obj.scale[2]],
                    }
                  : s
              ),
            }
          : r
      )
    );
    showToast(`📐 Coordenada de escala de "${obj.name}" gravada no spot!`);
  };

  const handleApplySpotCoordinatesToObject = (spotId: string, objId: string) => {
    const spot = activeRoom.spots.find((s) => s.id === spotId);
    if (!spot) return;
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              placedObjects: r.placedObjects.map((obj) =>
                obj.id === objId
                  ? {
                      ...obj,
                      position: [spot.position[0], spot.position[1], spot.position[2]],
                      rotation: spot.targetRotation || [
                        ((spot.rotationPitch || 0) * Math.PI) / 180,
                        (spot.rotation * Math.PI) / 180,
                        0,
                      ],
                      scale: spot.targetScale || obj.scale,
                    }
                  : obj
              ),
            }
          : r
      )
    );
    showToast(`🎯 Coordenadas do spot aplicadas ao objeto "${activeRoom.placedObjects.find((o) => o.id === objId)?.name || 'Objeto'}"!`);
  };

  const handleDetachSpotFromObject = (spotId: string) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === activeRoomId) {
          return {
            ...r,
            spots: r.spots.map((s) =>
              s.id === spotId
                ? {
                    ...s,
                    parentObjectId: undefined,
                    relativePosition: undefined,
                    surfaceNormal: undefined,
                  }
                : s
            ),
          };
        }
        return r;
      })
    );
    showToast('Spot desvinculado do objeto. Agora é um spot livre.');
  };

  // Motion Spot Handlers
  const handleUpdateSpotMotion = (spotId: string, motion: SpotMotionConfig | undefined) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === activeRoomId) {
          return {
            ...r,
            spots: r.spots.map((s) => (s.id === spotId ? { ...s, motion } : s)),
          };
        }
        return r;
      })
    );
    if (motion?.enabled) {
      setTestingMotionSpotId(spotId);
      showToast('⚡ Simulação de movimento ativada para o ponto!');
    } else {
      setTestingMotionSpotId((prev) => (prev === spotId ? null : prev));
      showToast('Motion desativado no spot.');
    }
  };

  const handleToggleTestSpotMotion = (spotId: string) => {
    setTestingMotionSpotId((prev) => (prev === spotId ? null : spotId));
  };

  // Add new Room tab
  const handleAddNewRoom = () => {
    const nextLetter = String.fromCharCode(65 + rooms.length);
    const newRoom: RoomEditorState = {
      id: `room-${Date.now()}`,
      name: `Room ${nextLetter} · Novo Salão`,
      sceneAssetId: 'cenario-padrao',
      placedObjects: [],
      spots: [],
      boundary: {
        x: 6.0,
        y: 2.8,
        z: 8.0,
        isConfirmed: false,
      },
      isPublished: false,
    };

    setRooms((prev) => [...prev, newRoom]);
    setActiveRoomId(newRoom.id);
    setSelectedSpotId(null);
    setSelectedObjectId(null);
    showToast(`Nova Room ${nextLetter} criada com sucesso!`);
  };

  // Upload handler (supports real GLB blob URLs and direct placement with Gizmo)
  const placedKindFor = (t: string): 'avatar' | 'acessorio' | 'pose' | 'movel' => {
    const l = (t || '').toLowerCase();
    return l === 'avatar' ? 'avatar' : l === 'acessorio' ? 'acessorio' : l === 'pose' ? 'pose' : 'movel';
  };

  const handleUploadSuccess = (
    item: InventoryItem,
    autoInsertPoint?: [number, number, number] | null
  ) => {
    setInventory((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);

    if (item.isAudio) {
      showToast(`Áudio "${item.displayName}" salvo no inventário.`);
      return;
    }

    const isAcc = item.isAccessory || item.type === 'Acessorio' || item.type === 'Item';
    setCustomizationItems((prev) => [
      {
        id: item.id,
        assetId: item.id,
        code: `#AC${item.id.slice(0, 4)}`,
        name: item.displayName,
        category: isAcc ? 'acessorios' : 'itens',
        slot: 'companion_float',
        thumb: item.thumbUrl,
        fileBlobUrl: item.fileBlobUrl,
        owned: true,
        equipped: false,
        price: 0,
        rarity: 'RARO',
        isAccessory: isAcc,
        accessoryAttachment: 'companion_float',
      },
      ...prev.filter((i) => i.id !== item.id && !i.id.startsWith('inv-') && !i.fileBlobUrl?.startsWith('blob:')),
    ]);

    // 1. If user uploads a 'Sala' (architectural 3D scenario)
    if (item.type === 'Sala') {
      const targetPoint = autoInsertPoint || (insertionCursorPoint ? [insertionCursorPoint[0], 0.0, insertionCursorPoint[2]] : [0, 0, 0]);
      const newObjId = `obj-cenario-${Date.now()}`;
      const newPlacedObject: PlacedObject = {
        id: newObjId,
        assetId: item.id,
        name: item.displayName,
        type: 'cenario',
        position: [targetPoint[0], 0.0, targetPoint[2]] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        modelType: 'custom_glb',
        fileBlobUrl: item.fileBlobUrl,
      };

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== activeRoomId) return r;
          const cleanPlaced = r.placedObjects.filter((o) => o.type !== 'cenario');
          return {
            ...r,
            sceneAssetId: item.id,
            sceneAssetBlobUrl: item.fileBlobUrl,
            placedObjects: [newPlacedObject, ...cleanPlaced],
          };
        })
      );
      setSelectedObjectId(newObjId);
      setSelectedSpotId(null);
      setInsertionCursorPoint(null);
      setIsAvatarMode(false); // Mode edit on so gizmo is visible
      showToast(`Cenário 3D "${item.displayName}" inserido! Ajuste com o Gizmo (Mover, Rodar, Escalar, Elevar).`);
      return;
    }

    // 2. If user uploads an 'Avatar' or 'Item'
    if (autoInsertPoint) {
      const targetPoint = autoInsertPoint;
      const isAvatarType = item.type === 'Avatar';
      const placedKind = placedKindFor(item.type);
      const newObjId = `obj-${isAvatarType ? 'avatar' : placedKind}-${Date.now()}`;
      const newPlacedObject: PlacedObject = {
        id: newObjId,
        assetId: item.id,
        name: item.displayName,
        type: placedKind,
        isAvatar: isAvatarType,
        ...(placedKind === 'pose' ? { isPose: true } : {}),
        position: [targetPoint[0], 0.0, targetPoint[2]] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        modelType: (item.modelType || (isAvatarType ? 'avatar' : 'custom_glb')) as any,
        fileBlobUrl: item.fileBlobUrl,
      };

      setRooms((prev) =>
        prev.map((r) =>
          r.id === activeRoomId
            ? { ...r, placedObjects: [...r.placedObjects, newPlacedObject] }
            : r
        )
      );
      setSelectedObjectId(newObjId);
      setSelectedSpotId(null);
      setInsertionCursorPoint(null);
      setIsAvatarMode(false); // Mode edit on so gizmo is visible
      if (isAvatarType) {
        setCustomAvatarObjectId(newObjId);
      }
      showToast(`"${item.displayName}" inserido na cena 3D! Ajuste com o Gizmo.`);
    } else {
      showToast(`"${item.displayName}" salvo no inventário! Clique em "Inserir na Cena" quando desejar colocá-lo.`);
    }
  };

  // Insert GLB or asset into the scene (supporting Sala, Avatar, and Item with Gizmo)
  const handleInsertAssetToScene = (asset: InventoryItem) => {
    const spawnPoint: [number, number, number] = insertionCursorPoint
      ? [insertionCursorPoint[0], 0.0, insertionCursorPoint[2]]
      : [0, 0.0, 0];

    // If it's a scene file (Sala), load as scenario and enable full Gizmo
    if (asset.type === 'Sala') {
      const newObjId = `obj-cenario-${Date.now()}`;
      const newPlacedObject: PlacedObject = {
        id: newObjId,
        assetId: asset.id,
        name: asset.displayName,
        type: 'cenario',
        position: spawnPoint,
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        modelType: 'custom_glb',
        fileBlobUrl: asset.fileBlobUrl,
      };

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== activeRoomId) return r;
          const cleanPlaced = r.placedObjects.filter((o) => o.type !== 'cenario');
          return {
            ...r,
            sceneAssetId: asset.id,
            sceneAssetBlobUrl: asset.fileBlobUrl,
            placedObjects: [newPlacedObject, ...cleanPlaced],
          };
        })
      );
      setSelectedObjectId(newObjId);
      setSelectedSpotId(null);
      setInsertionCursorPoint(null);
      setIsAvatarMode(false);
      showToast(`Cenário 3D "${asset.displayName}" inserido na room! Ajuste com o Gizmo.`);
      return;
    }

    const isAvatarType = asset.type === 'Avatar';
    const placedKind = placedKindFor(asset.type);
    const newObjId = `obj-${isAvatarType ? 'avatar' : placedKind}-${Date.now()}`;
    const newPlacedObject: PlacedObject = {
      id: newObjId,
      assetId: asset.id,
      name: asset.displayName,
      type: placedKind,
      isAvatar: isAvatarType,
      ...(placedKind === 'pose' ? { isPose: true } : {}),
      position: spawnPoint,
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      modelType: (asset.modelType || (isAvatarType ? 'avatar' : 'custom_glb')) as any,
      fileBlobUrl: asset.fileBlobUrl,
    };

    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? { ...r, placedObjects: [...r.placedObjects, newPlacedObject] }
          : r
      )
    );

    setSelectedObjectId(newObjId);
    setSelectedSpotId(null);
    setInsertionCursorPoint(null);
    setIsAvatarMode(false);
    if (isAvatarType) {
      setCustomAvatarObjectId(newObjId);
    }
    showToast(`"${asset.displayName}" inserido na cena! Ajuste com o Gizmo.`);
  };

  // Update object transform via Gizmo (with strict numeric sanitization)
  const handleUpdateObjectTransform = (
    id: string,
    transform: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    }
  ) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== activeRoomId) return r;
        const updatedPlacedObjects = r.placedObjects.map((obj) => {
          if (obj.id !== id) return obj;
          const safePos: [number, number, number] = [
            Number.isFinite(transform.position[0]) ? transform.position[0] : obj.position[0],
            Number.isFinite(transform.position[1]) ? transform.position[1] : obj.position[1],
            Number.isFinite(transform.position[2]) ? transform.position[2] : obj.position[2],
          ];
          const safeRot: [number, number, number] = [
            Number.isFinite(transform.rotation[0]) ? transform.rotation[0] : obj.rotation[0],
            Number.isFinite(transform.rotation[1]) ? transform.rotation[1] : obj.rotation[1],
            Number.isFinite(transform.rotation[2]) ? transform.rotation[2] : obj.rotation[2],
          ];
          const safeScale: [number, number, number] = [
            Number.isFinite(transform.scale[0]) && transform.scale[0] >= 0.05 ? transform.scale[0] : obj.scale[0],
            Number.isFinite(transform.scale[1]) && transform.scale[1] >= 0.05 ? transform.scale[1] : obj.scale[1],
            Number.isFinite(transform.scale[2]) && transform.scale[2] >= 0.05 ? transform.scale[2] : obj.scale[2],
          ];
          return {
            ...obj,
            position: safePos,
            rotation: safeRot,
            scale: safeScale,
          };
        });

        // Also update world position coordinates of any relative spots attached to this object
        const targetObj = updatedPlacedObjects.find((o) => o.id === id);
        let updatedSpots = r.spots;
        if (targetObj) {
          const tempObj = new THREE.Object3D();
          tempObj.position.set(...targetObj.position);
          tempObj.rotation.set(...targetObj.rotation);
          tempObj.scale.set(...targetObj.scale);
          tempObj.updateMatrixWorld();

          updatedSpots = r.spots.map((spot) => {
            if (spot.parentObjectId === id && spot.relativePosition) {
              const worldPos = tempObj.localToWorld(new THREE.Vector3(...spot.relativePosition));
              return {
                ...spot,
                position: [
                  parseFloat(worldPos.x.toFixed(2)),
                  parseFloat(worldPos.y.toFixed(2)),
                  parseFloat(worldPos.z.toFixed(2)),
                ],
              };
            }
            return spot;
          });
        }

        return {
          ...r,
          placedObjects: updatedPlacedObjects,
          spots: updatedSpots,
        };
      })
    );
  };

  // Remove object from scene (keeps file in inventory)
  const handleRemoveObject = (id: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              placedObjects: r.placedObjects.filter((obj) => obj.id !== id),
            }
          : r
      )
    );
    setSelectedObjectId(null);
    showToast('Objeto removido da cena. O arquivo continua no inventário.');
  };

  // Spot management
  const handleAddSpot = (type: SpotType, name: string) => {
    const newSpot: SpotItem = {
      id: `spot-${Date.now()}`,
      name,
      type,
      position: [
        parseFloat(((Math.random() - 0.5) * 2.2).toFixed(2)),
        type === 'sentar' ? 0.52 : 0.02,
        parseFloat(((Math.random() - 0.5) * 1.6 + 0.4).toFixed(2)),
      ],
      rotation: 0,
    };

    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId ? { ...r, spots: [...r.spots, newSpot] } : r
      )
    );
    setSelectedSpotId(newSpot.id);
    setSelectedObjectId(null);
    showToast(`Spot "${name}" (${type}) adicionado!`);
  };

  const handleRenameSpot = (spotId: string, name: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? { ...r, spots: r.spots.map((s) => (s.id === spotId ? { ...s, name } : s)) }
          : r
      )
    );
  };

  const handleRemoveSpot = (spotId: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? { ...r, spots: r.spots.filter((s) => s.id !== spotId) }
          : r
      )
    );
    if (selectedSpotId === spotId) setSelectedSpotId(null);
    showToast('Spot removido da cena.');
  };

  const handleAddSpotAtObject = (objectId: string) => {
    const currentRoom = rooms.find((r) => r.id === activeRoomId);
    if (!currentRoom) return;

    const targetObj = currentRoom.placedObjects.find((o) => o.id === objectId);
    if (!targetObj) return;

    // Detect spot type based on object name/type
    const isSitting =
      targetObj.name.toLowerCase().includes('sofa') ||
      targetObj.name.toLowerCase().includes('cadeira') ||
      targetObj.name.toLowerCase().includes('chair') ||
      targetObj.name.toLowerCase().includes('seat') ||
      targetObj.name.toLowerCase().includes('banco') ||
      targetObj.name.toLowerCase().includes('poltrona') ||
      targetObj.modelType === 'sofa' ||
      targetObj.modelType === 'chair';

    const isLying =
      targetObj.name.toLowerCase().includes('cama') ||
      targetObj.name.toLowerCase().includes('bed') ||
      targetObj.name.toLowerCase().includes('deitar');

    const spotType: SpotType = isLying ? 'deitar' : isSitting ? 'sentar' : 'pe';

    // Match object's orientation in degrees
    const rotDeg = Math.round(
      (((targetObj.rotation[1] * (180 / Math.PI)) % 360) + 360) % 360
    );
    const rotPitchDeg = Math.round(
      (((targetObj.rotation[0] * (180 / Math.PI)) % 360) + 360) % 360
    );

    // Exact coordinate of the object
    const newSpot: SpotItem = {
      id: `spot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `Spot (${targetObj.name})`,
      type: spotType,
      position: [
        parseFloat(targetObj.position[0].toFixed(2)),
        parseFloat(targetObj.position[1].toFixed(2)),
        parseFloat(targetObj.position[2].toFixed(2)),
      ],
      rotation: rotDeg,
      rotationPitch: rotPitchDeg,
      targetRotation: [targetObj.rotation[0], targetObj.rotation[1], targetObj.rotation[2]],
      targetScale: [targetObj.scale[0], targetObj.scale[1], targetObj.scale[2]],
    };

    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId ? { ...r, spots: [...r.spots, newSpot] } : r
      )
    );
    setSelectedSpotId(newSpot.id);
    setSelectedObjectId(null);
    showToast(
      `📍 Spot criado na coordenada de "${targetObj.name}"! O spot permanece mesmo se você remover o objeto.`
    );
  };

  const handleClearAllSpots = () => {
    setRooms((prev) =>
      prev.map((r) => (r.id === activeRoomId ? { ...r, spots: [] } : r))
    );
    setSelectedSpotId(null);
    showToast('Todos os spots foram removidos da cena.');
  };

  const handleRemoveOverlappingSpots = () => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== activeRoomId) return r;
        const keptSpots: SpotItem[] = [];
        const threshold = 0.45; // meters distance to consider overlapping
        for (const spot of r.spots) {
          const isOverlapping = keptSpots.some((k) => {
            const dx = k.position[0] - spot.position[0];
            const dz = k.position[2] - spot.position[2];
            return Math.sqrt(dx * dx + dz * dz) < threshold;
          });
          if (!isOverlapping) {
            keptSpots.push(spot);
          }
        }
        const removedCount = r.spots.length - keptSpots.length;
        if (removedCount > 0) {
          showToast(`${removedCount} spot(s) sobreposto(s) removido(s)!`);
        } else {
          showToast('Nenhum spot sobreposto encontrado.');
        }
        return { ...r, spots: keptSpots };
      })
    );
  };

  const handleUpdateSpotPosition = (id: string, position: [number, number, number]) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== activeRoomId) return r;
        return {
          ...r,
          spots: r.spots.map((s) => {
            if (s.id !== id) return s;
            if (!position.every(Number.isFinite)) return s;
            const safePosition: [number, number, number] = [
              parseFloat(position[0].toFixed(2)),
              parseFloat((s.parentObjectId ? position[1] : Math.max(0, position[1])).toFixed(2)),
              parseFloat(position[2].toFixed(2)),
            ];
            let updatedRelativePos = s.relativePosition;
            if (s.parentObjectId) {
              const parentObj = r.placedObjects.find((o) => o.id === s.parentObjectId);
              if (parentObj) {
                const tempParent = new THREE.Object3D();
                tempParent.position.set(...parentObj.position);
                tempParent.rotation.set(...parentObj.rotation);
                tempParent.scale.set(...parentObj.scale);
                tempParent.updateMatrixWorld();
                const newLocal = tempParent.worldToLocal(new THREE.Vector3(...safePosition));
                updatedRelativePos = [
                  parseFloat(newLocal.x.toFixed(3)),
                  parseFloat(newLocal.y.toFixed(3)),
                  parseFloat(newLocal.z.toFixed(3)),
                ];
              }
            }
            return {
              ...s,
              position: safePosition,
              relativePosition: updatedRelativePos,
            };
          }),
        };
      })
    );
  };

  const handleUpdateSpotRotation = (id: string, rotation: number) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              spots: r.spots.map((s) => (s.id === id ? { ...s, rotation } : s)),
            }
          : r
      )
    );
  };

  const handleUpdateSpotRotationPitch = (id: string, rotationPitch: number) => {
    if (!Number.isFinite(rotationPitch)) return;
    const safePitch = Math.max(-90, Math.min(90, rotationPitch));
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              spots: r.spots.map((s) => (s.id === id ? { ...s, rotationPitch: safePitch } : s)),
            }
          : r
      )
    );
  };

  const handleAvatarTeleport = (spotId: string) => {
    setAvatarCurrentSpotId(spotId);
    const spot = activeRoom.spots.find((s) => s.id === spotId);
    if (!spot) return;

    // Detect target avatar object (customAvatarObjectId or any object marked as avatar)
    const targetAvatarObj =
      activeRoom.placedObjects.find((o) => o.id === customAvatarObjectId) ||
      activeRoom.placedObjects.find((o) => o.isAvatar || o.type === 'avatar');

    if (targetAvatarObj) {
      if (customAvatarObjectId !== targetAvatarObj.id) {
        setCustomAvatarObjectId(targetAvatarObj.id);
      }
      // Reposition the custom avatar object onto the clicked spot
      const spotAngleRad = (spot.rotation * Math.PI) / 180;
      const spotPitchRad = ((spot.rotationPitch || 0) * Math.PI) / 180;

      // Apply targetRotation / targetScale if captured from object or rotationPitch
      const finalRotation: [number, number, number] = spot.targetRotation
        ? [spot.targetRotation[0], spot.targetRotation[1], spot.targetRotation[2]]
        : [spotPitchRad, spotAngleRad, targetAvatarObj.rotation[2]];
      const finalScale: [number, number, number] = spot.targetScale
        ? [spot.targetScale[0], spot.targetScale[1], spot.targetScale[2]]
        : targetAvatarObj.scale;

      setRooms((prev) =>
        prev.map((r) =>
          r.id === activeRoomId
            ? {
                ...r,
                placedObjects: r.placedObjects.map((obj) =>
                  obj.id === targetAvatarObj.id
                    ? {
                        ...obj,
                        position: [spot.position[0], spot.position[1], spot.position[2]],
                        rotation: finalRotation,
                        scale: finalScale,
                      }
                    : obj
                ),
              }
            : r
        )
      );
      showToast(`Avatar "${targetAvatarObj.name}" posicionado no spot "${spot.name || 'Spot'}"!`);
    } else {
      showToast(`Avatar posicionado no spot "${spot.name || 'Spot'}"!`);
    }
  };

  // Drag and drop asset from inventory directly into 3D scene floor
  const handleDropItemOnScene = (item: InventoryItem, coords: [number, number, number]) => {
    if (item.type === 'Sala') {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === activeRoomId
            ? {
                ...r,
                sceneAssetBlobUrl: item.fileBlobUrl || undefined,
                sceneAssetId: item.id,
              }
            : r
        )
      );
      showToast(`Cenário 3D "${item.displayName}" carregado na cena!`);
      return;
    }

    const newObjId = `obj-${Date.now()}`;
    const newPlacedObject = {
      id: newObjId,
      assetId: item.id,
      name: item.displayName,
      type: 'movel' as const,
      position: coords,
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      modelType: (item.modelType || 'custom_glb') as any,
      fileBlobUrl: item.fileBlobUrl,
    };

    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? { ...r, placedObjects: [...r.placedObjects, newPlacedObject] }
          : r
      )
    );

    setSelectedObjectId(newObjId);
    setSelectedSpotId(null);
    showToast(`"${item.displayName}" inserido diretamente na posição [${coords[0]}, ${coords[2]}]!`);
  };

  // Boundary save
  const handleSaveBoundary = (boundary: PlayableBoundary) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === activeRoomId ? { ...r, boundary } : r))
    );
    showToast(`Limite jogável salvo: ${boundary.x}m × ${boundary.y}m × ${boundary.z}m!`);
  };

  // Publish room
  const handlePublishRoom = () => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? { ...r, isPublished: true, isPrivate: false, publishedAt: 'Agora' }
          : r
      )
    );
    setIsPublishModalOpen(true);
    showToast(`"${activeRoom.name}" publicada com sucesso! Ela agora aparece na Vitrine.`);
  };

  const handleEditPurchasedRoom = (item: InventoryItem) => {
    if (!user || user.isGuest) {
      setIsAuthModalOpen(true);
      return;
    }
    const storeItemId = item.storeItemId || item.id;
    const existingPrivateRoom = rooms.find(
      (room) =>
        room.isPrivate &&
        room.ownerUserId === user.id &&
        room.purchasedFromStoreItemId === storeItemId
    );
    if (existingPrivateRoom) {
      setActiveRoomId(existingPrivateRoom.id);
      setCurrentScreen('editor');
      showToast(`"${existingPrivateRoom.name}" aberta para editar.`);
      return;
    }

    const sceneAssetId = item.assetId || item.id;
    if (!sceneAssetId) {
      showToast('O modelo desta sala comprada não está disponível.');
      return;
    }
    const newRoom: RoomEditorState = {
      ...activeRoom,
      id: crypto.randomUUID(),
      name: item.displayName || item.name || 'Minha sala privada',
      ownerUserId: user.id,
      isPrivate: true,
      purchasedFromStoreItemId: storeItemId,
      sceneAssetId,
      sceneAssetBlobUrl: item.fileBlobUrl,
      placedObjects: [],
      spots: activeRoom.spots.map((spot) => ({ ...spot })),
      boundary: { ...activeRoom.boundary },
      radioUrl: undefined,
      playlist: [],
      audioEnabled: true,
      audioAutoplay: false,
      isPublished: false,
      publishedAt: undefined,
    };
    setRooms((previous) => [...previous, newRoom]);
    setActiveRoomId(newRoom.id);
    setCurrentScreen('editor');
    showToast(`"${newRoom.name}" aberta como sua cópia privada para editar.`);
  };

  // Attach/detach a pose object to avatars (editor avatar objects or store avatars)
  const handleTogglePoseAvatarAttachment = (poseObjectId: string, avatarId: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              placedObjects: r.placedObjects.map((obj) => {
                if (obj.id !== poseObjectId) return obj;
                const cur = obj.attachedAvatarIds || [];
                return {
                  ...obj,
                  attachedAvatarIds: cur.includes(avatarId)
                    ? cur.filter((x) => x !== avatarId)
                    : [...cur, avatarId],
                };
              }),
            }
          : r
      )
    );
  };

  // Change placed object type (Móvel | Objeto | Avatar | Acessório | Pose)
  const handleUpdateObjectType = (
    id: string,
    type: 'cenario' | 'movel' | 'objeto' | 'avatar' | 'acessorio' | 'pose'
  ) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId
          ? {
              ...r,
              placedObjects: r.placedObjects.map((obj) =>
                obj.id === id
                  ? {
                      ...obj,
                      type,
                      isAvatar: type === 'avatar',
                      isAccessory: type === 'acessorio',
                      isPose: type === 'pose',
                    }
                  : obj
              ),
            }
          : r
      )
    );

    if (type === 'avatar') {
      setCustomAvatarObjectId(id);
      showToast(`Objeto definido como Avatar! Ative o Modo Avatar para controlá-lo nos spots.`);
    } else if (type === 'acessorio') {
      if (customAvatarObjectId === id) {
        setCustomAvatarObjectId(null);
      }
      showToast(`Objeto definido como Acessório! Agora você pode equipar no avatar ou publicar na loja.`);
    } else {
      if (customAvatarObjectId === id) {
        setCustomAvatarObjectId(null);
      }
      showToast(`Tipo de objeto alterado para "${type}".`);
    }
  };

  // Dynamic lobby showcase rooms (combining default rooms + published editor rooms + persisted showcase rooms)
  const lobbyRooms: RoomData[] = React.useMemo(() => {
    let localShowcaseRooms: RoomData[] = [];
    try {
      const raw = localStorage.getItem('3d_social_creator_lobby_rooms');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localShowcaseRooms = parsed.map((item: any) => ({
            id: item.id || `showcase-${Date.now()}`,
            name: item.name || 'Sala Vitrine 3D',
            badge: item.badge || '👑',
            occupation: item.occupancy || '1/8',
            currentUsers: item.currentUsers || 1,
            maxUsers: item.maxUsers || 8,
            thumb: item.thumb || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
            description: item.description || 'Sala publicada na vitrine de rooms.',
            isFromEditor: true,
            editorRoomId: item.editorRoom?.id,
            editorRoom: item.editorRoom,
            ambientColor: '#ffd700',
          }));
        }
      }
    } catch (e) {
      console.warn('Error parsing local showcase rooms:', e);
    }

    const publishedEditorRooms: RoomData[] = rooms
      .filter((r) => r.isPublished && !r.isPrivate)
      .map((r) => ({
        id: `editor-${r.id}`,
        name: r.name,
        badge: '👑',
        occupation: '0/8',
        currentUsers: 0,
        maxUsers: 8,
        thumb:
          r.sceneAssetId === 'inv-scene-1'
            ? 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80'
            : r.sceneAssetId === 'inv-scene-2'
            ? 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80'
            : 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
        description: `Room criada no Modo Criador · Limite ${r.boundary.x}m × ${r.boundary.y}m × ${r.boundary.z}m com ${r.spots.length} spots ativos.`,
        isFromEditor: true,
        editorRoomId: r.id,
        editorRoom: r,
        ambientColor: '#ffd700',
      }));

    const combined = [...INITIAL_LOBBY_ROOMS];

    for (const pRoom of publicShowcaseRooms) {
      if (!combined.some((c) => c.id === pRoom.id)) {
        combined.push(pRoom);
      }
    }

    for (const sRoom of localShowcaseRooms) {
      if (!combined.some((c) => c.id === sRoom.id)) {
        combined.push(sRoom);
      }
    }

    for (const eRoom of publishedEditorRooms) {
      if (!combined.some((c) => c.id === eRoom.id)) {
        combined.push(eRoom);
      }
    }

    return combined;
  }, [rooms, publicShowcaseRooms]);

  const privateLobbyRooms: RoomData[] = React.useMemo(() => {
    if (!user || user.isGuest) return [];
    const privateRoomsByStoreItem = new Map<string, RoomEditorState>();
    rooms
      .filter((room) => room.isPrivate && room.ownerUserId === user.id && room.sceneAssetId)
      .forEach((room) => {
        if (room.purchasedFromStoreItemId) {
          privateRoomsByStoreItem.set(room.purchasedFromStoreItemId, room);
        }
      });

    inventory
      .filter((item) => item.isPurchased && item.type.toLowerCase() === 'sala')
      .forEach((item) => {
        const storeItemId = item.storeItemId || item.id;
        if (privateRoomsByStoreItem.has(storeItemId) || !(item.assetId || item.id)) return;
        const roomTemplate = INITIAL_ROOMS[0];
        privateRoomsByStoreItem.set(storeItemId, {
          ...roomTemplate,
          id: `private-${user.id}-${storeItemId}`,
          name: item.displayName || item.name || 'Sala privada',
          ownerUserId: user.id,
          isPrivate: true,
          purchasedFromStoreItemId: storeItemId,
          sceneAssetId: item.assetId || item.id,
          sceneAssetBlobUrl: item.fileBlobUrl,
          placedObjects: [],
          spots: roomTemplate.spots.map((spot) => ({ ...spot })),
          boundary: { ...roomTemplate.boundary },
          isPublished: false,
        });
      });

    return Array.from(privateRoomsByStoreItem.values()).map((privateRoom) => ({
      id: `private-${privateRoom.id}`,
      name: privateRoom.name,
      badge: '🔒',
      occupation: '1/8 · Privada',
      currentUsers: 1,
      maxUsers: 8,
      thumb: inventory.find(
        (item) => (item.storeItemId || item.id) === privateRoom.purchasedFromStoreItemId
      )?.thumbUrl || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      description: 'Sua sala privada comprada. Somente você e pessoas convidadas podem entrar.',
      isFromEditor: true,
      isPrivate: true,
      privateOwnerUserId: user.id,
      privateOwnerSessionId: appSessionId,
      editorRoomId: privateRoom.id,
      editorRoom: privateRoom,
      ownerUserId: user.id,
      ambientColor: '#ffd700',
    }));
  }, [rooms, inventory, user, appSessionId]);

  const handleAddFriend = async (friendUserId: string) => {
    if (!user || user.isGuest) {
      setIsAuthModalOpen(true);
      return;
    }
    await addOrAcceptFriend(user, friendUserId);
    setFriendConnections(await fetchFriendConnections(user));
  };

  const handleInviteOnlineUser = (onlineUser: OnlineLobbyUser) => {
    const currentRoom = currentScreen === 'room' ? selectedLobbyRoom : null;
    if (!currentRoom || !onlineChannelRef.current || !onlineChannelReadyRef.current) {
      showToast('Conecte-se à sala para enviar um convite.');
      return;
    }
    if (currentRoom.isPrivate && currentRoom.privateOwnerUserId !== user?.id) {
      showToast('Somente o dono pode convidar pessoas para esta sala privada.');
      return;
    }
    void onlineChannelRef.current.send({
      type: 'broadcast',
      event: 'room-invite',
      payload: {
        recipientSessionId: onlineUser.userId ? undefined : onlineUser.sessionId,
        recipientUserId: onlineUser.userId,
        roomId: currentRoom.id,
        roomName: currentRoom.name || 'Sala',
        senderName: user?.displayName || 'Um usuário',
        ...(currentRoom.isPrivate
          ? {
              roomData: currentRoom,
              ownerSessionId: currentRoom.privateOwnerSessionId,
            }
          : {}),
      },
    }).then((status: string) => {
      if (status !== 'ok') {
        console.warn('[Online presence] Room invite broadcast failed:', { status });
        showToast('Não foi possível enviar o convite.');
        return;
      }
      showToast(`Convite enviado para ${onlineUser.displayName}.`);
    }).catch((error: unknown) => {
      console.warn('[Online presence] Room invite broadcast rejected:', error);
      showToast('Falha de conexão ao enviar o convite.');
    });
  };

  const handleAcceptRoomInvite = () => {
    if (!incomingRoomInvite) return;
    const invitedRoom =
      incomingRoomInvite.roomData ||
      lobbyRooms.find((room) => room.id === incomingRoomInvite.roomId);
    if (!invitedRoom) {
      showToast('Esta sala não está mais disponível na vitrine.');
      setIncomingRoomInvite(null);
      return;
    }
    if (
      invitedRoom.isPrivate &&
      (!incomingRoomInvite.ownerSessionId ||
        !onlineUsers.some(
          (onlineUser) =>
            onlineUser.sessionId === incomingRoomInvite.ownerSessionId &&
            onlineUser.roomId === invitedRoom.id
        ))
    ) {
      showToast('O dono não está mais na sala privada.');
      setIncomingRoomInvite(null);
      return;
    }
    setSelectedLobbyRoom(invitedRoom);
    setCurrentScreen('room');
    setIncomingRoomInvite(null);
  };

  // Handle Playtest room without publishing or appearing in vitrine
  const handlePlaytestActiveRoom = () => {
    setIsPublishModalOpen(false);
    const playtestRoomData: RoomData = {
      id: `playtest-${activeRoom.id}`,
      name: `[TESTE] ${activeRoom.name}`,
      badge: '🧪',
      occupation: '1/8 (Você)',
      currentUsers: 1,
      maxUsers: 8,
      thumb:
        activeRoom.sceneAssetId === 'inv-scene-1'
          ? 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80'
          : activeRoom.sceneAssetId === 'inv-scene-2'
          ? 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80'
          : 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
      description: `Modo teste interativo da room. Interaja com os spots e avatar sem publicar na vitrine.`,
      isFromEditor: true,
      editorRoomId: activeRoom.id,
      editorRoom: activeRoom,
      isPlaytest: true,
      ambientColor: '#ffd700',
    };
    setSelectedLobbyRoom(playtestRoomData);
    setCurrentScreen('room');
    showToast(`Iniciando Modo Teste Interativo de "${activeRoom.name}"!`);
  };

  // Go to showcase after publishing
  const handleGoToVitrine = () => {
    setIsPublishModalOpen(false);
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId ? { ...r, isPublished: true, publishedAt: 'Agora' } : r
      )
    );
    loadPublicShowcaseRooms();
    const targetRoomId = `editor-${activeRoom.id}`;
    const foundIndex = lobbyRooms.findIndex((r) => r.id === targetRoomId || r.name === activeRoom.name);
    if (foundIndex >= 0) {
      setLobbyRoomIndex(foundIndex);
    } else {
      setLobbyRoomIndex(lobbyRooms.length);
    }
    setCurrentScreen('lobby');
    showToast(`Exibindo "${activeRoom.name}" na Vitrine de Rooms!`);
  };

  const timelineSpot = activeRoom.spots.find((s) => s.id === timelineSpotId) || activeRoom.spots[0] || null;

  return (
    <>
      {/* Screen 1: Lobby View (Portals & Social Hall) */}
      {currentScreen === 'lobby' && (
        <LobbyView
          rooms={lobbyRooms}
          privateRooms={privateLobbyRooms}
          selectedRoomIndex={lobbyRoomIndex}
          onSelectRoomIndex={setLobbyRoomIndex}
          onEnterRoom={(room) => {
            setSelectedLobbyRoom(room);
            setCurrentScreen('room');
          }}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onOpenCustomization={() => {
            setCustomizationInitialTab('inventario');
            setCurrentScreen('customization');
          }}
          onOpenFriends={() => {
            setIsFriendsModalOpen(true);
          }}
          onOpenEditor={() => setCurrentScreen('editor')}
          user={user}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onLogout={handleLogout}
          movementSettings={roomMovementSettings}
          onMovementSettingsChange={setRoomMovementSettings}
          storeProducts={roomStoreCatalog}
          storeLoading={storeLoading}
          storeError={storeError}
          coins={walletCoins}
          onPurchaseStoreItem={handlePurchaseStoreItem}
          wishlistItemIds={wishlistItemIds}
          friends={friendConnections.filter((friend) => friend.status === 'accepted')}
          onToggleWishlist={handleToggleWishlistItem}
          onOpenWishlist={() => {
            if (!user || user.isGuest) {
              setIsAuthModalOpen(true);
              return;
            }
            setStoreSocialModal({ type: 'wishlist' });
          }}
          onGiftProduct={(product) => setStoreSocialModal({ type: 'friend-gift', product })}
        />
      )}

      {/* Screen 2: User Customization & Loja View (Matching Images 2 & 3) */}
      {currentScreen === 'customization' && (
        <UserCustomizationView
          onBackToLobby={() => setCurrentScreen('lobby')}
          user={user}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
          initialTab={customizationInitialTab}
          hideStoreTab={customizationInitialTab === 'inventario'}
          userInventory={inventory}
          availableActions={attachableActionInventory}
          onEditPurchasedRoom={handleEditPurchasedRoom}
          wishlistItemIds={wishlistItemIds}
          onToggleWishlistItem={handleToggleWishlistItem}
          onOpenWishlist={() => {
            if (!user || user.isGuest) {
              setIsAuthModalOpen(true);
              return;
            }
            setStoreSocialModal({ type: 'wishlist' });
          }}
          onGiftStoreItem={(productId) => {
            const product = roomStoreCatalog.find((storeProduct) => storeProduct.id === productId);
            if (!product) {
              showToast('Este item não está disponível para presentear.');
              return;
            }
            setStoreSocialModal({ type: 'friend-gift', product });
          }}
          customizationItems={customizationItems}
          storeAvatars={storeAvatars}
          coins={walletCoins}
          storeLoading={storeLoading}
          storeError={storeError}
          inventoryLoading={inventoryLoading}
          inventoryError={inventoryError}
          onPurchaseStoreItem={handlePurchaseStoreItem}
          activeAvatarId={activeAvatarId}
          poses={avatarPoses}
          onTogglePoseAction={handleTogglePoseAction}
          onToggleEquipItem={handleToggleEquipItem}
          onRemoveItemFromInventory={handleRemoveItemFromInventory}
          onApplyPose={handleApplyPose}
          onRemovePose={handleRemovePose}
          onPublishCustomItem={handlePublishCustomItem}
          previewStoreItemId={customizationPreviewItemId}
          onStoreItemPreviewed={() => setCustomizationPreviewItemId(null)}
          previewStoreAvatarId={customizationPreviewAvatarId}
          onStoreAvatarPreviewed={() => setCustomizationPreviewAvatarId(null)}
          onSelectActiveAvatar={handleSelectActiveAvatar}
          onPublishPose={handlePublishPose}
          onUpdateCustomizationItemTransform={(itemId, transform) => {
            setCustomizationItems((prev) => {
              const updated = prev.map((it) =>
                it.id === itemId ? { ...it, accessoryTransform: transform, equipped: true } : it
              );
              safeLocalStorageSet('3d_social_creator_customization_items', JSON.stringify(sanitizeItemsForStorage(updated)));
              return updated;
            });

            // Also synchronize in user inventory
            setInventory((prev) =>
              prev.map((inv) =>
                inv.id === itemId
                  ? { ...inv, accessoryTransform: transform, isAccessory: true }
                  : inv
              )
            );
          }}
          roomAccessSlots={roomAccessSlots}
          onUpdateRoomAccessSlots={handleUpdateRoomAccessSlots}
        />
      )}

      {/* Screen 3: Social Room View (Avatar Lounge with Poses, Chat & Gizmo) */}
      {currentScreen === 'room' && selectedLobbyRoom && (
        <RoomView
          room={selectedLobbyRoom}
          customAvatarObject={
            selectedLobbyRoom.editorRoom?.placedObjects.find((o) => o.id === customAvatarObjectId) ||
            null
          }
          activeUserAvatar={activeUserAvatar}
          user={user}
          poses={avatarPoses}
          storeAvatars={storeAvatars}
          roomAccessSlots={roomAccessSlots}
          onUpdateRoomAccessSlots={handleUpdateRoomAccessSlots}
          onExitToLobby={() => {
            if (selectedLobbyRoom.isPlaytest) {
              setCurrentScreen('editor');
            } else {
              setCurrentScreen('lobby');
            }
          }}
          equippedAccessories={customizationItems.filter((i) => i.equipped && i.isAccessory)}
          spotVisualConfig={spotVisualConfig}
          movementSettings={roomMovementSettings}
          storeProducts={roomStoreCatalog}
          storeLoading={storeLoading}
          storeError={storeError}
          inventory={inventory}
          inventoryLoading={inventoryLoading}
          coins={walletCoins}
          onPurchaseStoreItem={handlePurchaseStoreItem}
          onSelectActiveAvatar={handleSelectActiveAvatar}
          onToggleEquipItem={handleToggleEquipItem}
          onApplyPose={handleApplyPose}
          onOpenFriends={() => setIsFriendsModalOpen(true)}
          friendConnections={friendConnections}
          wishlistItemIds={wishlistItemIds}
          onToggleWishlist={handleToggleWishlistItem}
          onOpenWishlist={() => {
            if (!user || user.isGuest) {
              setIsAuthModalOpen(true);
              return;
            }
            setStoreSocialModal({ type: 'wishlist' });
          }}
          onGiftProduct={(product) => setStoreSocialModal({ type: 'friend-gift', product })}
          onViewUserWishlist={(userId, displayName) =>
            setStoreSocialModal({ type: 'user-wishlist', userId, displayName })
          }
        />
      )}

      {/* Screen 4: Creator Editor 3D Mode */}
      <div className={currentScreen === 'editor' ? 'block' : 'hidden'}>
        <div className="w-screen h-screen bg-[#0a0b0d] text-[#e0cfb3] font-sans flex items-center justify-center p-0 md:p-3 overflow-hidden select-none">
      {/* 16:9 Mockup Frame with Fine Gold Border matching the new visual identity */}
      <div
        className={`relative w-full h-full bg-[#101115] border border-[#d4af37]/30 rounded-none md:rounded-xl overflow-hidden shadow-[0_0_35px_rgba(0,0,0,0.85)] flex flex-col ${
          is16x9MockupMode ? 'max-w-[1440px] aspect-video max-h-[96vh]' : 'max-w-none'
        }`}
      >
        {/* TOP BAR / HEADER with required controls */}
        <CreatorHeader
          rooms={rooms}
          activeRoomId={activeRoomId}
          onSelectRoom={(id) => {
            setActiveRoomId(id);
            setSelectedSpotId(null);
            setSelectedObjectId(null);
          }}
          onAddNewRoom={handleAddNewRoom}
          onOpenBoundaryModal={() => setIsBoundaryModalOpen(true)}
          onPublishRoom={handlePublishRoom}
          onOpenPublicationsModal={() => setIsMyPublicationsModalOpen(true)}
          onOpenProjectModal={(tab = 'export') => {
            setProjectModalInitialTab(tab);
            setIsProjectModalOpen(true);
          }}
          onPlaytestRoom={handlePlaytestActiveRoom}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          user={user}
          onLogout={handleLogout}
          isAvatarMode={isAvatarMode}
          onToggleAvatarMode={() => setIsAvatarMode(!isAvatarMode)}
          showBoundaryGhost={showBoundaryGhost}
          onToggleBoundaryGhost={() => setShowBoundaryGhost(!showBoundaryGhost)}
          showSpots={showSpots}
          onToggleShowSpots={() => setShowSpots(!showSpots)}
          lockSpots={lockSpots}
          onToggleLockSpots={() => setLockSpots(!lockSpots)}
          onExitEditor={() => setCurrentScreen('lobby')}
        />

        {/* MAIN STUDIO WORKSPACE: Left Sidebar (Spots / Inventário) + 3D Center Editor Canvas */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Sidebar matching user screenshot with Spots, Objetos (com lixeira) e Itens */}
          <CreatorSidebar
            inventory={inventory}
            spots={activeRoom.spots}
            placedObjects={activeRoom.placedObjects}
            selectedObjectId={selectedObjectId}
            activeGizmoMode={activeGizmoMode}
            onSelectObjectId={(id) => {
              setSelectedObjectId(id);
              if (id) setSelectedSpotId(null);
            }}
            onRemoveObject={handleRemoveObject}
            onOpenUploadModal={() => setIsUploadModalOpen(true)}
            onOpenAudioUploadModal={() => setIsAudioUploadModalOpen(true)}
            onInsertAssetToScene={handleInsertAssetToScene}
            onCreateBonePoseFromAsset={handleOpenBonePoseEditor}
            onOpenBoneTransfer={() => setIsTransferBonesOpen(true)}
            onAddSpot={handleAddSpot}
            onRenameSpot={handleRenameSpot}
            onRemoveSpot={handleRemoveSpot}
            onClearAllSpots={handleClearAllSpots}
            onRemoveOverlappingSpots={handleRemoveOverlappingSpots}
            onSelectSpot={(spot) => {
              setSelectedSpotId(spot.id);
              setSelectedObjectId(null);
              if (isAvatarMode) {
                handleAvatarTeleport(spot.id);
              }
            }}
            activeSpotId={selectedSpotId}
            insertionCursorPoint={insertionCursorPoint}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            customAvatarObjectId={customAvatarObjectId}
            onSetCustomAvatarObjectId={setCustomAvatarObjectId}
            onUpdateObjectType={handleUpdateObjectType}
            storeAvatars={storeAvatars}
            onTogglePoseAvatarAttachment={handleTogglePoseAvatarAttachment}
            onPublishObject={handlePublishPlacedObject}
            onPublishRoom={handlePublishRoom}
            sceneAssetBlobUrl={activeRoom.sceneAssetBlobUrl}
            sceneAssetName={
              activeRoom.sceneAssetBlobUrl
                ? inventory.find(
                    (i) =>
                      i.fileBlobUrl === activeRoom.sceneAssetBlobUrl ||
                      i.id === activeRoom.sceneAssetId
                  )?.displayName || 'Cenário 3D da Sala'
                : undefined
            }
            onRemoveScenario={() => {
              setRooms((prev) =>
                prev.map((r) =>
                  r.id === activeRoomId
                    ? { ...r, sceneAssetBlobUrl: undefined, sceneAssetId: null }
                    : r
                )
              );
              showToast('Cenário 3D removido da sala.');
            }}
            onPublishInventoryItem={handlePublishInventoryItemToStore}
            onRenameInventoryItem={handleRenameInventoryItem}
            onRenamePlacedObject={handleRenamePlacedObject}
            onDeleteInventoryItem={handleDeleteInventoryItem}
            onDeleteMultipleInventoryItems={handleDeleteMultipleInventoryItems}
            onClearAllInventory={handleClearAllInventory}
            onOpenProjectModal={(tab = 'export') => {
              setProjectModalInitialTab(tab);
              setIsProjectModalOpen(true);
            }}
            onAddSpotAtObject={handleAddSpotAtObject}
            onStartSurfaceSnap={handleStartSurfaceSnap}
            onCancelSurfaceSnap={handleCancelSurfaceSnap}
            isSurfaceSnapMode={isSurfaceSnapMode}
            surfaceSnapTargetObjectId={surfaceSnapTargetObjectId}
            onUpdateSpotMotion={handleUpdateSpotMotion}
            onToggleTestSpotMotion={handleToggleTestSpotMotion}
            testingMotionSpotId={testingMotionSpotId}
            onDetachSpotFromObject={handleDetachSpotFromObject}
            onOpenSpotVisualConfig={() => setIsSpotVisualConfigModalOpen(true)}
            onOpenTrajectoryTimeline={(spotId) => {
              setTimelineSpotId(spotId);
              setIsTrajectoryTimelineModalOpen(true);
            }}
            onAvatarTeleport={handleAvatarTeleport}
            avatarCurrentSpotId={avatarCurrentSpotId}
            onUpdateSpotRotation={handleUpdateSpotRotation}
            onUpdateSpotRotationPitch={handleUpdateSpotRotationPitch}
            onCaptureObjectCoordinatesToSpot={handleCaptureObjectCoordinatesToSpot}
            onCaptureObjectRotationToSpot={handleCaptureObjectRotationToSpot}
            onCaptureObjectScaleToSpot={handleCaptureObjectScaleToSpot}
            onApplySpotCoordinatesToObject={handleApplySpotCoordinatesToObject}
            onUpdateObjectActions={handleUpdateObjectActions}
            onToggleTestObjectAction={handleToggleTestObjectAction}
            onPreviewObjectAction={handlePreviewObjectAction}
            onPauseTestObjectAction={handlePauseTestObjectAction}
            onResumeTestObjectAction={handleResumeTestObjectAction}
            testingObjectAction={testingObjectAction}
            actionHistory={actionHistory}
            onSaveActionToHistory={handleSaveActionToHistory}
            onRemoveActionFromHistory={handleRemoveActionFromHistory}
            onApplyActionFromHistoryToObject={handleApplyActionFromHistoryToObject}
          />

          {/* 3D Scene Viewport */}
          <main className="flex-1 relative h-full overflow-hidden bg-[#101115]">
            <CreatorEditorCanvas3D
              sceneAssetBlobUrl={activeRoom.sceneAssetBlobUrl}
              sceneAssetId={activeRoom.sceneAssetId}
              placedObjects={activeRoom.placedObjects}
              spots={activeRoom.spots}
              boundary={activeRoom.boundary}
              selectedSpotId={selectedSpotId}
              selectedObjectId={selectedObjectId}
              onSelectSpot={(id) => {
                setSelectedSpotId(id);
                if (id) setSelectedObjectId(null);
              }}
              onSelectObject={(id) => {
                setSelectedObjectId(id);
                if (id) setSelectedSpotId(null);
              }}
              onUpdateSpotPosition={handleUpdateSpotPosition}
              onUpdateSpotRotation={handleUpdateSpotRotation}
              onUpdateSpotRotationPitch={handleUpdateSpotRotationPitch}
              onCaptureObjectCoordinatesToSpot={handleCaptureObjectCoordinatesToSpot}
              onCaptureObjectRotationToSpot={handleCaptureObjectRotationToSpot}
              onCaptureObjectScaleToSpot={handleCaptureObjectScaleToSpot}
              onApplySpotCoordinatesToObject={handleApplySpotCoordinatesToObject}
              onRemoveSpot={handleRemoveSpot}
              onClearAllSpots={handleClearAllSpots}
              onRemoveOverlappingSpots={handleRemoveOverlappingSpots}
              onUpdateObjectTransform={handleUpdateObjectTransform}
              onRemoveObject={handleRemoveObject}
              onUpdateBoundary={handleSaveBoundary}
              onSceneClickInsertionPoint={(point) => {
                setInsertionCursorPoint(point);
              }}
              insertionCursorPoint={insertionCursorPoint}
              isAvatarMode={isAvatarMode}
              showBoundaryGhost={showBoundaryGhost}
              showSpots={showSpots}
              lockSpots={lockSpots}
              onToggleShowSpots={() => setShowSpots(!showSpots)}
              onToggleLockSpots={() => setLockSpots(!lockSpots)}
              activeGizmoMode={activeGizmoMode}
              onChangeGizmoMode={setActiveGizmoMode}
              avatarCurrentSpotId={avatarCurrentSpotId}
              onAvatarTeleport={handleAvatarTeleport}
              onAvatarManualMove={() => setAvatarCurrentSpotId(null)}
              customAvatarObjectId={customAvatarObjectId}
              onSetCustomAvatarObjectId={setCustomAvatarObjectId}
              onUpdateObjectType={handleUpdateObjectType}
              onDropItemOnScene={handleDropItemOnScene}
              onAddSpotAtObject={handleAddSpotAtObject}
              surfaceSnapTargetObjectId={surfaceSnapTargetObjectId}
              onCancelSurfaceSnap={handleCancelSurfaceSnap}
              onAddRelativeSpot={handleAddRelativeSpot}
              testingMotionSpotId={testingMotionSpotId}
              onToggleTestSpotMotion={handleToggleTestSpotMotion}
              activeUserAvatar={activeUserAvatar}
              spotVisualConfig={spotVisualConfig}
              onUpdateSpotMotion={handleUpdateSpotMotion}
              testingObjectAction={testingObjectAction}
              onOpenTrajectoryTimeline={(spotId) => {
                setTimelineSpotId(spotId);
                setIsTrajectoryTimelineModalOpen(true);
              }}
              onExitEditor={() => setCurrentScreen('lobby')}
            />

            {/* Top-Right Aspect Ratio Toggle */}
            <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIs16x9MockupMode(!is16x9MockupMode)}
                className="px-2 py-1 rounded bg-[#121317]/90 hover:bg-[#d4af37] hover:text-black border border-[#d4af37]/50 text-[10px] font-semibold text-[#d4af37] uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 shadow-md"
                title={is16x9MockupMode ? 'Alternar para tela cheia fluida' : 'Ajustar para Mockup 16:9'}
              >
                {is16x9MockupMode ? (
                  <>
                    <Maximize2 className="w-3 h-3" />
                    <span className="hidden sm:inline">16:9</span>
                  </>
                ) : (
                  <>
                    <Minimize2 className="w-3 h-3" />
                    <span className="hidden sm:inline">Fluido</span>
                  </>
                )}
              </button>
            </div>
          </main>
        </div>

        {/* BOTTOM BAR matching Reference Image */}
        <footer className="w-full bg-[#121317]/95 border-t border-[#d4af37]/30 px-6 py-2.5 flex items-center justify-between text-xs text-[#d4af37]/90 z-30">
          <div className="flex items-center gap-2.5">
            <Lightbulb className="w-4 h-4 text-[#d4af37] flex-shrink-0" />
            <p className="font-normal tracking-wide">
              Toggle Avatar = testar clique. Olho = mostrar/ocultar limite.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-[11px] text-[#e8d5b5]/70">
            <span>Clique no sofá = avatar vai para este spot.</span>
          </div>
        </footer>
      </div>
    </div>
  </div>

  {/* Global Toast Notification (Accessible on all screens) */}
  {statusToast && (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] bg-[#121317] border border-[#ffd700] px-5 py-2.5 rounded-xl text-xs font-bold text-[#ffd700] shadow-[0_4px_30px_rgba(0,0,0,0.9)] animate-fade-in flex items-center gap-2 pointer-events-none">
      <Sparkles className="w-4 h-4 text-[#ffd700]" />
      <span>{statusToast}</span>
    </div>
  )}

  {/* GLOBAL MODALS (Always mounted and accessible across all screens: Lobby, Loja, Room, Editor) */}
  <AuthModal
    isOpen={isAuthModalOpen}
    onClose={() => setIsAuthModalOpen(false)}
    currentUser={user}
    onAuthSuccess={(u) => {
      setUser(u);
      showToast(`Conectado como ${u.displayName}`);
    }}
    onLogout={handleLogout}
  />

  <UserProfileModal
    isOpen={isProfileModalOpen}
    onClose={() => setIsProfileModalOpen(false)}
    user={user}
    onProfileUpdated={setUser}
    onOpenAuth={() => {
      setIsProfileModalOpen(false);
      setIsAuthModalOpen(true);
    }}
  />

  <FriendsModal
    isOpen={isFriendsModalOpen}
    onClose={() => setIsFriendsModalOpen(false)}
    user={user}
    onlineUsers={onlineUsers}
    friends={friendConnections}
    isLoadingFriends={isLoadingFriends}
    currentRoomName={
      currentScreen === 'room' && selectedLobbyRoom && !selectedLobbyRoom.isPlaytest
        ? selectedLobbyRoom.name
        : undefined
    }
    onAddFriend={handleAddFriend}
    onInviteToRoom={handleInviteOnlineUser}
  />

  {storeSocialModal && (
    <StoreSocialModal
      state={storeSocialModal}
      products={roomStoreCatalog}
      wishlistItemIds={storeSocialModal.type === 'wishlist' ? wishlistItemIds : socialWishlistItemIds}
      friends={friendConnections.filter((friend) => friend.status === 'accepted')}
      loadingWishlist={isSocialWishlistLoading}
      onClose={() => setStoreSocialModal(null)}
      onPurchase={(productId) => handlePurchaseStoreItem(productId).then(() => undefined)}
      onGift={handlePurchaseGift}
      onRemoveWishlistItem={async (productId) => {
        if (!user || user.isGuest) return;
        await setWishlistStoreItem(user, productId, false);
        setWishlistItemIds((ids) => ids.filter((id) => id !== productId));
      }}
    />
  )}

  {incomingRoomInvite && (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-invite-title"
        className="w-full max-w-sm rounded-2xl border border-amber-400/50 bg-[#141519] p-5 text-zinc-100 shadow-2xl"
      >
        <h2 id="room-invite-title" className="text-sm font-bold text-white">
          Convite para a sala
        </h2>
        <p className="mt-2 text-xs text-zinc-300">
          {incomingRoomInvite.senderName} convidou você para <strong>{incomingRoomInvite.roomName}</strong>.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setIncomingRoomInvite(null)}
            className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={handleAcceptRoomInvite}
            className="flex-1 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-black hover:bg-amber-300"
          >
            Entrar na sala
          </button>
        </div>
      </section>
    </div>
  )}

  <UploadGLBModal
    isOpen={isUploadModalOpen}
    onClose={() => setIsUploadModalOpen(false)}
    onUploadSuccess={handleUploadSuccess}
    user={user}
    userDisplayName={user?.displayName || 'Luzenne'}
    onPublishToStore={handlePublishInventoryItemToStore}
  />

  <AudioUploadModal
    isOpen={isAudioUploadModalOpen}
    onClose={() => setIsAudioUploadModalOpen(false)}
    user={user}
    onUploadSuccess={handleUploadSuccess}
    onPublish={handlePublishInventoryItemToStore}
  />

  <BoundaryModal
    isOpen={isBoundaryModalOpen}
    onClose={() => setIsBoundaryModalOpen(false)}
    boundary={activeRoom.boundary}
    onSaveBoundary={handleSaveBoundary}
    roomName={activeRoom.name}
  />

  <PublishModal
    isOpen={isPublishModalOpen}
    onClose={() => setIsPublishModalOpen(false)}
    room={activeRoom}
    user={user}
    onGoToVitrine={handleGoToVitrine}
    onPlaytest={handlePlaytestActiveRoom}
  />

  <PublishItemModal
    isOpen={isPublishItemModalOpen}
    onClose={() => setIsPublishItemModalOpen(false)}
    item={publishingItem}
    user={user}
    availableActions={attachableActionInventory}
    availableAvatars={storeAvatars}
    attachInfo={(() => {
      if (!publishingItem) return undefined;
      const sid = publishingItem.sourceObjectId;
      const objs = activeRoom.placedObjects.filter((o) =>
        sid ? o.id === sid : o.assetId === publishingItem.id || o.assetId === publishingItem.assetId
      );
      const keys = new Set<string>(objs.map((o) => o.id));
      keys.add(publishingItem.id);
      const poses = activeRoom.placedObjects
        .filter((o) => (o.type === 'pose' || o.isPose) && o.attachedAvatarIds?.some((id) => keys.has(id)))
        .map((o) => ({ id: o.id, name: o.name, published: avatarPoses.some((p) => p.sourceObjectId === o.id) }));
      const attachedIds = Array.from(new Set(objs.flatMap((o) => o.attachedAvatarIds || [])));
      const unpublishedAvatars = attachedIds
        .filter((id) => !storeAvatars.some((a) => a.id === id || a.originalItemId === id || a.assetId === id))
        .map((id) => activeRoom.placedObjects.find((o) => o.id === id)?.name)
        .filter((n): n is string => Boolean(n));
      return {
        poses,
        unpublishedAvatars,
        existing: (() => {
          const it = publishingItem;
          const av = storeAvatars.find((a) => a.isUserPublished && a.originalItemId === it.id);
          if (av) return { id: av.id, name: av.name, kind: 'avatar' as const };
          const po = sid
            ? avatarPoses.find((p) => p.isPublishedByCreator && p.sourceObjectId === sid)
            : undefined;
          if (po) return { id: po.id, name: po.name, kind: 'pose' as const };
          const ci = customizationItems.find((i) => i.isPublishedByCreator && i.originalItemId === it.id);
          if (ci) return { id: ci.id, name: ci.name, kind: 'item' as const };
          return undefined;
        })(),
      };
    })()}
    onConfirmPublish={handleConfirmPublishItem}
    onGoToStore={() => {
      setIsPublishItemModalOpen(false);
      setCustomizationInitialTab('loja');
      setCurrentScreen('customization');
    }}
  />

  <MyPublicationsModal
    isOpen={isMyPublicationsModalOpen}
    onClose={() => setIsMyPublicationsModalOpen(false)}
    user={user}
    onLoadRoomForEdit={handleLoadRoomForEdit}
    currentEditingRoomId={activeRoomId}
    storeAvatars={storeAvatars}
    customizationItems={customizationItems}
    avatarPoses={avatarPoses}
    onShowToast={showToast}
    onDeleteItem={(id, type) => {
      if (type === 'avatar') setStoreAvatars((prev) => prev.filter((a) => a.id !== id));
      else if (type === 'pose') setAvatarPoses((prev) => prev.filter((p) => p.id !== id));
      else setCustomizationItems((prev) => prev.filter((i) => i.id !== id));
    }}
    onUpdatePublishedItem={(type, id, patch) => {
      const apply = <T extends { id: string }>(list: T[]) =>
        list.map((x) => (x.id === id ? { ...x, ...patch } : x));
      if (type === 'avatar') setStoreAvatars((prev) => apply(prev));
      else if (type === 'pose') setAvatarPoses((prev) => apply(prev));
      else setCustomizationItems((prev) => apply(prev));
    }}
  />

  {/* Modal de Sinalização e Visual dos Spots */}
  {isSpotVisualConfigModalOpen && (
    <SpotVisualConfigModal
      isOpen={isSpotVisualConfigModalOpen}
      config={spotVisualConfig}
      onChangeConfig={setSpotVisualConfig}
      onClose={() => setIsSpotVisualConfigModalOpen(false)}
    />
  )}

  {/* Modal de Trajetória e Timeline Estilo Edição de Vídeo */}
  {isTrajectoryTimelineModalOpen && timelineSpot && (
    <TrajectoryTimelineModal
      spot={timelineSpot}
      onClose={() => {
        setIsTrajectoryTimelineModalOpen(false);
        if (testingMotionSpotId === timelineSpot.id) {
          handleToggleTestSpotMotion(timelineSpot.id);
        }
      }}
      onUpdateMotion={(motion) => handleUpdateSpotMotion(timelineSpot.id, motion)}
      isTesting={testingMotionSpotId === timelineSpot.id}
      onToggleTest={() => handleToggleTestSpotMotion(timelineSpot.id)}
    />
  )}

  {/* Modal de Salvar, Exportar e Restaurar Projeto */}
  <ProjectSaveRestoreModal
    isOpen={isProjectModalOpen}
    initialTab={projectModalInitialTab}
    onClose={() => setIsProjectModalOpen(false)}
    rooms={rooms}
    inventory={inventory}
    activeRoomId={activeRoomId}
    customizationItems={customizationItems}
    storeAvatars={storeAvatars}
    avatarPoses={avatarPoses}
    spotVisualConfig={spotVisualConfig}
    user={user}
    onRestoreProject={handleRestoreProject}
  />
  {bonePoseEditorAvatar && (
    <BonePoseEditor
      avatar={bonePoseEditorAvatar}
      onClose={() => setBonePoseEditorAvatar(null)}
      onSave={(name, rotations) => handleCreateBonePose(name, rotations, bonePoseEditorAvatar)}
    />
  )}
  {isTransferBonesOpen && (
    <TransferBonesModal
      onClose={() => setIsTransferBonesOpen(false)}
      onComplete={(item) => {
        handleUploadSuccess(item, null);
        showToast(`Rig aplicado. "${item.displayName}" foi salvo como um novo item.`);
      }}
    />
  )}
</>
);
};

export default App;
