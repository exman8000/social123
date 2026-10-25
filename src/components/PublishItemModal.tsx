import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Box,
  Coins,
  CheckCircle2,
  Image as ImageIcon,
  Tag,
  ShoppingBag,
  Layers,
  ShieldCheck,
  Check,
  Activity,
  Plus,
  Trash2,
  Repeat,
  Compass,
} from 'lucide-react';
import {
  InventoryItem,
  StoreObjectType,
  CreatorUser,
  StoreAvatar,
  ObjectAction,
  AccessoryAttachmentPoint,
  AccessoryTransform,
} from '../types';
import { CoverImagePicker } from './CoverImagePicker';

interface PublishItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  user?: CreatorUser | null;
  availableAvatars?: StoreAvatar[];
  availableActions?: InventoryItem[];
  attachInfo?: {
    poses: { id: string; name: string; published: boolean }[];
    unpublishedAvatars: string[];
    existing?: { id: string; name: string; kind: 'avatar' | 'pose' | 'item' };
  };
  onConfirmPublish: (payload: {
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
  }) => Promise<void> | void;
  onGoToStore?: () => void;
}

export const PublishItemModal: React.FC<PublishItemModalProps> = ({
  isOpen,
  onClose,
  item,
  user,
  availableAvatars = [],
  availableActions = [],
  attachInfo,
  onConfirmPublish,
  onGoToStore,
}) => {
  const [bundlePoses, setBundlePoses] = useState(true);
  const [publishAs, setPublishAs] = useState<'update' | 'new'>('update');
  const [publishMode, setPublishMode] = useState<'simples' | 'avancado'>('simples');
  const [title, setTitle] = useState('');
  const [objectType, setObjectType] = useState<StoreObjectType>('item');
  const [associatedAvatarIds, setAssociatedAvatarIds] = useState<string[]>([]);
  const [poseAccess, setPoseAccess] = useState<'requires_avatar' | 'free'>('requires_avatar');
  const [price, setPrice] = useState(0);
  const [hashtags, setHashtags] = useState('#comunidade, #3d, #criador');
  const [rarity, setRarity] = useState<'COMUM' | 'RARO' | 'ÉLITE'>('RARO');
  const [description, setDescription] = useState('');
  const [thumbUrl, setThumbUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  // Acessório & Actions state
  const [accessoryAttachment, setAccessoryAttachment] =
    useState<AccessoryAttachmentPoint>('companion_float');
  const [actions, setActions] = useState<ObjectAction[]>([]);
  const [newActionName, setNewActionName] = useState('');
  const [publishActionId, setPublishActionId] = useState<string | null>(null);
  const [publishAudioAsAction, setPublishAudioAsAction] = useState(false);
  const [attachedActionItemIds, setAttachedActionItemIds] = useState<string[]>([]);

  // Initialize or synchronize form whenever item changes
  useEffect(() => {
    if (item) {
      setTitle(item.displayName || 'Novo Item 3D');
      setThumbUrl(item.thumbUrl || '');
      setHasSaved(false);
      setPublishActionId(null);
      setPublishAudioAsAction(false);
      setAttachedActionItemIds(
        (item.actions || [])
          .map((action) => action.sourceStoreItemId)
          .filter((id): id is string => Boolean(id))
      );
      setAssociatedAvatarIds([]);
      setPoseAccess('requires_avatar');
      setBundlePoses(true);
      setPublishAs('update');
      const lower = (item.displayName || '').toLowerCase();
      const itemTypeLower = String(item.type || '').toLowerCase();
      if (item.isAudio) {
        setObjectType('acessorio');
        setHashtags('#audio, #radio, #acessorio');
        setPrice(0);
        setRarity('COMUM');
      } else if (itemTypeLower === 'avatar') {
        setObjectType('avatar');
        setHashtags('#avatar, #personagem, #3d');
        setPrice(150);
        setRarity('ÉLITE');
      } else if (itemTypeLower === 'pose') {
        setObjectType('pose');
        setHashtags('#pose, #avatar, #animacao');
        setPrice(0);
        setRarity('COMUM');
      } else if (itemTypeLower === 'sala') {
        setObjectType('sala');
        setHashtags('#sala, #cenario, #vitrine3d');
        setPrice(0);
        setRarity('RARO');
      } else if (
        itemTypeLower === 'acessorio' ||
        item.isAccessory ||
        lower.includes('drone') ||
        lower.includes('chapeu') ||
        lower.includes('relogio') ||
        lower.includes('oculos') ||
        lower.includes('acessorio')
      ) {
        setObjectType('acessorio');
        setHashtags('#acessorio, #avatar, #3d');
        setPrice(50);
        setRarity('RARO');
        if (lower.includes('drone')) setAccessoryAttachment('companion_float');
        else if (lower.includes('chapeu') || lower.includes('bone')) setAccessoryAttachment('head');
        else if (lower.includes('relogio')) setAccessoryAttachment('left_hand');
        else if (lower.includes('oculos')) setAccessoryAttachment('head');
      } else {
        setObjectType('item');
        setHashtags('#item, #movel, #decoracao');
        setPrice(0);
        setRarity('COMUM');
      }

      // Existing or default actions
      if (item.actions && item.actions.length > 0) {
        setActions(item.actions);
      } else if (lower.includes('drone')) {
        setActions([
          {
            id: `act-${Date.now()}-1`,
            name: 'Órbita 360°',
            motion: {
              enabled: true,
              deltaPosition: [0, 0, 0],
              turnAngle: 360,
              curveTrajectory: 'circle_turn',
              curveRadius: 1.2,
              speed: 1.2,
              loop: true,
              target: 'parent_object',
            },
          },
          {
            id: `act-${Date.now()}-2`,
            name: 'Frente e Trás',
            motion: {
              enabled: true,
              deltaPosition: [0, 0, 1.2],
              curveTrajectory: 'linear',
              speed: 1.0,
              loop: true,
              target: 'parent_object',
            },
          },
        ]);
      } else {
        setActions([]);
      }

      setDescription(`Modelo 3D criado por ${user?.displayName || 'Luzenne'}.`);
    }
  }, [item, user]);

  const existingKind = objectType === 'avatar' ? 'avatar' : objectType === 'pose' ? 'pose' : 'item';
  const matchedExisting =
    attachInfo?.existing && attachInfo.existing.kind === existingKind ? attachInfo.existing : undefined;

  if (!isOpen || !item) return null;

  const handleAddPresetAction = (type: 'frente_tras' | 'girar_crescer' | 'orbita' | 'arco') => {
    let act: ObjectAction;
    const now = Date.now();
    if (type === 'frente_tras') {
      act = {
        id: `act-${now}`,
        name: `Frente e Trás ${actions.length + 1}`,
        motion: {
          enabled: true,
          deltaPosition: [0, 0, 1.5],
          curveTrajectory: 'linear',
          speed: 1.0,
          loop: true,
          target: 'parent_object',
        },
      };
    } else if (type === 'girar_crescer') {
      act = {
        id: `act-${now}`,
        name: `Girar e Pulsar ${actions.length + 1}`,
        motion: {
          enabled: true,
          deltaPosition: [0, 0.3, 0],
          deltaRotation: [0, 360, 0],
          scaleFactor: 1.4,
          curveTrajectory: 'wave',
          speed: 1.2,
          loop: true,
          target: 'parent_object',
        },
      };
    } else if (type === 'orbita') {
      act = {
        id: `act-${now}`,
        name: `Órbita 360° ${actions.length + 1}`,
        motion: {
          enabled: true,
          deltaPosition: [0, 0, 0],
          turnAngle: 360,
          curveTrajectory: 'circle_turn',
          curveRadius: 1.4,
          speed: 1.2,
          loop: true,
          target: 'parent_object',
        },
      };
    } else {
      act = {
        id: `act-${now}`,
        name: `Salto em Arco ${actions.length + 1}`,
        motion: {
          enabled: true,
          deltaPosition: [0, 0, 2.0],
          curveTrajectory: 'arc',
          curveHeight: 1.5,
          speed: 1.0,
          loop: true,
          target: 'parent_object',
        },
      };
    }
    setActions((prev) => [...prev, act]);
  };

  const handleRemoveAction = (actionId: string) => {
    setActions((prev) => prev.filter((a) => a.id !== actionId));
  };

  const handlePublishSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!item || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const parsedTags = hashtags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`));

      const finalTags = parsedTags.length > 0 ? parsedTags : ['#comunidade', '#3d'];
      const finalPrice = publishMode === 'simples' ? 0 : Number(price) || 0;
      const finalName = title.trim() || item.displayName;
      const finalThumb = thumbUrl.trim() || item.thumbUrl;

      const associatedNames = availableAvatars
        .filter((a) => associatedAvatarIds.includes(a.id))
        .map((a) => a.name);
      const selectedAction = actions.find((action) => action.id === publishActionId);
      const audioAction: ObjectAction | null =
        item.isAudio && publishAudioAsAction && item.audioUrl
          ? {
              id: `audio-action-${item.storeItemId || item.id}`,
              name: finalName,
              kind: 'audio',
              audioUrl: item.audioUrl,
              audioIsRadio: item.audioIsRadio,
              motion: {
                enabled: true,
                deltaPosition: [0, 0, 0],
                speed: 1,
                loop: false,
                target: 'parent_object',
              },
            }
          : null;
      const attachedPoseActions =
        objectType === 'pose'
          ? availableActions
              .filter((actionItem) => attachedActionItemIds.includes(actionItem.storeItemId || actionItem.id))
              .flatMap((actionItem) =>
                (actionItem.actions || []).map((action) => ({
                  ...action,
                  sourceStoreItemId: actionItem.storeItemId || actionItem.id,
                }))
              )
          : [];
      const submittedActions = audioAction
        ? [audioAction]
        : selectedAction
          ? [selectedAction]
          : actions;
      const finalActions = [
        ...submittedActions,
        ...attachedPoseActions,
      ].filter((action, index, all) =>
        all.findIndex((candidate) =>
          candidate.id === action.id ||
          Boolean(candidate.sourceStoreItemId && candidate.sourceStoreItemId === action.sourceStoreItemId)
        ) === index
      );

      await onConfirmPublish({
        item,
        name: finalName,
        objectType,
        price: finalPrice,
        hashtags: finalTags,
        thumbnailUrl: finalThumb,
        rarity: publishMode === 'simples' ? 'COMUM' : rarity,
        description: description.trim() || `Item 3D criado por ${user?.displayName || 'Luzenne'}.`,
        publishMode,
        associatedAvatarIds:
          objectType === 'pose' && associatedAvatarIds.length > 0 ? associatedAvatarIds : undefined,
        associatedAvatarNames:
          objectType === 'pose' && associatedNames.length > 0 ? associatedNames : undefined,
        actions: finalActions.length > 0 ? finalActions : undefined,
        isActionAsset: Boolean(audioAction || selectedAction),
        poseAccess: objectType === 'pose' || objectType === 'avatar' ? poseAccess : undefined,
        bundlePoses: objectType === 'avatar' ? bundlePoses : undefined,
        updateExistingId: matchedExisting && publishAs === 'update' ? matchedExisting.id : undefined,
        accessoryAttachment: objectType === 'acessorio' ? accessoryAttachment : undefined,
        accessoryTransform:
          objectType === 'acessorio'
            ? {
                position:
                  accessoryAttachment === 'head'
                    ? [0, 1.72, 0]
                    : accessoryAttachment === 'left_hand'
                    ? [-0.26, 0.88, 0]
                    : accessoryAttachment === 'right_hand'
                    ? [0.26, 0.88, 0]
                    : accessoryAttachment === 'chest'
                    ? [0, 1.35, 0.12]
                    : accessoryAttachment === 'back'
                    ? [0, 1.35, -0.16]
                    : [0.52, 1.48, 0.25], // companion_float
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
              }
            : undefined,
      });

      setHasSaved(true);
    } catch (err) {
      console.error('Publish error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeBadgeLabel = () => {
    switch (objectType) {
      case 'sala':
        return '🏛️ Sala / Cenário';
      case 'avatar':
        return '👤 Avatar 3D';
      case 'acessorio':
        return item?.isAudio ? '🎧 Áudio' : '👑 Acessório';
      case 'pose':
        return '🎭 Pose';
      case 'moveis':
        return '🛋️ Móvel';
      default:
        return '📦 Item / Objeto';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in font-sans overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#121317] border border-[#d4af37]/60 rounded-2xl p-6 shadow-[0_16px_50px_rgba(0,0,0,0.95)] text-[#e8d5b5] my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#d4af37]/20">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#ffd700]" />
            <h2 className="text-sm font-extrabold tracking-wider text-[#e8d5b5] uppercase">
              {objectType === 'sala' ? 'Publicar sala na Loja' : 'Publicar na Loja'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#d4af37]/60 hover:text-[#ffd700] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {objectType === 'sala' && (
          <p className="mt-3 rounded-lg border border-sky-400/25 bg-sky-950/25 p-3 text-[11px] text-sky-100">
            Esta publicação vende o modelo da sala na Loja. Ela não publica sua room na Vitrine; para isso, use “Publicar Sala” no editor.
            No modo simples, a sala é grátis. No avançado, defina o custo em créditos.
          </p>
        )}

        {/* Mode Selector (Simples vs Avançado) */}
        <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-black/60 rounded-xl border border-[#d4af37]/30">
          <button
            type="button"
            onClick={() => setPublishMode('simples')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              publishMode === 'simples'
                ? 'bg-gradient-to-r from-[#d4af37] to-[#ffd700] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>⚡ Modo Simples</span>
            <span className="text-[10px] opacity-75">(1 Clique / Grátis)</span>
          </button>

          <button
            type="button"
            onClick={() => setPublishMode('avancado')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              publishMode === 'avancado'
                ? 'bg-gradient-to-r from-[#d4af37] to-[#ffd700] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>⚙️ Modo Avançado</span>
            <span className="text-[10px] opacity-75">(Customizar Preço & Tags)</span>
          </button>
        </div>

        {/* 16:9 Vitrine Card Preview */}
        <div className="my-4">
          <div className="relative aspect-video w-full rounded-xl border border-[#d4af37]/50 overflow-hidden bg-[#18191f] p-4 flex flex-col justify-between shadow-inner">
            {thumbUrl && (
              <img
                src={thumbUrl}
                alt="Preview"
                className="absolute inset-0 w-full h-full object-cover opacity-25 filter blur-[1px]"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/70 pointer-events-none" />

            <div className="flex items-center justify-between z-10">
              <span className="px-2.5 py-0.5 rounded-full bg-black/85 border border-[#d4af37]/50 text-[10px] font-bold tracking-wider text-[#ffd700] flex items-center gap-1">
                <span>{getTypeBadgeLabel()}</span>
                <span className="text-[#e8d5b5]/50">·</span>
                <span className="text-[9px] uppercase font-mono">
                  {publishMode === 'simples' ? 'Simples' : 'Avançado'}
                </span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-black/85 border border-[#ffd700]/60 text-[11px] text-[#ffd700] font-black font-mono flex items-center gap-1 shadow-sm">
                <Coins className="w-3 h-3 text-[#ffd700]" />
                {publishMode === 'simples' || price <= 0 ? 'Grátis (0 🪙)' : `${price} moedas`}
              </span>
            </div>

            <div className="z-10 mt-auto">
              <h3 className="text-base font-bold text-white tracking-wide truncate">
                {title || item.displayName}
              </h3>
              <p className="text-[11px] text-[#e8d5b5]/70 line-clamp-1">
                {description || `Modelo 3D por ${user?.displayName || 'Luzenne'}`}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#ffd700]/15 border border-[#ffd700]/30 text-[#ffd700]">
                  {rarity}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono truncate">{hashtags}</span>
                {actions.length > 0 && (
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/50 text-cyan-300">
                    ⚡ {actions.length} action(s)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handlePublishSubmit} className="space-y-4 text-xs">
          {/* Title */}
          <div>
            <label className="block font-semibold text-[#e8d5b5] mb-1">Título do Item</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Drone Companheiro Cyber, Chapéu Fedora..."
              className="w-full px-3 py-2 rounded-lg bg-[#181920] border border-[#d4af37]/40 text-[#e8d5b5] focus:outline-none focus:border-[#ffd700]"
              required
            />
          </div>

          {/* Type Selector */}
          <div>
            <label className="block font-semibold text-[#e8d5b5] mb-1">
              Tipo / Categoria do Item
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(
                [
                  { id: 'sala', label: '🏛️ Sala' },
                  { id: 'avatar', label: '👤 Avatar' },
                  { id: 'acessorio', label: item.isAudio ? '🎧 Áudio (acessório)' : '👑 Acessório' },
                  { id: 'pose', label: '🎭 Pose' },
                  { id: 'moveis', label: '🛋️ Móvel' },
                  { id: 'item', label: '📦 Objeto' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setObjectType(t.id)}
                  className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer text-center ${
                    objectType === t.id
                      ? 'bg-[#d4af37]/30 border-[#ffd700] text-[#ffd700] font-bold'
                      : 'bg-[#1b1c24] border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Se for ACESSÓRIO: Ponto de Fixação no Avatar */}
          {item.isAudio && (
            <div className="space-y-2 rounded-xl border border-cyan-400/30 bg-cyan-950/25 p-3 text-[11px] text-cyan-100">
              <p>
                O item será publicado na categoria <strong>Áudios</strong>. Outros usuários poderão aplicá-lo temporariamente nas salas.
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={publishAudioAsAction}
                  onChange={(event) => setPublishAudioAsAction(event.target.checked)}
                />
                Publicar como action de áudio anexável a poses
              </label>
            </div>
          )}

          {objectType === 'acessorio' && !item.isAudio && (
            <div className="p-3 rounded-xl bg-black/60 border border-[#ffd700]/50 space-y-2 animate-fade-in">
              <label className="font-semibold text-xs text-[#ffd700] flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-[#ffd700]" />
                <span>Ponto de Fixação no Avatar</span>
              </label>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Onde o acessório é colocado inicialmente no avatar. Na loja, o usuário poderá usar o
                Gizmo para ajustar a posição exata e travar!
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'companion_float', label: '🛸 Drone / Ao Lado' },
                  { id: 'head', label: '👒 Cabeça / Chapéu' },
                  { id: 'left_hand', label: '⌚ Pulso Esquerdo' },
                  { id: 'right_hand', label: '🖐️ Mão Direita' },
                  { id: 'chest', label: '👔 Peito / Colar' },
                  { id: 'back', label: '🎒 Costas / Asas' },
                ].map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setAccessoryAttachment(att.id as AccessoryAttachmentPoint)}
                    className={`p-1.5 rounded-lg text-[10px] font-semibold border transition-all text-center cursor-pointer ${
                      accessoryAttachment === att.id
                        ? 'bg-[#ffd700]/25 border-[#ffd700] text-[#ffd700]'
                        : 'bg-[#16171f] border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {att.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {objectType === 'pose' && availableActions.length > 0 && (
            <div className="space-y-2 rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-3">
              <p className="text-xs font-semibold text-cyan-200">Actions compradas para esta pose</p>
              <div className="space-y-1.5">
                {availableActions.map((actionItem) => {
                  const actionItemId = actionItem.storeItemId || actionItem.id;
                  return (
                    <label key={actionItemId} className="flex items-center gap-2 text-[11px] text-zinc-200">
                      <input
                        type="checkbox"
                        checked={attachedActionItemIds.includes(actionItemId)}
                        onChange={(event) =>
                          setAttachedActionItemIds((current) =>
                            event.target.checked
                              ? [...new Set([...current, actionItemId])]
                              : current.filter((id) => id !== actionItemId)
                          )
                        }
                      />
                      <span>{actionItem.displayName || actionItem.name}</span>
                      <span className="text-[10px] text-cyan-300">
                        {actionItem.actions?.some((action) => action.kind === 'audio') ? 'Áudio' : 'Movimento'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* ACTIONS DO OBJETO (Sistema idêntico ao spot móvel para animação) */}
          <div className="p-3 rounded-xl bg-black/60 border border-cyan-500/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-xs text-cyan-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ações de Animação do Objeto (Actions)</span>
              </label>
              <span className="text-[10px] text-cyan-400 font-mono">
                {actions.length} action(s) configurada(s)
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Crie actions para o objeto! Na loja e nas salas, o usuário poderá clicar em cada action
              para ver o objeto executando o movimento em tempo real (ex: drone voando ao redor do
              avatar, objeto girando e crescendo, etc.).
            </p>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleAddPresetAction('orbita')}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>+ Órbita 360° (Drone)</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddPresetAction('frente_tras')}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>+ Frente e Trás</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddPresetAction('girar_crescer')}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>+ Girar e Pulsar</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddPresetAction('arco')}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>+ Salto em Arco</span>
              </button>
            </div>

            {/* List of Configured Actions */}
            {actions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {actions.map((act, idx) => (
                  <div
                    key={act.id}
                    className="p-2 rounded-lg bg-[#141822] border border-cyan-500/30 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-white">{act.name}</span>
                        <div className="text-[10px] text-zinc-400 flex items-center gap-2">
                          <span>Curva: {act.motion.curveTrajectory || 'linear'}</span>
                          <span>·</span>
                          <span>Vel: {act.motion.speed}x</span>
                          <span>·</span>
                          <span>{act.motion.loop ? 'Loop Contínuo' : '1x'}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextId = publishActionId === act.id ? null : act.id;
                        setPublishActionId(nextId);
                        if (nextId) {
                          setTitle(act.name);
                          setPublishAs('new');
                        }
                      }}
                      className={`mr-2 rounded px-2 py-1 text-[9px] font-bold ${
                        publishActionId === act.id
                          ? 'bg-cyan-400/20 text-cyan-100'
                          : 'text-cyan-300 hover:bg-cyan-400/10'
                      }`}
                      title="Publicar esta action separadamente"
                    >
                      {publishActionId === act.id ? 'Action selecionada' : 'Publicar action'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveAction(act.id)}
                      className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-950/40 cursor-pointer"
                      title="Excluir Action"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {matchedExisting && (
            <div className="p-3 rounded-xl bg-black/60 border border-amber-400/50 space-y-2">
              <label className="font-semibold text-xs text-amber-300">
                ⚠️ Este item já foi publicado como "{matchedExisting.name}"
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['update', '♻️ Atualizar o publicado'],
                  ['new', '➕ Publicar como novo'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPublishAs(val)}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                      publishAs === val
                        ? 'bg-amber-400/20 border-amber-300 text-white'
                        : 'bg-[#181920] border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400">
                {publishAs === 'update'
                  ? 'Substitui a versão na loja pelas suas modificações, sem duplicar.'
                  : 'Cria um segundo item na loja; o publicado anteriormente continua como está.'}
              </p>
            </div>
          )}

          {objectType === 'avatar' && attachInfo && attachInfo.poses.length > 0 && (
            <div className="p-3 rounded-xl bg-black/60 border border-cyan-400/40 space-y-2">
              <label className="font-semibold text-xs text-cyan-300">
                Este avatar tem {attachInfo.poses.length} pose(s) anexada(s)
              </label>
              <ul className="text-[10px] text-zinc-300 space-y-0.5">
                {attachInfo.poses.map((p) => (
                  <li key={p.id}>
                    • {p.name} — {p.published ? '✓ já publicada (será vinculada)' : 'não publicada'}
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                {([
                  [true, '📦 Combo: avatar + poses'],
                  [false, '👤 Só o avatar'],
                ] as const).map(([val, label]) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setBundlePoses(val)}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                      bundlePoses === val
                        ? 'bg-cyan-400/20 border-cyan-300 text-white'
                        : 'bg-[#181920] border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400">
                {bundlePoses
                  ? 'Publica o avatar e as poses não publicadas juntos, como um combo.'
                  : 'Publica só o avatar. Poses ainda não publicadas continuam fora da loja.'}
              </p>
            </div>
          )}

          {objectType === 'pose' && attachInfo && attachInfo.unpublishedAvatars.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/50 text-[11px] text-amber-200">
              ⚠️ O avatar {attachInfo.unpublishedAvatars.join(', ')} ainda não foi publicado. A pose será
              publicada, mas só fica liberada na loja quando o avatar for publicado.
            </div>
          )}

          {/* Acesso às poses */}
          {(objectType === 'pose' || objectType === 'avatar') && (
            <div className="p-3 rounded-xl bg-black/60 border border-[#d4af37]/40 space-y-2">
              <label className="font-semibold text-xs text-[#ffd700]">
                {objectType === 'avatar' ? 'Acesso às poses anexadas' : 'Acesso à pose'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['requires_avatar', '🔒 Só com o avatar'],
                  ['free', '🔓 Sem restrição'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPoseAccess(val)}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                      poseAccess === val
                        ? 'bg-[#d4af37]/25 border-[#ffd700] text-white'
                        : 'bg-[#181920] border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400">
                {poseAccess === 'free'
                  ? 'A pose pode ser adquirida separadamente, sem ter o avatar.'
                  : 'A pose só pode ser usada por quem adquiriu o avatar.'}
              </p>
            </div>
          )}

          {/* POSE vinculação */}
          {objectType === 'pose' && (
            <div className="p-3 rounded-xl bg-black/60 border border-[#d4af37]/40 space-y-2.5 animate-fade-in">
              <label className="font-semibold text-xs text-[#ffd700] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#ffd700]" />
                <span>Vincular a Avatar Publicado (Opcional)</span>
              </label>
              {availableAvatars.length > 0 && (
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1">
                  {availableAvatars.map((av) => {
                    const isSelected = associatedAvatarIds.includes(av.id);
                    return (
                      <div
                        key={av.id}
                        onClick={() => {
                          setAssociatedAvatarIds((prev) =>
                            isSelected ? prev.filter((id) => id !== av.id) : [...prev, av.id]
                          );
                        }}
                        className={`p-1.5 rounded-lg border text-left cursor-pointer transition-all flex items-center gap-2 ${
                          isSelected
                            ? 'bg-[#d4af37]/25 border-[#ffd700] text-white'
                            : 'bg-[#181920] border-white/10 text-zinc-400 hover:text-white'
                        }`}
                      >
                        <img
                          src={av.thumb}
                          alt={av.name}
                          className="w-7 h-7 rounded object-cover flex-shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[11px] font-semibold truncate">{av.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Advanced fields if Modo Avançado */}
          {publishMode === 'avancado' && (
            <div className="space-y-3 pt-1 border-t border-white/10">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#e8d5b5] mb-1">Preço em Moedas 🪙</label>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="5"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-[#181920] border border-[#d4af37]/40 text-[#ffd700] font-bold font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#e8d5b5] mb-1">Raridade</label>
                  <select
                    value={rarity}
                    onChange={(e) => setRarity(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-[#181920] border border-[#d4af37]/40 text-[#e8d5b5] focus:outline-none"
                  >
                    <option value="COMUM">COMUM</option>
                    <option value="RARO">RARO</option>
                    <option value="ÉLITE">ÉLITE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#e8d5b5] mb-1">Hashtags</label>
                <input
                  type="text"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="#acessorio, #drone, #3d"
                  className="w-full px-3 py-2 rounded-lg bg-[#181920] border border-[#d4af37]/40 text-[#e8d5b5] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#e8d5b5] mb-1">Descrição</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-[#181920] border border-[#d4af37]/40 text-[#e8d5b5] focus:outline-none resize-none"
                />
              </div>
            </div>
          )}

          {/* Cover Image Picker */}
          <div>
            <label className="block font-semibold text-[#e8d5b5] mb-1 flex items-center justify-between">
              <span>Imagem de Capa (Thumbnail 16:9)</span>
              <span className="text-[10px] text-zinc-400 font-mono">Alta resolução</span>
            </label>
            <CoverImagePicker
              value={thumbUrl}
              onChange={(url) => setThumbUrl(url)}
              suggestedTag={objectType}
            />
          </div>

          {/* Submit buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white font-medium cursor-pointer"
            >
              {hasSaved ? 'Continuar editando' : 'Cancelar'}
            </button>

            {hasSaved ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Publicado!
                </span>
                {onGoToStore && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToStore();
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#ffd700] text-black font-bold shadow-lg hover:brightness-110 cursor-pointer"
                  >
                    Ver na Loja 🛍️
                  </button>
                )}
              </div>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#ffd700] hover:brightness-110 text-black font-extrabold tracking-wide shadow-[0_4px_20px_rgba(212,175,55,0.4)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-black" />
                <span>{isSubmitting ? 'Publicando...' : 'Publicar Agora'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
