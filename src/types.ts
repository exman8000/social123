// Creator Mode Types
export type GizmoEditMode = 'elevar' | 'mover' | 'rodar' | 'escalar';

export type SpotType = 'pe' | 'sentar' | 'deitar';

export type MotionCurveTrajectory = 'linear' | 'arc' | 'circle_turn' | 'spiral' | 'wave';

export interface ActionSpeedKeyframe {
  timeSeconds: number;
  speed: number;
}

export interface SpotMotionConfig {
  enabled: boolean;
  deltaPosition: [number, number, number]; // [dx, dy, dz] em metros (ex: [0, 0, 3] = frente 3m, [0, 2, 0] = sobe 2m)
  deltaRotation?: [number, number, number]; // [rotX, rotY, rotZ] em graus
  turnAngle?: number; // Ângulo para fazer volta / curva (ex: 180° ou 360°)
  deltaScale?: [number, number, number]; // [scaleX, scaleY, scaleZ]
  scaleFactor?: number; // Fator multiplicador de escala (ex: 1.0 -> 1.5x)
  curveTrajectory?: MotionCurveTrajectory; // 'linear' | 'arc' | 'circle_turn' | 'spiral' | 'wave'
  curveHeight?: number; // Altura da curva em arco em metros (ex: 1.5m)
  curveRadius?: number; // Raio para fazer a volta em metros (ex: 2.0m)
  speed: number; // velocidade base em ciclos por segundo
  speedProfile?: ActionSpeedKeyframe[]; // até cinco pontos de velocidade interpolados ao longo do tempo
  loop: boolean; // true = loop contínuo vai e vem; false = executa uma vez (one-shot)
  durationSeconds?: number; // duração opcional da execução; omitido = indefinida
  target: 'parent_object' | 'avatar' | 'both'; // objeto, avatar ou ambos juntos
  showGhostSpot?: boolean; // Exibir Spot Fantasma em movimento contínuo (padrão true)
  label?: string;
}

export interface ObjectIdentifier {
  id: string;
  name: string; // Ex: "Cabeça", "Mão Direita", "Dedos", "Pés", "Boca"
  tag: string; // Ex: "cabeca", "mao_direita", "dedos", "pes", etc.
  localPosition: [number, number, number]; // Offset local relativo ao objeto
}

export interface SpotItem {
  id: string;
  name: string;
  type: SpotType;
  position: [number, number, number];
  rotation: number;
  rotationPitch?: number; // Inclinação vertical para cima / baixo (eixo X) em graus
  targetRotation?: [number, number, number]; // Coordenadas de rotação capturadas do objeto para teste
  targetScale?: [number, number, number]; // Coordenadas de escala capturadas do objeto para teste
  parentObjectId?: string; // ID do objeto 3D ao qual o spot está fixado/relativo
  relativePosition?: [number, number, number]; // Coordenadas relativas locais [x, y, z] na superfície do objeto
  surfaceNormal?: [number, number, number]; // Vetor normal da superfície do objeto
  relativeRadius?: number;
  attachmentTag?: string;
  connectsToTags?: string[];
  receptiveIdentifier?: string; // Tag de identificador esperado (ex: "cabeca", "mao", "dedos")
  isSubjectMovable?: boolean; // Se true (sujeito), o objeto se move para o avatar. Se false, o avatar se move até o spot.
  motion?: SpotMotionConfig; // Configuração de movimento (Motion Spot)
}

export interface ObjectAction {
  id: string;
  name: string; // Ex: "Frente e Trás", "Girar e Crescer", "Órbita 360°"
  motion: SpotMotionConfig;
}

export interface SavedActionHistoryItem {
  id: string;
  name: string;
  savedAt: string;
  motion: SpotMotionConfig;
}

export type AccessoryAttachmentPoint =
  | 'head'
  | 'chest'
  | 'left_hand'
  | 'right_hand'
  | 'back'
  | 'companion_float'
  | 'custom';

