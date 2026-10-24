import React, { useState, useEffect } from 'react';
import { Box, LogOut, Sparkles, X, Plus, GripVertical, Check, Heart, MessageSquare, Package, Move3d, Store, LoaderCircle, CheckCircle2, Coins, Users } from 'lucide-react';
import {
  RoomData,
  AvatarPose,
  AvatarTransform,
  GizmoMode,
  Spot,
  ChatMessage,
  SpeechBubbleItem,
  StoreAvatar,
  CreatorUser,
  AvatarPoseConfig,
  SpotVisualConfig,
  PlacedObject,
  RoomAccessSlot,
  ObjectAction,
  RoomMovementSettings,
  InventoryItem,
} from '../types';
import { INITIAL_POSES, INITIAL_SPOTS, INITIAL_CHAT } from '../data/initialData';
import { LoungeCanvas3D } from './LoungeCanvas3D';
import { GizmoWidget } from './GizmoWidget';
import { GlassChat } from './GlassChat';
import { SpeechBubbleOverlay } from './SpeechBubbleOverlay';
import { UnifiedRoomInventory } from './UnifiedRoomInventory';
import { RoomAudioPlayer } from './RoomAudioPlayer';
import { safeLocalStorageSet } from '../lib/storageUtils';
import { supabase } from '../lib/supabase';
import { toggleRoomLike } from '../lib/database';
import { RoomStoreProduct, RoomStoreShowroom3D } from './RoomStoreShowroom3D';

interface RoomViewProps {
  room: RoomData;
  onExitToLobby: () => void;
  equippedAccessories?: any[];
  activeUserAvatar?: StoreAvatar | null;
  user?: CreatorUser | null;
  poses?: AvatarPoseConfig[];
  storeAvatars?: StoreAvatar[];
  roomAccessSlots?: RoomAccessSlot[];
  onUpdateRoomAccessSlots?: (slots: RoomAccessSlot[]) => void;
  spotVisualConfig?: SpotVisualConfig;
  customAvatarObject?: PlacedObject | null;
  movementSettings: RoomMovementSettings;
  storeProducts: RoomStoreProduct[];
  storeLoading: boolean;
  storeError: string | null;
  inventory: InventoryItem[];
  inventoryLoading: boolean;
  coins: number | null;
  onPurchaseStoreItem: (storeItemId: string) => Promise<unknown>;
  onSelectActiveAvatar?: (avatarId: string) => void;
  onToggleEquipItem?: (itemId: string) => void;
  onApplyPose?: (poseId: string) => void;
  onOpenFriends: () => void;
}