export interface AccessoryTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface PlacedObject {
  id: string;
  assetId: string;
  name: string;
  type: 'cenario' | 'movel' | 'objeto' | 'avatar' | 'acessorio' | 'pose';
  isAvatar?: boolean;
  isAccessory?: boolean;
  isPose?: boolean;
  // Avatars (editor object ids or store avatar ids) this pose object is attached to
  attachedAvatarIds?: string[];
  accessoryAttachment?: AccessoryAttachmentPoint;
  accessoryTransform?: AccessoryTransform;
  actions?: ObjectAction[];
  activeActionId?: string | null;
  identifiers?: ObjectIdentifier[]; // Identificadores de ponto (anchors) no objeto/avatar
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color?: string;
  modelType?: 'sofa' | 'table' | 'chair' | 'plant' | 'house' | 'custom_glb' | 'avatar' | 'acessorio';
  fileBlobUrl?: string;
  rawDimensions?: [number, number, number];
  isMissingAsset?: boolean;
}

export interface InventoryItem {
  id: string;
  assetId?: string;
  storeItemId?: string;
  ownerUserId?: string;
  fileName: string;
  displayName: string;
  name?: string;
  thumbUrl: string;
  thumbnailUrl?: string;
  type: 'Sala' | 'Avatar' | 'Item' | 'Acessorio' | 'Movel' | 'Pose' | 'sala' | 'avatar' | 'item' | 'acessorio' | 'cenario' | 'movel' | 'objeto' | 'pose';
  createdAt?: string;
  isScenario?: boolean;
  isAccessory?: boolean;
  actions?: ObjectAction[];
  accessoryAttachment?: AccessoryAttachmentPoint;
  accessoryTransform?: AccessoryTransform;
  fileBlobUrl?: string;
  modelType?: 'sofa' | 'table' | 'chair' | 'plant' | 'house' | 'custom_glb' | 'avatar' | 'acessorio';
  rawDimensions?: [number, number, number];
  isMissingAsset?: boolean;
  // Specific placed object instance being published (disambiguates duplicates of the same asset)
  sourceObjectId?: string;
}

export interface PlayableBoundary {
  x: number; // width in meters (e.g. 5.0)
  y: number; // height in meters (e.g. 2.8)
  z: number; // depth in meters (e.g. 6.5)
  position?: [number, number, number]; // [posX, posY, posZ] offset in meters
  isConfirmed: boolean;
}

export interface AudioPlaylistItem {
  id: string;
  title: string;
  url: string; // HTTP(S) stream URL or uploaded audio blob/data url
  artist?: string;
  duration?: number;
  isRadio?: boolean;
}

export interface RoomEditorState {
  id: string;
  name: string;
  ownerUserId?: string;
  sceneAssetId: string | null;
  sceneAssetBlobUrl?: string;
  placedObjects: PlacedObject[];
  spots: SpotItem[];
  boundary: PlayableBoundary;
  isPublished: boolean;
  publishedAt?: string;
  isMissingAsset?: boolean;
  radioUrl?: string; // e.g. "https://music.poprockenlinea.com/listen/poprock/radio.mp3"
  playlist?: AudioPlaylistItem[];
  audioEnabled?: boolean;
  audioAutoplay?: boolean;
}

export interface CreatorUser {
  id: string;
  email: string;
  displayName: string;
  username?: string;
  isGuest: boolean;
}

export interface ProjectExportPackage {
  version: '1.0';
  exportedAt: string;
  projectName: string;
  activeRoomId: string;
  rooms: RoomEditorState[];
  inventory: InventoryItem[];
  customizationItems?: CustomizationItem[];
  storeAvatars?: StoreAvatar[];
  avatarPoses?: AvatarPoseConfig[];
  spotVisualConfig?: SpotVisualConfig;
  user?: CreatorUser | null;
  files?: Record<string, string>; // Model ID -> Base64 Data URL
}

// Spot Visualization Configurations (white pulse + point, yellow, or arrow only, with customizable sizes)
export type SpotVisualIndicatorStyle = 'white_pulse' | 'yellow_gold' | 'arrow_only' | 'full' | 'pillar';

export interface SpotVisualConfig {
  indicatorStyle: SpotVisualIndicatorStyle;
  arrowScale: number; // 0.5 to 2.5
  signalScale: number; // 0.5 to 2.5
  relativeSpotRadius?: number;
  hideSpotNames?: boolean; // hide spot name labels (shown only on hover/selection)
}

// Social / Interactive Room Gizmo Modes (harmonized with Creator Mode)
export type GizmoMode = 'mover' | 'escalar' | 'rodar' | 'elevar' | 'camera' | 'scale' | 'sizeY' | 'angle';

export interface AvatarTransform {
  scale: number;
  sizeY: number;
  angle: number;
  positionOffset?: [number, number, number]; // [dx, dy, dz] from spot anchor
}

export interface RoomMovementSettings {
  showSpotArrows: boolean;
  clickSpotsEnabled: boolean;
  freeMoveEnabled: boolean;
  teleportOnSpotClick: boolean;
  magneticSnapEnabled: boolean;
  movementDuration: number;
  cameraSensitivity: number;
}

export interface OnlineRoomUser {
  userId: string;
  username: string;
  displayName: string;
}

export interface RoomInvitation {
  roomId: string;
  roomName: string;
  senderName: string;
  senderUsername: string;
}

export interface AvatarPose {
  id: string;
  name: string;
  sourceObjectId?: string;
  assetId?: string;
  fileBlobUrl?: string;
  label?: string;
  fileName?: string;
  thumbnailUrl?: string;
  description?: string;
  badgeEmoji?: string;
  emoji?: string;
  glbKey?: string;
  heightOffset?: number;
  rotationOffset?: number;
  silhouette?: string;
  price?: number;
  owned?: boolean;
  author?: string;
  isPublishedByCreator?: boolean;
  associatedAvatarIds?: string[];
  associatedAvatarNames?: string[];
  pendingAvatarKey?: string;
  pendingAvatarName?: string;
  access?: PoseAccess;
}

export interface Spot {
  id: number;
  name?: string;
  label?: string;
  position: [number, number, number];
  rotation: number;
  occupiedBy?: string;
  occupiedByName?: string;
  occupiedAvatar?: string;
  avatarColor?: string;
  isPlayer?: boolean;
}

export interface RoomData {
  id: string;
  name: string;
  ownerUserId?: string;
  previewUrl?: string;
  occupancy?: string;
  occupation?: string;
  currentUsers?: number;
  maxUsers?: number;
  theme?: string;
  description: string;
  badge?: string;
  thumb?: string;
  isFeatured?: boolean;
  ambientColor?: string;
  isCenterHighlighted?: boolean;
  editorRoomId?: string;
  isFromEditor?: boolean;
  isPurchasable?: boolean;
  editorRoom?: RoomEditorState;
  isPlaytest?: boolean;
  assetId?: string;
  isMissingAsset?: boolean;
  radioUrl?: string;
  playlist?: AudioPlaylistItem[];
  audioEnabled?: boolean;
  audioAutoplay?: boolean;
  likesCount?: number;
  isLiked?: boolean;
  price?: number;
}

export interface ChatMessage {
  id: string;
  user: string;
  avatarUrl?: string;
  text: string;
  time: string;
  spotId: number;
  isPlayer?: boolean;
}

export interface SpeechBubbleItem {
  id: string;
  text: string;
  spotId: number;
  senderId?: string;
  userName: string;
  createdAt: number;
}

export type ProductType = 'sala' | 'avatar' | 'acessorio' | 'item';

export interface UploadedProduct {
  id: string;
  fileName: string;
  displayName: string;
  thumbUrl: string;
  productType: ProductType;
  uploadedAt: string;
  author: string;
  equipped?: boolean;
  itemCategory?: 'head' | 'chest' | 'eyes';
}

export interface ShopItem {
  id: string;
  name: string;
  thumb: string;
  category: 'head' | 'chest' | 'eyes';
  equipped: boolean;
  description?: string;
  owned?: boolean;
}