export const RoomView: React.FC<RoomViewProps> = ({
  room,
  onExitToLobby,
  equippedAccessories,
  activeUserAvatar,
  user,
  poses: propPoses,
  storeAvatars = [],
  roomAccessSlots: propRoomAccessSlots,
  onUpdateRoomAccessSlots,
  spotVisualConfig,
  customAvatarObject,
  movementSettings,
  storeProducts,
  storeLoading,
  storeError,
  inventory,
  inventoryLoading,
  coins,
  onPurchaseStoreItem,
  onSelectActiveAvatar,
  onToggleEquipItem,
  onApplyPose,
  onOpenFriends,
}: RoomViewProps) => {
  // Live Avatar state (can switch dynamically inside room via Room Access Bar!)
  const [liveAvatar, setLiveAvatar] = useState<StoreAvatar | null>(() => {
    return activeUserAvatar || null;
  });
  const [activeAvatarActionId, setActiveAvatarActionId] = useState<string | null>(null);

  const handleToggleAvatarAction = (actionId: string) => {
    const nextActionId = activeAvatarActionId === actionId ? null : actionId;
    setActiveAvatarActionId(nextActionId);
  };

  useEffect(() => {
    setLiveAvatar(activeUserAvatar || null);
  }, [activeUserAvatar]);

  useEffect(() => {
    setActiveAvatarActionId(null);
  }, [liveAvatar?.id]);

  const [remotePlayers, setRemotePlayers] = useState<any[]>([]);
  const [playerPosition, setPlayerPosition] = useState<[number, number, number] | null>(null);
  const roomChannelRef = React.useRef<any>(null);

  // Gizmo & Transform State (Mover -> Escala -> Rotação)
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('mover');
  const [transform, setTransform] = useState<AvatarTransform>({
    scale: 1.0,
    sizeY: 1.0,
    angle: 0,
    positionOffset: [0, 0, 0],
  });

  // Poses attached in the editor to the avatar under test appear in the room inventory
  const attachedPoseExtras: AvatarPose[] = React.useMemo(() => {
    const objs = room.editorRoom?.placedObjects || [];
    const avatarObj =
      customAvatarObject ||
      objs.find((o) => o.isAvatar || o.type === 'avatar' || o.name.toLowerCase().includes('avatar')) ||
      null;
    const avatarKeys = new Set<string>(
      [avatarObj?.id, avatarObj?.assetId, liveAvatar?.id, liveAvatar?.originalItemId].filter(
        (v): v is string => Boolean(v)
      )
    );
    return objs
      .filter((o) => (o.type === 'pose' || o.isPose) && o.attachedAvatarIds?.some((id) => avatarKeys.has(id)))
      .map((o) => ({
        id: `attached-pose-${o.id}`,
        name: o.name,
        label: o.name,
        sourceObjectId: o.id,
        assetId: o.assetId,
        fileBlobUrl: o.fileBlobUrl,
        owned: true,
        access: 'free' as const,
        isPublishedByCreator: false,
      }));
  }, [room.editorRoom, customAvatarObject, liveAvatar]);

  // Calculate live poses matching either user created/customized poses or default poses
  const poses: AvatarPose[] = React.useMemo(() => {
    const base: AvatarPose[] = (propPoses || []).map((p) => ({
            id: p.id,
            name: p.name,
            label: p.name,
            thumbnailUrl: p.thumbnailUrl,
            description: p.description,
            price: p.price,
            owned: p.owned,
            author: p.author,
            isPublishedByCreator: p.isPublishedByCreator,
            associatedAvatarIds: p.associatedAvatarIds,
            associatedAvatarNames: p.associatedAvatarNames,
            sourceObjectId: p.sourceObjectId,
            assetId: p.assetId,
            fileBlobUrl: p.fileBlobUrl,
          }));
    const avatar = liveAvatar;
    const avatarName = (avatar?.name || '').trim().toLowerCase();
    const avatarIds = new Set(
      [avatar?.id, avatar?.assetId, avatar?.originalItemId].filter(
        (value): value is string => Boolean(value)
      )
    );
    const isLinkedToAvatar = (pose: AvatarPose) => {
      const associatedIds = pose.associatedAvatarIds || [];
      const associatedNames = pose.associatedAvatarNames || [];
      return (
        associatedIds.some((id) => avatarIds.has(id)) ||
        (avatarName.length > 0 &&
          associatedNames.some((name) => name.trim().toLowerCase() === avatarName))
      );
    };
    const isCompatible = (pose: AvatarPose) =>
      isLinkedToAvatar(pose) ||
      (!(pose.associatedAvatarIds?.length || pose.associatedAvatarNames?.length));
    return [...base, ...attachedPoseExtras].filter(
      (pose) => (pose.owned || Boolean(avatar?.owned && isLinkedToAvatar(pose))) && isCompatible(pose)
    );
  }, [propPoses, attachedPoseExtras]);

  const ownedAvatarIds = React.useMemo(() => {
    return storeAvatars
      .filter((a) => a.owned || a.applied || a.id === liveAvatar?.id)
      .map((a) => a.id);
  }, [storeAvatars, liveAvatar]);

  const [selectedPose, setSelectedPose] = useState<AvatarPose>(() => poses[1] || poses[0] || INITIAL_POSES[0]);
  useEffect(() => {
    if (poses.some((pose) => pose.id === selectedPose.id)) return;
    setSelectedPose(poses[0] || INITIAL_POSES[0]);
  }, [poses, selectedPose.id]);
  // Room Access Slots state
  const [roomAccessSlots, setRoomAccessSlots] = useState<RoomAccessSlot[]>(() => {
    if (propRoomAccessSlots) return propRoomAccessSlots;
    // Default seed
    const initial: RoomAccessSlot[] = [];
    const firstAvatar = liveAvatar;
    if (firstAvatar) {
      initial.push({
        id: `access-av-${firstAvatar.id}-init`,
        slotIndex: 0,
        type: 'avatar',
        itemId: firstAvatar.id,
        name: firstAvatar.name,
        thumbnailUrl: firstAvatar.thumb || '',
        badge: 'AVATAR',
        avatarData: firstAvatar,
      });
    }
    const samplePoses = poses.slice(0, 3);
    samplePoses.forEach((p, idx) => {
      initial.push({
        id: `access-pose-${p.id}-init`,
        slotIndex: idx + 1,
        type: 'pose',
        itemId: p.id,
        name: p.name,
        thumbnailUrl: p.thumbnailUrl || '',
        badge: 'POSE',
      });
    });
    return initial;
  });

  useEffect(() => {
    if (propRoomAccessSlots) setRoomAccessSlots(propRoomAccessSlots);
  }, [propRoomAccessSlots]);

  const handleUpdateRoomAccessSlots = (newSlots: RoomAccessSlot[]) => {
    setRoomAccessSlots(newSlots);
    safeLocalStorageSet(
      `3d_social_room_access_inventory:${user?.id || 'guest'}`,
      JSON.stringify(newSlots)
    );
    if (onUpdateRoomAccessSlots) {
      onUpdateRoomAccessSlots(newSlots);
    }
  };

  // Manage drawer state inside room
  const [isManageDrawerOpen, setIsManageDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'avatars' | 'poses'>('avatars');
  const [hudToast, setHudToast] = useState<string | null>(null);

  // Room Likes State & Handler
  const [likesCount, setLikesCount] = useState<number>(() => room.likesCount || 0);
  const [isLiked, setIsLiked] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const likedIds = JSON.parse(localStorage.getItem('3d_social_liked_rooms') || '[]');
        return likedIds.includes(room.id) || Boolean(room.isLiked);
      } catch {}
    }
    return Boolean(room.isLiked);
  });

  const handleToggleLike = async () => {
    const res = await toggleRoomLike(room.id, user?.id || 'guest');
    setLikesCount(res.likesCount);
    setIsLiked(res.isLiked);
    showHudToast(res.isLiked ? '❤️ Você curtiu esta sala!' : '💔 Curtida desfeita.');
  };

  const showHudToast = (msg: string) => {
    setHudToast(msg);
    setTimeout(() => setHudToast(null), 3500);
  };

  // Triggering a room access slot
  const handleTriggerAccessSlot = (slot: RoomAccessSlot) => {
    if (slot.type === 'avatar') {
      const targetAvatar = storeAvatars.find((a) => a.id === slot.itemId) || slot.avatarData;
      if (targetAvatar) {
        setLiveAvatar(targetAvatar);
        showHudToast(`👤 Avatar alterado para "${targetAvatar.name}"!`);
      }
    } else {
      const targetPose = poses.find((p) => p.id === slot.itemId);
      if (targetPose) {
        setSelectedPose(targetPose);
        showHudToast(`💃 Pose alterada para "${targetPose.name}"!`);
      }
    }
  };

  // Keyboard shortcut listener for slots 1-8
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const keyNum = parseInt(e.key, 10);
      if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 8) {
        const slot = roomAccessSlots.find((s) => s.slotIndex === keyNum - 1);
        if (slot) {
          handleTriggerAccessSlot(slot);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [roomAccessSlots, storeAvatars, poses]);

  // Spots State (puff ouro spots)
  const [spots] = useState<Spot[]>(() => {
    if (room.editorRoom) {
      return (room.editorRoom.spots || []).map((s, idx) => ({
        id: idx + 1,
        name: s.name,
        label: s.name,
        position: [s.position[0], s.position[1], s.position[2]],
        rotation: s.rotation,
      }));
    }
    return INITIAL_SPOTS;
  });
  const [currentSpotId, setCurrentSpotId] = useState<number>(() => {
    if (room.editorRoom?.spots && room.editorRoom.spots.length > 0) {
      return 1;
    }
    return 2;
  }); // Center puff is Player
  const { freeMoveEnabled, movementDuration, showSpotArrows } = movementSettings;
  const cameraMode = 'orbit' as const;

  // Chat & Speech Bubbles State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'inventory' | 'gizmo' | null>(null);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isStoreInventoryOpen, setIsStoreInventoryOpen] = useState(false);
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const [isShopping, setIsShopping] = useState(false);
  const [temporaryRoomObjects, setTemporaryRoomObjects] = useState<PlacedObject[]>([]);
  const [temporarySceneAssetId, setTemporarySceneAssetId] = useState<string | null>(null);
  const canTemporarilyReplaceScene = Boolean(
    room.editorRoom?.isPublished &&
      user &&
      !user.isGuest &&
      (room.ownerUserId || room.editorRoom.ownerUserId) === user.id
  );
  const editorRoomForScene = React.useMemo(
    () =>
      room.editorRoom
        ? {
            ...room.editorRoom,
            sceneAssetId: temporarySceneAssetId || room.editorRoom.sceneAssetId,
            placedObjects: [...room.editorRoom.placedObjects, ...temporaryRoomObjects],
          }
        : undefined,
    [room.editorRoom, temporaryRoomObjects, temporarySceneAssetId]
  );

  const handleOpenStore = () => {
    setIsStoreInventoryOpen(false);
    setIsShopping(true);
    setIsStoreOpen(true);
  };

  const handleReturnToRoom = () => {
    setIsStoreOpen(false);
    setIsStoreInventoryOpen(false);
    setIsShopping(false);
  };

  const handlePurchaseStoreItem = async (productId: string) => {
    setPurchasingProductId(productId);
    try {
      await onPurchaseStoreItem(productId);
      const purchasedProduct = storeProducts.find((product) => product.id === productId);
      showHudToast(`"${purchasedProduct?.name || 'Item'}" adquirido e enviado ao inventário.`);
      setIsStoreInventoryOpen(true);
    } finally {
      setPurchasingProductId(null);
    }
  };

  const handleApplyInventoryItem = (item: InventoryItem) => {
    const itemType = item.type.toLowerCase();
    const itemKey = item.storeItemId || item.id;
    if (item.isScenario || ['sala', 'cenario'].includes(itemType)) {
      if (!canTemporarilyReplaceScene) {
        showHudToast('Somente o dono da sala publicada pode trocar o cenário nesta sessão.');
        return;
      }
      if (!item.assetId) {
        showHudToast('O arquivo 3D deste cenário não está disponível.');
        return;
      }
      const sceneAssetId = item.assetId;
      setTemporarySceneAssetId((current) => current === sceneAssetId ? null : sceneAssetId);
      showHudToast(
        temporarySceneAssetId === sceneAssetId
          ? 'Cenário original restaurado nesta sessão.'
          : `Cenário "${item.displayName || item.name}" aplicado temporariamente.`
      );
      return;
    }

    if (itemType === 'avatar') {
      const avatar = storeAvatars.find(
        (candidate) =>
          candidate.owned &&
          (candidate.id === item.storeItemId ||
            candidate.id === item.id ||
            Boolean(item.assetId && candidate.assetId === item.assetId))
      );
      if (!avatar) {
        showHudToast('Este avatar não está disponível na sua conta.');
        return;
      }
      onSelectActiveAvatar?.(avatar.id);
      setLiveAvatar(avatar);
      setIsStoreInventoryOpen(false);
      showHudToast(`Avatar "${avatar.name}" aplicado.`);
      return;
    }

    if (itemType === 'pose') {
      const pose = poses.find(
        (candidate) =>
          candidate.owned &&
          (candidate.id === item.storeItemId ||
            candidate.id === item.id ||
            Boolean(item.assetId && candidate.assetId === item.assetId))
      );
      if (!pose) {
        showHudToast('Esta pose não está disponível para o avatar aplicado.');
        return;
      }
      if (propPoses?.some((candidate) => candidate.id === pose.id)) {
        onApplyPose?.(pose.id);
      }
      const roomPose = poses.find((candidate) => candidate.id === pose.id);
      if (roomPose) setSelectedPose(roomPose);
      setIsStoreInventoryOpen(false);
      showHudToast(`Pose "${pose.name}" aplicada.`);
      return;
    }

    if (item.isAccessory || ['acessorio', 'acessório'].includes(itemType)) {
      onToggleEquipItem?.(itemKey);
      setIsStoreInventoryOpen(false);
      showHudToast(`Acessório "${item.displayName || item.name}" atualizado.`);
      return;
    }

    if (['item', 'movel', 'moveis', 'objeto'].includes(itemType)) {
      if (!item.assetId) {
        showHudToast('O arquivo 3D deste item não está disponível.');
        return;
      }
      const assetId = item.assetId;
      const alreadyPlaced = temporaryRoomObjects.some((object) => object.id === `inventory-${itemKey}`);
      if (alreadyPlaced) {
        setTemporaryRoomObjects((previous) => previous.filter((object) => object.id !== `inventory-${itemKey}`));
        showHudToast(`"${item.displayName || item.name}" removido da sala.`);
        return;
      }
      const player = playerPosition || spots.find((spot) => spot.id === currentSpotId)?.position || [0, 0, 0];
      setTemporaryRoomObjects((previous) => [
        ...previous,
        {
          id: `inventory-${itemKey}`,
          assetId,
          name: item.displayName || item.name || item.fileName,
          type: 'movel',
          position: [player[0] + 1.2, 0, player[2] + 0.6],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ]);
      showHudToast(`"${item.displayName || item.name}" inserido na sala. Clique novamente para remover.`);
      return;
    }

    showHudToast('Este tipo de item não pode ser aplicado diretamente na sala.');
  };
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [speechBubbles, setSpeechBubbles] = useState<SpeechBubbleItem[]>([]);
  const [screenHeadPositions, setScreenHeadPositions] = useState<
    Record<number, { x: number; y: number }>
  >({});

  // Cycle Gizmo Mode: Mover -> Escalar -> Rotação -> Mover...
  // "se o usuairo clica no centro gismo muda p scala se clica de novo mud ap mover se lcia de novo muda p rotação"
  const handleCycleGizmoMode = () => {
    setGizmoMode((prev) => {
      if (prev === 'mover') return 'escalar';
      if (prev === 'escalar') return 'rodar';
      return 'mover';
    });
  };

  // Send message from chat
  const handleSendMessage = async (text: string, recipientSessionId?: string) => {
    const senderName = user?.displayName || 'Você';
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newMsg: ChatMessage = {
      id: messageId,
      user: senderName,
      avatarUrl: liveAvatar?.thumb,
      text,
      time: 'agora',
      spotId: currentSpotId,
      isPlayer: true,
      ...(recipientSessionId
        ? {
            isWhisper: true,
            senderSessionId: tabSessionId,
            recipientSessionId,
          }
        : {}),
    };

    setChatMessages((prev) => [...prev, newMsg]);

    if (recipientSessionId) {
      const whisperChannel = supabase.channel(`room-whisper:${recipientSessionId}`);
      whisperChannel
        .on('broadcast', { event: 'whisper' }, () => {})
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            const result = await whisperChannel.send({
              type: 'broadcast',
              event: 'whisper',
              payload: {
                ...newMsg,
                senderSessionId: tabSessionId,
                recipientSessionId,
                roomId: effectiveRoomId,
                isPlayer: false,
              },
            });
            if (result !== 'ok') {
              console.error(`Falha ao enviar sussurro: ${result}`);
              showHudToast('Não foi possível enviar o sussurro.');
            }
            await supabase.removeChannel(whisperChannel);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`Falha ao abrir canal do sussurro: ${status}`);
            showHudToast('Não foi possível enviar o sussurro.');
            await supabase.removeChannel(whisperChannel);
          }
        });
      return;
    }

    if (roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'chat',
        payload: {
          id: messageId,
          user: senderName,
          senderSessionId: tabSessionId,
          avatarUrl: liveAvatar?.thumb,
          text,
          time: 'agora',
          spotId: currentSpotId,
          isPlayer: false,
        },
      });
    }

    // Spawn 3D speech bubble above player's head
    const newBubble: SpeechBubbleItem = {
      id: `bubble-${Date.now()}`,
      text,
      spotId: currentSpotId,
      userName: senderName,
      createdAt: Date.now(),
    };
    setSpeechBubbles((prev) => [...prev, newBubble]);
  };

  // Generate a unique session ID for this browser tab instance
  const tabSessionId = React.useMemo(() => {
    let existing = sessionStorage.getItem('3d_social_session_id');
    if (!existing) {
      existing = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem('3d_social_session_id', existing);
    }
    return existing;
  }, []);

  // Normalize channel name across all room ID variants
  const effectiveRoomId = (room.editorRoomId || room.editorRoom?.id || room.id)
    .replace(/^(editor|playtest)-/, '');

  useEffect(() => {
    const channel = supabase.channel(`room-whisper:${tabSessionId}`);
    channel
      .on('broadcast', { event: 'whisper' }, ({ payload }) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          payload.recipientSessionId !== tabSessionId ||
          payload.roomId !== effectiveRoomId ||
          typeof payload.senderSessionId !== 'string' ||
          typeof payload.user !== 'string' ||
          typeof payload.text !== 'string'
        ) {
          return;
        }

        setChatMessages((previousMessages) => [
          ...previousMessages,
          {
            id: typeof payload.id === 'string' ? payload.id : `whisper-${Date.now()}`,
            user: payload.user,
            avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : undefined,
            text: payload.text,
            time: typeof payload.time === 'string' ? payload.time : 'agora',
            spotId: typeof payload.spotId === 'number' ? payload.spotId : 1,
            isPlayer: false,
            isWhisper: true,
            senderSessionId: payload.senderSessionId,
            recipientSessionId: tabSessionId,
          },
        ]);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Falha ao receber sussurros: ${status}`);
          showHudToast('Não foi possível receber sussurros.');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tabSessionId, effectiveRoomId]);

  // Supabase Realtime Multiplayer Presence & Chat Synchronization
  useEffect(() => {
    if (!effectiveRoomId) return;

    const myDisplayName = user?.displayName || 'Visitante';
    const presenceKey = `${tabSessionId}`;

    const channel = supabase.channel(`room-presence:${effectiveRoomId}`, {
      config: {
        presence: { key: presenceKey },
      },
    });

    roomChannelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const playersList: any[] = [];

        Object.keys(state).forEach((key) => {
          if (key !== presenceKey) {
            const list = state[key] as any[];
            if (list && list.length > 0) {
              const latest = list[list.length - 1];
              playersList.push({
                userId: key,
                displayName: latest.displayName || 'Usuário',
                spotId: latest.spotId || 1,
                position: Array.isArray(latest.position) ? latest.position : undefined,
                avatar: latest.avatar || null,
                pose: latest.pose || null,
                activity: latest.activity === 'shopping' ? 'shopping' : 'room',
              });
            }
          }
        });

        setRemotePlayers(playersList);
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        if (payload && payload.senderSessionId !== tabSessionId) {
          setChatMessages((prev) => [...prev, payload]);
          if (payload.text) {
            setSpeechBubbles((prev) => [
              ...prev,
              {
                id: `bubble-remote-${Date.now()}`,
                text: payload.text,
                spotId: payload.spotId || 1,
                userName: payload.user || 'Usuário',
                createdAt: Date.now(),
              },
            ]);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const initialSpot = spots.find((spot) => spot.id === currentSpotId) || spots[0];
          await channel.track({
            sessionId: tabSessionId,
            displayName: myDisplayName,
            spotId: currentSpotId,
            position: playerPosition || initialSpot?.position,
            avatar: liveAvatar,
            pose: selectedPose,
            activity: isShopping ? 'shopping' : 'room',
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      roomChannelRef.current = null;
    };
  }, [effectiveRoomId, tabSessionId]);

  // Auto-detect custom avatar object from editor room if not explicitly passed
  const effectiveCustomAvatarObject =
    customAvatarObject ||
    room.editorRoom?.placedObjects.find(
      (o) => o.isAvatar || o.type === 'avatar' || o.name.toLowerCase().includes('avatar')
    ) ||
    null;

  // Actions created in the editor live on the avatar object; the store avatar may not carry them
  const avatarActions: ObjectAction[] = React.useMemo(
    () =>
      effectiveCustomAvatarObject?.actions && effectiveCustomAvatarObject.actions.length > 0
        ? effectiveCustomAvatarObject.actions
        : liveAvatar?.actions || [],
    [liveAvatar?.actions, effectiveCustomAvatarObject?.actions]
  );

  useEffect(() => {
    if (!activeAvatarActionId) return;
    if (!avatarActions.some((action) => action.id === activeAvatarActionId)) {
      setActiveAvatarActionId(null);
    }
  }, [avatarActions, activeAvatarActionId]);
  useEffect(() => {
    if (roomChannelRef.current) {
      const myDisplayName = user?.displayName || 'Visitante';
      const selectedSpot = spots.find((spot) => spot.id === currentSpotId) || spots[0];
      const customUrl =
        effectiveCustomAvatarObject?.fileBlobUrl ||
        (effectiveCustomAvatarObject as any)?.asset_url ||
        (effectiveCustomAvatarObject as any)?.url;

      roomChannelRef.current.track({
        sessionId: tabSessionId,
        displayName: myDisplayName,
        spotId: currentSpotId,
        position: playerPosition || selectedSpot?.position,
        avatar: liveAvatar,
        pose: selectedPose,
        customAvatarUrl: customUrl,
        activity: isShopping ? 'shopping' : 'room',
      });
    }
  }, [currentSpotId, playerPosition, liveAvatar, selectedPose, tabSessionId, effectiveCustomAvatarObject, isShopping]);

  // Clean up speech bubbles after 7 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setSpeechBubbles((prev) => prev.filter((b) => now - b.createdAt < 7000));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div id="room-view-container" className="relative w-full h-screen h-[100dvh] overflow-hidden bg-[#141416] select-none">
      {/* 3D WebGL Canvas Layer */}
      <div className={`absolute inset-0 z-0 transition-opacity duration-200 ${isStoreOpen ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
        <LoungeCanvas3D
          currentPose={selectedPose}
          transform={transform}
          spots={spots}
          currentSpotId={currentSpotId}
          onSelectSpot={setCurrentSpotId}
          freeMoveEnabled={freeMoveEnabled}
          movementDuration={movementDuration}
          onPlayerPositionChange={setPlayerPosition}
          cameraMode={cameraMode}
          equippedAccessories={equippedAccessories}
          onUpdateAvatarHeadScreenPos={setScreenHeadPositions}
          key={`${room.editorRoom?.id || room.id}:${editorRoomForScene?.sceneAssetId || 'default'}`}
          editorRoom={editorRoomForScene}
          showSpotArrows={showSpotArrows}
          activeUserAvatar={liveAvatar}
          activeAvatarAction={
            avatarActions.find((action) => action.id === activeAvatarActionId) || null
          }
          customAvatarObject={effectiveCustomAvatarObject}
          onChangeTransform={setTransform}
          spotVisualConfig={spotVisualConfig}
          remotePlayers={remotePlayers}
          interactionDisabled={isStoreOpen}
        />
      </div>

      {/* Speech Bubbles and Floating Avatar Name Tag with Photo Anchored over 3D Avatars */}
      <SpeechBubbleOverlay
        bubbles={speechBubbles}
        screenPositions={screenHeadPositions}
        currentSpotId={currentSpotId}
        activeUserAvatar={liveAvatar}
        user={user}
        remotePlayers={remotePlayers}
        avatarActions={avatarActions}
        activeAvatarActionId={activeAvatarActionId}
        onToggleAvatarAction={handleToggleAvatarAction}
        isShopping={isShopping}
      />

      {/* Instant HUD Toast Feedback */}
      {hudToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-[#121319]/95 border border-[#ffd700]/70 text-[#ffd700] text-xs font-bold shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#ffd700]" />
          <span>{hudToast}</span>
        </div>
      )}

      {/* Room title, like button, and exit control */}
      <header className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-2 sm:px-6 py-2 sm:py-3.5 pointer-events-none gap-2 max-w-full overflow-hidden">
        <div className="flex items-center gap-1.5 sm:gap-3 pointer-events-auto min-w-0 flex-shrink">
          {/* Room Name & Cube Icon */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-white drop-shadow-md min-w-0">
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-[#ffd700]/15 border border-[#ffd700]/40 flex items-center justify-center text-[#ffd700] flex-shrink-0">
              <Box className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
            </div>
            <h1 className="text-xs sm:text-base md:text-xl font-bold tracking-tight flex items-baseline gap-1 text-white min-w-0">
              <span className="truncate max-w-[70px] xs:max-w-[110px] sm:max-w-[180px] md:max-w-none">{room.name || 'Lounge'}</span>
              <span className="text-[9px] sm:text-xs font-normal text-zinc-400 flex-shrink-0">
                {room.occupation || '3/8'}
              </span>
            </h1>
          </div>

          {/* Curtir / Like Button (ao lado do nome da room) */}
          <button
            id="room-header-like-btn"
            type="button"
            onClick={handleToggleLike}
            className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-bold transition-all cursor-pointer flex-shrink-0 backdrop-blur-md ${
              isLiked
                ? 'bg-rose-500/25 border-rose-500/80 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                : 'bg-black/40 hover:bg-rose-500/15 border-white/10 hover:border-rose-400/50 text-zinc-300 hover:text-rose-300'
            }`}
            title={isLiked ? 'Você curtiu esta sala! Clique para descurtir' : 'Curtir esta sala'}
          >
            <Heart className={`w-3.5 h-3.5 transition-transform active:scale-125 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'}`} />
            <span className="font-mono text-[11px]">{likesCount}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenStore}
            className="flex items-center gap-1.5 rounded-full border border-amber-300/45 bg-black/50 px-2.5 py-1.5 text-[10px] font-bold text-amber-200 shadow-lg backdrop-blur hover:bg-amber-400/15 sm:px-3 sm:text-xs"
            title="Entrar na loja 3D sem sair da sala"
          >
            <Store className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Loja 3D</span>
          </button>

          <button
            type="button"
            onClick={() => setIsStoreInventoryOpen((open) => !open)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold shadow-lg backdrop-blur sm:px-3 sm:text-xs ${
              isStoreInventoryOpen
                ? 'border-amber-300/70 bg-amber-300/20 text-amber-100'
                : 'border-white/20 bg-black/50 text-zinc-100 hover:border-amber-300/50 hover:text-amber-100'
            }`}
            title="Abrir inventário da conta"
            aria-label="Abrir inventário"
            aria-expanded={isStoreInventoryOpen}
          >
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inventário</span>
          </button>

          <button
            type="button"
            onClick={onOpenFriends}
            className="hidden items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-2.5 py-1.5 text-[10px] font-bold text-zinc-100 shadow-lg backdrop-blur transition-colors hover:border-amber-300/50 hover:text-amber-100 sm:flex sm:px-3 sm:text-xs"
            title="Ver pessoas online e convidar para esta sala"
            aria-label="Amigos"
          >
            <Users className="h-3.5 w-3.5" />
            Amigos
          </button>

          {/* Playtest Mode Badge */}
          {room.isPlaytest && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 text-[10px] sm:text-xs font-semibold backdrop-blur-md shadow-[0_0_12px_rgba(16,185,129,0.3)] flex-shrink-0">
              <span>🧪 TESTE</span>
            </div>
          )}

        </div>

        {/* Exit Button to return to Hall/Lobby or Editor (High z-index, never cut off!) */}
        <div className="pointer-events-auto flex-shrink-0 z-40">
          <button
            id="exit-room-btn"
            type="button"
            onClick={onExitToLobby}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl border backdrop-blur-md transition-colors cursor-pointer text-xs font-semibold shadow-lg ${
              room.isPlaytest
                ? 'bg-emerald-950/70 hover:bg-emerald-900 border-emerald-500/60 text-emerald-300 hover:text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-black/60 hover:bg-red-500/25 border-white/20 hover:border-red-500/50 text-zinc-200 hover:text-red-300'
            }`}
            title={room.isPlaytest ? 'Voltar para o Modo Criador' : 'Sair da sala e voltar ao Hall de Portais'}
          >
            <LogOut className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${room.isPlaytest ? 'rotate-180' : ''}`} />
            <span className="whitespace-nowrap">{room.isPlaytest ? 'Voltar' : 'Sair da Room'}</span>
          </button>
        </div>
      </header>

      {/* FLOATING ROOM AUDIO PLAYER (Web Radio & Playlist MP3) */}
      <RoomAudioPlayer
        radioUrl={room.radioUrl || room.editorRoom?.radioUrl}
        playlist={room.playlist || room.editorRoom?.playlist}
        roomName={room.name || 'Lounge'}
      />

      {/* TOP-LEFT HUD: 2D/3D Gizmo Widget with Setas & Spot Radius Clamping */}
      {(!isMobile || mobilePanel === 'gizmo') && (
      <div className={`absolute ${isMobile ? 'bottom-16 left-3' : 'top-20 left-3 sm:left-6'} z-30 flex flex-col gap-2 pointer-events-auto`}>
        <GizmoWidget
          onClose={isMobile ? () => setMobilePanel(null) : undefined}
          mode={gizmoMode}
          onCycleMode={handleCycleGizmoMode}
          transform={transform}
          onChangeTransform={setTransform}
          onSetMode={setGizmoMode}
          spotRadius={
            (spots.find((s) => s.id === currentSpotId) as any)?.relativeRadius ||
            (spots.find((s) => s.id === currentSpotId) as any)?.radius ||
            spotVisualConfig?.relativeSpotRadius ||
            0.45
          }
        />
      </div>
      )}

      {/* DRAGGABLE & MINIMIZABLE GLASS CHAT (Can be moved anywhere or minimized to keep screen clean) */}
      {(!isMobile || mobilePanel === 'chat') && (
        <GlassChat
          roomName={room.name || 'Lounge'}
          messages={chatMessages}
          participants={remotePlayers.map((player) => ({
            sessionId: player.userId,
            displayName: player.displayName || 'Usuário',
          }))}
          currentSessionId={tabSessionId}
          onSendMessage={handleSendMessage}
          embedded={isMobile}
          onClose={() => setMobilePanel(null)}
        />
      )}

      {/* SINGLE UNIFIED INVENTORY: Orientation toggleable (Horizontal at bottom / Vertical on left dock) */}
      {(!isMobile || mobilePanel === 'inventory') && (
      <UnifiedRoomInventory
        embedded={isMobile}
        onClose={() => setMobilePanel(null)}
        slots={roomAccessSlots}
        onUpdateSlots={handleUpdateRoomAccessSlots}
        onSlotClick={handleTriggerAccessSlot}
        poses={poses}
        selectedPoseId={selectedPose.id}
        onSelectPose={setSelectedPose}
        storeAvatars={storeAvatars}
        activeUserAvatar={liveAvatar}
        onSelectAvatar={(av) => {
          setLiveAvatar(av);
          showHudToast(`👤 Avatar alterado para "${av.name}"!`);
        }}
        activeAvatarId={liveAvatar?.id}
        activePoseId={selectedPose.id}
        avatarActions={avatarActions}
        activeAvatarActionId={activeAvatarActionId}
        onToggleAvatarAction={handleToggleAvatarAction}
        onShowToast={showHudToast}
      />
      )}

      {/* MOBILE DOCK: one panel at a time keeps the 3D scene interactive */}
      {isMobile && (
        <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-1.5 py-1 rounded-2xl bg-[#121319]/95 border border-[#ffd700]/40 backdrop-blur-xl shadow-2xl pointer-events-auto">
          {([
            ['chat', MessageSquare, 'Chat'],
            ['inventory', Package, 'Inventário'],
            ['friends', Users, 'Amigos'],
            ['gizmo', Move3d, 'Gizmo'],
            ['shop', Store, 'Loja'],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === 'friends') onOpenFriends();
                else if (key === 'shop') handleOpenStore();
                else if (key === 'inventory') {
                  setIsStoreInventoryOpen((open) => !open);
                  setMobilePanel(null);
                }
                else setMobilePanel((current) => (current === key ? null : key));
              }}
              className={`flex flex-col items-center justify-center min-w-[56px] h-11 rounded-xl text-[10px] font-semibold transition-colors cursor-pointer ${
                (key === 'shop' && isStoreOpen) ||
                (key === 'inventory' && isStoreInventoryOpen) ||
                (key !== 'shop' && key !== 'inventory' && key !== 'friends' && mobilePanel === key)
                  ? 'bg-[#ffd700] text-black'
                  : 'text-[#ffd700] hover:bg-white/10'
              }`}
              aria-label={label}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {isStoreOpen && (
        <RoomStoreShowroom3D
          products={storeProducts}
          coins={coins}
          isLoading={storeLoading}
          error={storeError}
          isAuthenticated={Boolean(user && !user.isGuest)}
          purchasingProductId={purchasingProductId}
          onPurchase={handlePurchaseStoreItem}
          onBackToRoom={handleReturnToRoom}
          onOpenInventory={() => setIsStoreInventoryOpen(true)}
        />
      )}

      {isStoreInventoryOpen && (
        <aside className="absolute inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-[#f3c866]/30 bg-[#101116]/97 shadow-2xl backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div>
              <h2 className="text-base font-bold text-white">Meu inventário</h2>
              <p className="mt-0.5 text-xs text-zinc-400">{inventory.length} itens da sua conta</p>
            </div>
            <button
              type="button"
              onClick={() => setIsStoreInventoryOpen(false)}
              className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
              aria-label="Fechar inventário"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          {coins !== null && (
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-bold text-amber-200">
              <Coins className="h-4 w-4" />
              {coins} créditos
            </div>
          )}
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {inventoryLoading && (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-300">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Sincronizando inventário…
              </p>
            )}
            {!inventoryLoading && inventory.length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-400">Você ainda não possui itens no inventário.</p>
            )}
            {!inventoryLoading && inventory.map((item) => {
              const itemType = item.type.toLowerCase();
              const itemKey = item.storeItemId || item.id;
              const avatar = itemType === 'avatar' ? storeAvatars.find(
                (candidate) =>
                  candidate.id === item.storeItemId ||
                  candidate.id === item.id ||
                  Boolean(item.assetId && candidate.assetId === item.assetId)
              ) : undefined;
              const pose = itemType === 'pose' ? poses.find(
                (candidate) =>
                  candidate.id === item.storeItemId ||
                  candidate.id === item.id ||
                  Boolean(item.assetId && candidate.assetId === item.assetId)
              ) : undefined;
              const isScenarioItem = Boolean(item.isScenario || ['sala', 'cenario'].includes(itemType));
              const isRoomObjectItem = ['item', 'movel', 'moveis', 'objeto'].includes(itemType);
              const canApply = isScenarioItem
                ? canTemporarilyReplaceScene && Boolean(item.assetId)
                : Boolean(
                    avatar?.owned ||
                      pose?.owned ||
                      item.isAccessory ||
                      itemType === 'acessorio' ||
                      itemType === 'acessório' ||
                      (isRoomObjectItem && item.assetId)
                  );
              const isApplied = Boolean(
                (avatar && liveAvatar?.id === avatar.id) ||
                (pose && selectedPose.id === pose.id) ||
                ((item.isAccessory || itemType === 'acessorio' || itemType === 'acessório') &&
                  equippedAccessories?.some((accessory) => accessory.id === itemKey && accessory.equipped)) ||
                (isScenarioItem && temporarySceneAssetId === item.assetId) ||
                (isRoomObjectItem && temporaryRoomObjects.some((object) => object.id === `inventory-${itemKey}`))
              );
              const actionLabel = isScenarioItem
                ? canTemporarilyReplaceScene ? (isApplied ? 'Restaurar' : 'Trocar cenário') : 'Somente dono'
                : isRoomObjectItem ? (isApplied ? 'Remover' : 'Inserir na sala')
                  : isApplied ? 'Aplicado' : 'Aplicar';
              return (
                <article key={`${item.storeItemId || item.id}-${item.assetId || ''}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#f3c866]/20 bg-black/30 text-xs font-bold text-[#f3c866]">
                    {(item.thumbUrl || item.thumbnailUrl) ? (
                      <img src={item.thumbUrl || item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : itemType.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{item.displayName || item.name || item.fileName}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{itemType}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canApply}
                    onClick={() => handleApplyInventoryItem(item)}
                    className={`flex flex-shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 ${
                      isApplied ? 'bg-emerald-500/15 text-emerald-200' : 'bg-[#f3c866] text-[#18130a] hover:bg-[#ffe0a1]'
                    }`}
                  >
                    {isApplied ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                    {canApply ? actionLabel : 'Indisponível'}
                  </button>
                </article>
              );
            })}
          </div>
        </aside>
      )}

    </div>
  );
};