export type CustomizationCategory = 'chapeus' | 'casacos' | 'sapatos' | 'acessorios' | 'avatares' | 'publicados' | 'todos';

export interface CustomizationItem {
  id: string;
  storeObjectType?: 'avatar' | 'acessorio' | 'item' | 'pose' | 'sala' | 'moveis';
  createdAt?: string;
  code: string; // e.g. #H001, #C001, #S001, #AC01
  name: string;
  category: 'chapeus' | 'casacos' | 'sapatos' | 'acessorios' | 'avatares' | 'publicados' | 'outros' | 'avatar' | 'itens' | 'mobilia' | 'poses' | 'salas';
  thumb: string;
  owned: boolean;
  equipped: boolean;
  slot?: string;
  assetId?: string;
  price?: number;
  rarity?: 'COMUM' | 'RARO' | 'ÉLITE';
  description?: string;
  isPublishedByCreator?: boolean;
  isUserPublished?: boolean;
  author?: string;
  ownerUserId?: string;
  fileBlobUrl?: string;
  originalItemId?: string;
  isAvatar?: boolean;
  isAccessory?: boolean;
  accessoryAttachment?: AccessoryAttachmentPoint;
  accessoryTransform?: AccessoryTransform;
  isLockedPosition?: boolean;
  actions?: ObjectAction[];
  activeActionId?: string | null;
  isMissingAsset?: boolean;
}

export interface StoreAvatar {
  id: string;
  createdAt?: string;
  name: string;
  rarity: 'COMUM' | 'RARO' | 'ÉLITE';
  price: number;
  thumb: string;
  tags: string[];
  owned: boolean;
  applied: boolean;
  assetId?: string;
  description?: string;
  author?: string;
  ownerUserId?: string;
  isUserPublished?: boolean;
  fileBlobUrl?: string;
  originalItemId?: string;
  isMissingAsset?: boolean;
  actions?: ObjectAction[];
  poseIds?: string[]; // poses bundled with this avatar when published
}

export type PoseAccess = 'requires_avatar' | 'free';

export interface AvatarPoseConfig {
  id: string;
  createdAt?: string;
  name: string;
  applied: boolean;
  assetId?: string;
  originalItemId?: string;
  fileBlobUrl?: string;
  description?: string;
  thumbnailUrl?: string;
  price?: number;
  owned?: boolean;
  author?: string;
  ownerUserId?: string;
  isPublishedByCreator?: boolean;
  associatedAvatarIds?: string[];
  associatedAvatarNames?: string[];
  // 'requires_avatar' (default when avatars are linked): only usable with the linked avatar owned.
  // 'free': can be acquired on its own.
  access?: PoseAccess;
  rarity?: 'COMUM' | 'RARO' | 'ÉLITE';
  sourceObjectId?: string;
  // Attached to an editor avatar that has not been published yet
  pendingAvatarKey?: string;
  pendingAvatarName?: string;
  bundledInPack?: boolean;
}

export interface RoomAccessSlot {
  slotIndex: number; // 0 to 7 (displayed as 1 to 8)
  id: string; // unique slot item id
  type: 'avatar' | 'pose';
  name: string;
  thumbnailUrl: string;
  itemId: string; // avatar id or pose id
  badge?: string;
  avatarData?: StoreAvatar;
  poseData?: AvatarPoseConfig;
}

export type StoreObjectType = 'avatar' | 'acessorio' | 'item' | 'pose' | 'sala' | 'moveis';

export interface PublishItemPayload {
  id?: string;
  assetId?: string;
  originalItemId?: string;
  name: string;
  objectType: StoreObjectType;
  price: number;
  hashtags: string[];
  thumbnailUrl: string;
  description?: string;
  rarity?: 'COMUM' | 'RARO' | 'ÉLITE';
  publishMode: 'simples' | 'avancado';
  fileBlobUrl?: string;
  author?: string;
  associatedAvatarIds?: string[];
  actions?: ObjectAction[];
  accessoryAttachment?: AccessoryAttachmentPoint;
  accessoryTransform?: AccessoryTransform;
  metadata?: Record<string, any>;
}
