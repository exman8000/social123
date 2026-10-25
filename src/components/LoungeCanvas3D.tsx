import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  AvatarPose,
  AvatarTransform,
  Spot,
  RoomEditorState,
  StoreAvatar,
  SpotVisualConfig,
  PlacedObject,
  AccessoryTransform,
  ObjectAction,
} from '../types';
import {
  createScarletSalonArchitecture,
  createLoftArchitecture,
} from '../lib/roomArchitectures';
import { extractAssetUuid, resolveAssetDownloadUrl } from '../lib/assetSyncClient';
import { getActionMotionFactor } from '../lib/actionMotion';

const MIN_CAMERA_RADIUS = 0.35;
const MAX_CAMERA_RADIUS = 100;

const createCollisionFreePath = (
  from: THREE.Vector3,
  to: THREE.Vector3,
  obstacleBounds: THREE.Box3[]
): THREE.Vector3[] => {
  const clearance = 0.34;
  const rectangles = obstacleBounds
    .filter((bounds) => !bounds.isEmpty())
    .map((bounds) => ({
      minX: bounds.min.x - clearance,
      maxX: bounds.max.x + clearance,
      minZ: bounds.min.z - clearance,
      maxZ: bounds.max.z + clearance,
    }))
    .filter((rect) => {
      const startInside =
        from.x > rect.minX && from.x < rect.maxX &&
        from.z > rect.minZ && from.z < rect.maxZ;
      const endInside =
        to.x > rect.minX && to.x < rect.maxX &&
        to.z > rect.minZ && to.z < rect.maxZ;
      return !startInside && !endInside;
    });

  const crossesObstacle = (
    start: THREE.Vector2,
    end: THREE.Vector2,
    rect: (typeof rectangles)[number]
  ) => {
    const delta = end.clone().sub(start);
    let entry = 0;
    let exit = 1;
    const axes: [number, number, number, number][] = [
      [start.x, delta.x, rect.minX, rect.maxX],
      [start.y, delta.y, rect.minZ, rect.maxZ],
    ];
    for (const [origin, direction, min, max] of axes) {
      if (Math.abs(direction) < 1e-8) {
        if (origin <= min || origin >= max) return false;
        continue;
      }
      const first = (min - origin) / direction;
      const second = (max - origin) / direction;
      entry = Math.max(entry, Math.min(first, second));
      exit = Math.min(exit, Math.max(first, second));
      if (entry >= exit) return false;
    }

    const midpoint = start.clone().addScaledVector(delta, (entry + exit) / 2);
    return (
      midpoint.x > rect.minX &&
      midpoint.x < rect.maxX &&
      midpoint.y > rect.minZ &&
      midpoint.y < rect.maxZ
    );
  };

  const start = new THREE.Vector2(from.x, from.z);
  const end = new THREE.Vector2(to.x, to.z);
  if (!rectangles.some((rect) => crossesObstacle(start, end, rect))) {
    return [from.clone(), to.clone()];
  }

  const points = [start, end];
  rectangles.forEach((rect) => {
    const cornerOffset = 0.02;
    const corners: [number, number][] = [
      [rect.minX - cornerOffset, rect.minZ - cornerOffset],
      [rect.minX - cornerOffset, rect.maxZ + cornerOffset],
      [rect.maxX + cornerOffset, rect.minZ - cornerOffset],
      [rect.maxX + cornerOffset, rect.maxZ + cornerOffset],
    ];
    corners.forEach(([x, z]) => {
      const point = new THREE.Vector2(x, z);
      const insideAnotherObstacle = rectangles.some((other) => (
        point.x > other.minX && point.x < other.maxX &&
        point.y > other.minZ && point.y < other.maxZ
      ));
      if (!insideAnotherObstacle) points.push(point);
    });
  });

  const distances = points.map(() => Infinity);
  const previous = points.map(() => -1);
  const visited = points.map(() => false);
  distances[0] = 0;

  for (let step = 0; step < points.length; step += 1) {
    let current = -1;
    for (let index = 0; index < points.length; index += 1) {
      if (!visited[index] && (current < 0 || distances[index] < distances[current])) {
        current = index;
      }
    }
    if (current < 0 || !Number.isFinite(distances[current])) break;
    if (current === 1) break;
    visited[current] = true;

    for (let next = 0; next < points.length; next += 1) {
      if (next === current || visited[next]) continue;
      if (rectangles.some((rect) => crossesObstacle(points[current], points[next], rect))) continue;
      const candidate = distances[current] + points[current].distanceTo(points[next]);
      if (candidate < distances[next]) {
        distances[next] = candidate;
        previous[next] = current;
      }
    }
  }

  if (!Number.isFinite(distances[1])) return [from.clone(), to.clone()];
  const path: THREE.Vector3[] = [];
  for (let index = 1; index >= 0; index = previous[index]) {
    path.push(new THREE.Vector3(points[index].x, from.y, points[index].y));
    if (index === 0) break;
    if (previous[index] < 0) return [from.clone(), to.clone()];
  }
  return path.reverse();
};

interface TeleportFadeMaterial {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  clones: THREE.Material[];
  opacity: number[];
  transparent: boolean[];
  depthWrite: boolean[];
}

interface LoungeCanvas3DProps {
  currentPose: AvatarPose;
  focusAvatarRequest?: number;
  transform: AvatarTransform;
  spots: Spot[];
  currentSpotId: number;
  cameraControl?: { panX: number; panY: number; zoom: number };
  onSelectSpot: (spotId: number) => void;
  freeMoveEnabled?: boolean;
  clickSpotsEnabled?: boolean;
  teleportOnSpotClick?: boolean;
  alternateAxisWalking?: boolean;
  magneticSnapEnabled?: boolean;
  cameraSensitivity?: number;
  movementDuration?: number;
  onPlayerPositionChange?: (position: [number, number, number]) => void;
  cameraMode: 'orbit' | 'frontal' | 'closeup' | 'topdown';
  equippedAccessories?: any[];
  onUpdateAvatarHeadScreenPos?: (positions: Record<string, { x: number; y: number }>) => void;
  editorRoom?: RoomEditorState;
  showSpotArrows?: boolean;
  activeUserAvatar?: StoreAvatar | null;
  activeAvatarAction?: ObjectAction | null;
  customAvatarObject?: PlacedObject | null;
  onChangeTransform?: (newTransform: AvatarTransform) => void;
  spotVisualConfig?: SpotVisualConfig;
  remotePlayers?: any[];
  interactionDisabled?: boolean;
}

export const LoungeCanvas3D: React.FC<LoungeCanvas3DProps> = ({
  currentPose,
  focusAvatarRequest = 0,
  transform,
  spots,
  currentSpotId,
  cameraControl,
  onSelectSpot,
  freeMoveEnabled = false,
  clickSpotsEnabled = true,
  teleportOnSpotClick = false,
  alternateAxisWalking = false,
  magneticSnapEnabled = false,
  cameraSensitivity = 1.4,
  movementDuration = 2,
  onPlayerPositionChange,
  cameraMode,
  equippedAccessories,
  onUpdateAvatarHeadScreenPos,
  editorRoom,
  showSpotArrows = true,
  activeUserAvatar,
  activeAvatarAction,
  customAvatarObject,
  onChangeTransform,
  spotVisualConfig,
  remotePlayers,
  interactionDisabled = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerGroupRef = useRef<THREE.Group | null>(null);
  const currentPoseRef = useRef(currentPose);
  currentPoseRef.current = currentPose;
  const appliedAvatarActionRef = useRef({
    position: new THREE.Vector3(),
    rotation: new THREE.Vector3(),
    scale: 1,
  });
  const remotePlayersGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const headPosRef = useRef<Record<string, THREE.Vector3>>({});
  const animationFrameRef = useRef<number>(0);
  const spotClickablesGroupRef = useRef<THREE.Group | null>(null);
  const spotVisualConfigRef = useRef<SpotVisualConfig | undefined>(spotVisualConfig);
  spotVisualConfigRef.current = spotVisualConfig;

  const transformRef = useRef<AvatarTransform>(transform);
  transformRef.current = transform;

  const activeAvatarActionRef = useRef<ObjectAction | null>(activeAvatarAction || null);
  activeAvatarActionRef.current = activeAvatarAction || null;
  const activeAvatarActionStartRef = useRef<{ actionId: string | null; startedAt: number }>({
    actionId: null,
    startedAt: 0,
  });

  const onChangeTransformRef = useRef(onChangeTransform);
  onChangeTransformRef.current = onChangeTransform;
  const interactionDisabledRef = useRef(interactionDisabled);
  interactionDisabledRef.current = interactionDisabled;

  const spotAnimatedMeshesRef = useRef<
    Array<{
      group: THREE.Group;
      arrowGroup: THREE.Group;
      arrowMat: THREE.MeshBasicMaterial;
      pillarMesh: THREE.Mesh;
      pillarMat: THREE.MeshBasicMaterial;
      outerRingMat: THREE.MeshBasicMaterial;
      innerRingMat: THREE.MeshBasicMaterial;
      spotId: number;
      baseY: number;
    }>
  >([]);

  const currentSpotIdRef = useRef(currentSpotId);
  currentSpotIdRef.current = currentSpotId;
  const freeMoveEnabledRef = useRef(freeMoveEnabled);
  freeMoveEnabledRef.current = freeMoveEnabled;
  const clickSpotsEnabledRef = useRef(clickSpotsEnabled);
  clickSpotsEnabledRef.current = clickSpotsEnabled;
  const teleportOnSpotClickRef = useRef(teleportOnSpotClick);
  teleportOnSpotClickRef.current = teleportOnSpotClick;
  const alternateAxisWalkingRef = useRef(alternateAxisWalking);
  alternateAxisWalkingRef.current = alternateAxisWalking;
  const magneticSnapEnabledRef = useRef(magneticSnapEnabled);
  magneticSnapEnabledRef.current = magneticSnapEnabled;
  const cameraSensitivityRef = useRef(cameraSensitivity);
  cameraSensitivityRef.current = cameraSensitivity;
  const movementDurationRef = useRef(movementDuration);
  movementDurationRef.current = movementDuration;
  const movementTargetRef = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    startedAt: number;
    path?: THREE.Vector3[];
    pathLength?: number;
  } | null>(null);
  const teleportAnimationRef = useRef<{
    startedAt: number;
    destination: THREE.Vector3;
    swapped: boolean;
  } | null>(null);
  const teleportFadeMaterialsRef = useRef<TeleportFadeMaterial[]>([]);
  const walkingOffsetRef = useRef({ y: 0, rotationX: 0, rotationZ: 0 });
  const freeMoveHoldRef = useRef<THREE.Vector3 | null>(null);
  const restoreTeleportFade = () => {
    teleportFadeMaterialsRef.current.forEach(({ mesh, original, clones }) => {
      mesh.material = original;
      clones.forEach((material) => material.dispose());
    });
    teleportFadeMaterialsRef.current = [];
  };
  const prepareTeleportFade = (player: THREE.Group) => {
    restoreTeleportFade();
    player.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const original = node.material;
      const sourceMaterials = Array.isArray(original) ? original : [original];
      const clones = sourceMaterials.map((material) => material.clone());
      teleportFadeMaterialsRef.current.push({
        mesh: node,
        original,
        clones,
        opacity: sourceMaterials.map((material) => material.opacity),
        transparent: sourceMaterials.map((material) => material.transparent),
        depthWrite: sourceMaterials.map((material) => material.depthWrite),
      });
      node.material = Array.isArray(original) ? clones : clones[0];
    });
  };
  const setTeleportFadeOpacity = (opacity: number) => {
    teleportFadeMaterialsRef.current.forEach((record) => {
      record.clones.forEach((material, index) => {
        material.opacity = record.opacity[index] * opacity;
        material.transparent = opacity < 1 || record.transparent[index];
        material.depthWrite = opacity < 1 ? false : record.depthWrite[index];
      });
    });
  };
  const previousPoseOffsetsRef = useRef({
    height: currentPose.heightOffset || 0,
    rotation: currentPose.rotationOffset || 0,
  });
  const previousGizmoPositionRef = useRef<[number, number, number]>([
    transform.positionOffset?.[0] || 0,
    transform.positionOffset?.[1] || 0,
    transform.positionOffset?.[2] || 0,
  ]);
  const previousGizmoSpotIdRef = useRef(currentSpotId);
  const previousGizmoAngleRef = useRef(transform.angle);
  const lastPositionReportAtRef = useRef(0);
  const lastReportedPlayerPositionRef = useRef<THREE.Vector3 | null>(null);
  const remotePlayersRef = useRef(remotePlayers || []);
  remotePlayersRef.current = remotePlayers || [];
  const onPlayerPositionChangeRef = useRef(onPlayerPositionChange);
  onPlayerPositionChangeRef.current = onPlayerPositionChange;

  useEffect(() => {
    if (!freeMoveEnabled) {
      movementTargetRef.current = null;
      freeMoveHoldRef.current = null;
    }
  }, [freeMoveEnabled]);

  const showSpotArrowsRef = useRef(showSpotArrows);
  showSpotArrowsRef.current = showSpotArrows;

  const onSelectSpotRef = useRef(onSelectSpot);
  onSelectSpotRef.current = onSelectSpot;

  const placedObjectsMapRef = useRef<Map<string, THREE.Group>>(new Map());
  const remotePlayerSceneKey = (remotePlayers || [])
    .map(
      (player) =>
        `${player.userId}:${player.displayName || ''}:${player.avatar?.id || ''}:${player.avatar?.name || ''}:${player.avatar?.assetId || ''}:${player.avatar?.fileBlobUrl || ''}:${player.avatar?.asset_url || ''}:${player.avatar?.url || ''}:${player.customAvatarAssetId || ''}:${player.customAvatarUrl || ''}:${player.avatarUrl || ''}:${player.pose?.id || ''}:${player.pose?.name || ''}:${player.pose?.assetId || ''}:${player.pose?.fileBlobUrl || ''}:${player.pose?.glbKey || ''}:${JSON.stringify(player.pose?.boneRotations || {})}`
    )
    .join('|');

  // Mouse orbit & right-click pan interaction
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraAnglesRef = useRef({ theta: 0, phi: 0.18, radius: 3.6 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0.45, 0));
  const cameraFollowOffsetRef = useRef(new THREE.Vector3(0, 0.45, 0));
  const cameraPanOffsetRef = useRef(new THREE.Vector3());
  const cameraFocusTargetRef = useRef<THREE.Vector3 | null>(null);
  const cameraFocusUserIdRef = useRef<string | null>(null);
  const appliedCameraControlRef = useRef({ panX: 0, panY: 0, zoom: 0 });
  const touchGestureRef = useRef({
    pinchDistance: 0,
    midpointX: 0,
    midpointY: 0,
    didPinch: false,
    moved: false,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141416');
    sceneRef.current = scene;

    // Camera with enhanced near/far for extreme close-up and panoramic zoom
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.01,
      500
    );
    camera.position.set(0, 1.4, 4.8);
    camera.lookAt(0, 0.45, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting matching Reference Image 1 (warm architectural cove lighting + directional key light)
    const ambientLight = new THREE.AmbientLight(0xd9d0c5, 0.65);
    scene.add(ambientLight);

    // Warm cove strip light along top back wall
    const coveLight = new THREE.DirectionalLight(0xffecd2, 1.2);
    coveLight.position.set(0, 3.2, -1.8);
    coveLight.castShadow = true;
    coveLight.shadow.mapSize.width = 1024;
    coveLight.shadow.mapSize.height = 1024;
    scene.add(coveLight);

    // Warm ceiling spot focusing on rug
    const spotLight = new THREE.SpotLight(0xffdfa8, 2.5, 12, Math.PI / 3.5, 0.4, 1);
    spotLight.position.set(0, 4.0, 1.5);
    spotLight.target.position.set(0, 0.2, 0);
    spotLight.castShadow = true;
    scene.add(spotLight);
    scene.add(spotLight.target);

    // Subtle blue fill from front
    const fillLight = new THREE.DirectionalLight(0x90a4ae, 0.35);
    fillLight.position.set(0, 2.0, 4.0);
    scene.add(fillLight);

    // Architectural Concrete Lounge Room (Default Architecture)
    const defaultArchitectureGroup = new THREE.Group();
    scene.add(defaultArchitectureGroup);

    const roomMaterial = new THREE.MeshStandardMaterial({
      color: 0x38393c,
      roughness: 0.85,
      metalness: 0.1,
    });

    // Floor (smooth dark concrete)
    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x222326,
      roughness: 0.6,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Back Wall with cove ledge
    const backWallGeo = new THREE.PlaneGeometry(16, 8);
    const backWall = new THREE.Mesh(backWallGeo, roomMaterial);
    backWall.position.set(0, 4, -3.2);
    backWall.receiveShadow = true;
    defaultArchitectureGroup.add(backWall);

    // Cove ledge geometry
    const ledgeGeo = new THREE.BoxGeometry(16, 0.15, 0.4);
    const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x2d2e30, roughness: 0.7 });
    const ledge = new THREE.Mesh(ledgeGeo, ledgeMat);
    ledge.position.set(0, 3.4, -3.0);
    defaultArchitectureGroup.add(ledge);

    // Warm LED strip glowing line on ledge
    const stripGeo = new THREE.BoxGeometry(16, 0.05, 0.05);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffe2b2 });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(0, 3.48, -2.95);
    defaultArchitectureGroup.add(strip);

    // Right Wall with shelf niche (seen in Reference 1)
    const rightWallGeo = new THREE.PlaneGeometry(12, 8);
    const rightWall = new THREE.Mesh(rightWallGeo, roomMaterial);
    rightWall.position.set(4.5, 4, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    defaultArchitectureGroup.add(rightWall);

    // Shelf niche interior
    const shelfGeo = new THREE.BoxGeometry(0.35, 1.8, 2.2);
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x1f2022, roughness: 0.9 });
    const shelfNiche = new THREE.Mesh(shelfGeo, shelfMat);
    shelfNiche.position.set(4.35, 1.6, -1.0);
    defaultArchitectureGroup.add(shelfNiche);

    // Warm light inside shelf
    const shelfLight = new THREE.PointLight(0xffd599, 1.2, 3);
    shelfLight.position.set(4.1, 1.8, -1.0);
    defaultArchitectureGroup.add(shelfLight);

    // Decorative vase on shelf
    const vaseGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.4, 16);
    const vaseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const vase = new THREE.Mesh(vaseGeo, vaseMat);
    vase.position.set(4.2, 1.1, -1.2);
    defaultArchitectureGroup.add(vase);

    // Golden Carpet with Fringes (Reference 1)
    const rugGeo = new THREE.PlaneGeometry(4.4, 2.6);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x9b7a3e,
      roughness: 0.75,
      metalness: 0.35,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.015, 0.1);
    rug.receiveShadow = true;
    defaultArchitectureGroup.add(rug);

    // If editorRoom has a custom 3D scenario uploaded/set, load it and hide default walls!
    const sceneAssetUuid =
      extractAssetUuid(editorRoom?.sceneAssetId || editorRoom?.sceneAssetBlobUrl) ||
      extractAssetUuid(editorRoom?.placedObjects?.find((object) => object.type === 'cenario'));

    if (sceneAssetUuid || (editorRoom?.sceneAssetBlobUrl && !editorRoom.sceneAssetBlobUrl.startsWith('blob:'))) {
      const scenarioLoader = new GLTFLoader();

      const loadScenarioGlb = (loadUrl: string) => {
        scenarioLoader.load(
          loadUrl,
          (gltf) => {
            defaultArchitectureGroup.visible = false;
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const rawHeight = Math.max(0.01, size.y);
            const targetCeiling = editorRoom?.boundary?.y || 2.80;
            const scale = targetCeiling / rawHeight;
            model.scale.set(scale, scale, scale);

            const scaledBox = new THREE.Box3().setFromObject(model);
            const center = scaledBox.getCenter(new THREE.Vector3());
            model.position.x = -center.x;
            model.position.z = -center.z;
            scaledBox.setFromObject(model);
            model.position.y = -scaledBox.min.y;

            model.traverse((node) => {
              if ((node as THREE.Mesh).isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                const mat = (node as THREE.Mesh).material;
                if (mat) {
                  if (Array.isArray(mat)) {
                    mat.forEach((m) => (m.side = THREE.DoubleSide));
                  } else {
                    mat.side = THREE.DoubleSide;
                  }
                }
              }
            });

            scene.add(model);
          },
          undefined,
          (err) => {
            console.warn('[LoungeCanvas3D] Could not load custom scenario GLB:', err);
          }
        );
      };

      if (sceneAssetUuid) {
        resolveAssetDownloadUrl(sceneAssetUuid, editorRoom?.id).then((freshUrl) => {
          if (freshUrl) {
            loadScenarioGlb(freshUrl);
          } else {
            console.warn('[LoungeCanvas3D] Falha ao resolver asset_id do cenário:', sceneAssetUuid);
          }
        });
      } else if (editorRoom?.sceneAssetBlobUrl) {
        loadScenarioGlb(editorRoom.sceneAssetBlobUrl);
      }
    } else if (editorRoom?.sceneAssetId === 'inv-scene-1') {
      defaultArchitectureGroup.visible = false;
      const scarlet = createScarletSalonArchitecture();
      scene.add(scarlet);
    } else if (editorRoom?.sceneAssetId === 'inv-scene-2') {
      defaultArchitectureGroup.visible = false;
      const loft = createLoftArchitecture();
      scene.add(loft);
    }

    // Spot Meshes: Glowing circles (círculos brilhantes) + discreet blinking down-arrow
    const spotClickablesGroup = new THREE.Group();
    scene.add(spotClickablesGroup);
    spotClickablesGroupRef.current = spotClickablesGroup;
    spotAnimatedMeshesRef.current = [];

    const createGlowingSpotMesh = (spotId: number, posX: number, posY: number, posZ: number) => {
      const group = new THREE.Group();
      group.position.set(posX, posY, posZ);
      (group as any).userData = { spotId, isSpotInteractive: true };

      const style = spotVisualConfigRef.current?.indicatorStyle || 'full';
      const arrowScale = spotVisualConfigRef.current?.arrowScale || 1.0;
      const signalScale = spotVisualConfigRef.current?.signalScale || 1.0;

      const isWhitePulse = style === 'white_pulse';
      const isYellow = style === 'yellow_gold';
      const isArrowOnly = style === 'arrow_only';

      // 1. Ground Glowing Disc (Thin circle flat on the floor at Y = 0.015)
      const discGeo = new THREE.CircleGeometry(0.48 * signalScale, 32);
      const discMat = new THREE.MeshBasicMaterial({
        color: isWhitePulse ? 0xffffff : 0xd4af37,
        transparent: true,
        opacity: isWhitePulse ? 0.20 : 0.28,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.015;
      disc.visible = !isArrowOnly;
      (disc as any).userData = { spotId, isSpotInteractive: true };
      group.add(disc);

      // 2. Outer Luminous Neon Ring
      const outerRingGeo = new THREE.RingGeometry(0.42 * signalScale, 0.50 * signalScale, 32);
      const outerRingMat = new THREE.MeshBasicMaterial({
        color: isWhitePulse ? 0xffffff : 0xffd700,
        transparent: true,
        opacity: isWhitePulse ? 0.90 : 0.85,
        side: THREE.DoubleSide,
      });
      const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
      outerRing.rotation.x = -Math.PI / 2;
      outerRing.position.y = 0.018;
      outerRing.visible = !isArrowOnly;
      (outerRing as any).userData = { spotId, isSpotInteractive: true };
      group.add(outerRing);

      // 3. Inner Pulsing Halo Ring
      const innerRingGeo = new THREE.RingGeometry(0.20 * signalScale, 0.25 * signalScale, 32);
      const innerRingMat = new THREE.MeshBasicMaterial({
        color: isWhitePulse ? 0xffffff : 0xfff0a0,
        transparent: true,
        opacity: isWhitePulse ? 0.80 : 0.65,
        side: THREE.DoubleSide,
      });
      const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.y = 0.02;
      innerRing.visible = !isArrowOnly;
      (innerRing as any).userData = { spotId, isSpotInteractive: true };
      group.add(innerRing);

      // 4. Center Beacon Dot
      const centerDotGeo = new THREE.CircleGeometry(0.07 * signalScale, 16);
      const centerDotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      });
      const centerDot = new THREE.Mesh(centerDotGeo, centerDotMat);
      centerDot.rotation.x = -Math.PI / 2;
      centerDot.position.y = 0.022;
      centerDot.visible = !isArrowOnly;
      (centerDot as any).userData = { spotId, isSpotInteractive: true };
      group.add(centerDot);

      // 5. Floating Discreet Blinking Arrow pointing down (seta piscando p baixo)
      const arrowGroup = new THREE.Group();
      arrowGroup.name = `spotArrow-${spotId}`;
      (arrowGroup as any).userData = { spotId, isSpotArrow: true };

      // Inverted Cone (pointing down: tip at bottom)
      const coneGeo = new THREE.ConeGeometry(0.11 * arrowScale, 0.24 * arrowScale, 16);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: isWhitePulse ? 0xffffff : 0xffd700,
        transparent: true,
        opacity: 0.85,
      });
      const cone = new THREE.Mesh(coneGeo, arrowMat);
      cone.rotation.x = Math.PI; // Inverted pointing downwards!
      cone.position.y = 0.82;
      (cone as any).userData = { spotId, isSpotInteractive: true };
      arrowGroup.add(cone);

      // Small round base for the arrow
      const capGeo = new THREE.CylinderGeometry(0.11 * arrowScale, 0.11 * arrowScale, 0.04 * arrowScale, 16);
      const cap = new THREE.Mesh(capGeo, arrowMat);
      cap.position.y = 0.82 + 0.12 * arrowScale;
      (cap as any).userData = { spotId, isSpotInteractive: true };
      arrowGroup.add(cap);

      // Arrow visibility based on config & showSpotArrows
      arrowGroup.visible = style === 'pillar' ? false : isArrowOnly ? true : isYellow ? false : showSpotArrowsRef.current;

      group.add(arrowGroup);

      // 6. Pulsing light pillar (alternative to the arrow)
      const pillarMat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pillarMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2 * signalScale, 0.2 * signalScale, 1.8, 24, 1, true),
        pillarMat
      );
      pillarMesh.position.y = 0.9;
      pillarMesh.visible = style === 'pillar';
      (pillarMesh as any).userData = { spotId, isSpotInteractive: true, isSpotPillar: true };
      group.add(pillarMesh);
      spotClickablesGroup.add(group);

      spotAnimatedMeshesRef.current.push({
        group,
        arrowGroup,
        arrowMat,
        pillarMesh,
        pillarMat,
        outerRingMat,
        innerRingMat,
        spotId,
        baseY: 0,
      });

      return group;
    };

    // Editor rooms only show spots explicitly configured by the creator.
    if (editorRoom) {
      spots.forEach((spot) => {
        createGlowingSpotMesh(spot.id, spot.position[0], spot.position[1], spot.position[2]);
      });
    } else {
      // Left seating spot
      createGlowingSpotMesh(1, -1.45, 0, 0);

      // Center seating spot
      createGlowingSpotMesh(2, 0, 0, 0.2);

      // Right seating spot
      createGlowingSpotMesh(3, 1.45, 0, 0);
    }

    // If editorRoom has placedObjects, render them (excluding customAvatarObject which will be controlled as the player avatar)!
    if (editorRoom?.placedObjects && editorRoom.placedObjects.length > 0) {
      const gltfLoader = new GLTFLoader();
      editorRoom.placedObjects.forEach((obj) => {
        if ((obj.type === 'pose' || obj.isPose) && obj.attachedAvatarIds?.length) {
          return;
        }

        const objAssetUuid = extractAssetUuid(obj.assetId || (obj as any).originalItemId || obj.fileBlobUrl);
        if (obj.type === 'cenario' && sceneAssetUuid && objAssetUuid === sceneAssetUuid) {
          return;
        }

        // If this object is designated as the player's custom avatar, skip rendering it as a static room prop!
        if (customAvatarObject && obj.id === customAvatarObject.id) {
          return;
        }

        const objGroup = new THREE.Group();
        objGroup.position.set(obj.position[0], obj.position[1], obj.position[2]);
        objGroup.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
        objGroup.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);

        if (obj.isMissingAsset || (!objAssetUuid && !obj.fileBlobUrl)) return;

        if (objAssetUuid) {
          resolveAssetDownloadUrl(objAssetUuid, editorRoom?.id).then((freshUrl) => {
            if (freshUrl) {
              gltfLoader.load(
                freshUrl,
                (gltf) => {
                  const m = gltf.scene;
                  const rawBox = new THREE.Box3().setFromObject(m);
                  const center = rawBox.getCenter(new THREE.Vector3());
                  m.position.x = -center.x;
                  m.position.z = -center.z;
                  m.position.y = -rawBox.min.y;
                  m.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                      child.castShadow = true;
                      child.receiveShadow = true;
                      const mat = (child as THREE.Mesh).material;
                      if (mat) {
                        if (Array.isArray(mat)) {
                          mat.forEach((x) => (x.side = THREE.DoubleSide));
                        } else {
                          mat.side = THREE.DoubleSide;
                        }
                      }
                    }
                  });
                  objGroup.add(m);
                },
                undefined,
                () => {
                  console.warn(`Não foi possível carregar o asset do objeto "${obj.name}".`);
                }
              );
            }
          });
        } else if (obj.fileBlobUrl) {
          gltfLoader.load(obj.fileBlobUrl, (gltf) => {
            const m = gltf.scene;
            const rawBox = new THREE.Box3().setFromObject(m);
            const center = rawBox.getCenter(new THREE.Vector3());
            m.position.x = -center.x;
            m.position.z = -center.z;
            m.position.y = -rawBox.min.y;
            m.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const mat = (child as THREE.Mesh).material;
                if (mat) {
                  if (Array.isArray(mat)) {
                    mat.forEach((x) => (x.side = THREE.DoubleSide));
                  } else {
                    mat.side = THREE.DoubleSide;
                  }
                }
              }
            });
            objGroup.add(m);
          }, undefined, () => {
            console.warn(`Não foi possível carregar o asset do objeto "${obj.name}".`);
          });
        }
        scene.add(objGroup);
        placedObjectsMapRef.current.set(obj.id, objGroup);
      });
    }

    // Center Avatar: Player (customized dynamically according to customAvatarObject or activeUserAvatar)
    const playerGroup = new THREE.Group();
    playerGroup.position.set(0, 0.28, 0.2);
    scene.add(playerGroup);
    playerGroupRef.current = playerGroup;

    // Group for remote players in the 3D scene
    const remotePlayersGroup = new THREE.Group();
    scene.add(remotePlayersGroup);
    remotePlayersGroupRef.current = remotePlayersGroup;

    // Track head positions in 3D for speech bubble placement
    headPosRef.current = {
      self: new THREE.Vector3(0, 1.25, 0.2),
    };

    // Render loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const time = performance.now() * 0.001;

      const player = playerGroupRef.current;
      const previousAction = appliedAvatarActionRef.current;
      if (player) {
        player.position.sub(previousAction.position);
        player.rotation.x -= previousAction.rotation.x;
        player.rotation.y -= previousAction.rotation.y;
        player.rotation.z -= previousAction.rotation.z;
        if (previousAction.scale !== 1) {
          player.scale.divideScalar(previousAction.scale);
        }
        previousAction.position.set(0, 0, 0);
        previousAction.rotation.set(0, 0, 0);
        previousAction.scale = 1;
      }
      const previousWalkingOffset = walkingOffsetRef.current;
      if (player) {
        player.position.y -= previousWalkingOffset.y;
        player.rotation.x -= previousWalkingOffset.rotationX;
        player.rotation.z -= previousWalkingOffset.rotationZ;
      }
      previousWalkingOffset.y = 0;
      previousWalkingOffset.rotationX = 0;
      previousWalkingOffset.rotationZ = 0;

      const teleport = teleportAnimationRef.current;
      if (player && teleport) {
        const elapsed = performance.now() - teleport.startedAt;
        const fadeOutDuration = 170;
        const fadeInDuration = 260;
        const smoothstep = (value: number) => value * value * (3 - 2 * value);
        if (!teleport.swapped && elapsed >= fadeOutDuration) {
          player.position.copy(teleport.destination);
          teleport.swapped = true;
        }
        const opacity = elapsed < fadeOutDuration
          ? 1 - smoothstep(elapsed / fadeOutDuration)
          : smoothstep((elapsed - fadeOutDuration) / fadeInDuration);
        setTeleportFadeOpacity(THREE.MathUtils.clamp(opacity, 0, 1));
        if (elapsed >= fadeOutDuration + fadeInDuration) {
          player.position.copy(teleport.destination);
          freeMoveHoldRef.current = teleport.destination.clone();
          restoreTeleportFade();
          teleportAnimationRef.current = null;
        }
      }

      // Smooth camera orbit positioning
      if (cameraRef.current) {
        const cam = cameraRef.current;
        const cameraResponse = 0.1 + cameraSensitivityRef.current * 0.03;
        if (player) {
          if (cameraFocusUserIdRef.current) {
            const focusedPlayer = remotePlayersRef.current.find(
              (remote) => remote.userId === cameraFocusUserIdRef.current
            );
            const focusedPosition = focusedPlayer?.position;
            if (Array.isArray(focusedPosition) && focusedPosition.length >= 3) {
              cameraFocusTargetRef.current = new THREE.Vector3(
                Number(focusedPosition[0]),
                Number(focusedPosition[1]),
                Number(focusedPosition[2])
              );
            }
          }
          const followTarget =
            cameraFocusTargetRef.current ||
            player.position.clone().add(cameraFollowOffsetRef.current);
          followTarget.add(cameraPanOffsetRef.current);
          cameraTargetRef.current.lerp(followTarget, cameraResponse);
        }
        let targetRadius = cameraAnglesRef.current.radius;
        let targetPhi = cameraAnglesRef.current.phi;
        let targetTheta = cameraAnglesRef.current.theta;
        let targetLookAtY = 0.55;

        if (cameraMode === 'frontal') {
          targetRadius = 4.4;
          targetPhi = 0.1;
          targetTheta = 0;
          targetLookAtY = 0.5;
        } else if (cameraMode === 'closeup') {
          targetRadius = 2.4;
          targetPhi = 0.05;
          targetTheta = 0;
          targetLookAtY = 0.65;
        } else if (cameraMode === 'topdown') {
          targetRadius = 5.2;
          targetPhi = 0.75;
          targetTheta = 0;
          targetLookAtY = 0.2;
        }

        const target = cameraTargetRef.current;
        const x = target.x + targetRadius * Math.sin(targetTheta) * Math.cos(targetPhi);
        const y = target.y + targetRadius * Math.sin(targetPhi) + 0.35;
        const z = target.z + targetRadius * Math.cos(targetTheta) * Math.cos(targetPhi);

        cam.position.lerp(new THREE.Vector3(x, y, z), cameraResponse);
        cam.lookAt(target.x, target.y + targetLookAtY, target.z);

        // Project 3D head positions to 2D screen coordinates
        if (onUpdateAvatarHeadScreenPos && container) {
          const rect = container.getBoundingClientRect();
          const screenPosMap: Record<string, { x: number; y: number }> = {};

          // Update player head position based on actual player avatar position in 3D
          if (playerGroupRef.current) {
            const playerWorldHead = new THREE.Vector3();
            playerGroupRef.current.getWorldPosition(playerWorldHead);
            // Position bubble directly over top of avatar head
            const headHeight = 1.30 * (transform.scale || 1.0) * (transform.sizeY || 1.0);
            playerWorldHead.y += headHeight;
            headPosRef.current.self = playerWorldHead;
          }

          Object.entries(headPosRef.current).forEach(([idStr, vec3]) => {
            const tempVec = vec3.clone();
            tempVec.project(cam);
            if (tempVec.z < 1) {
              const screenX = ((tempVec.x + 1) / 2) * rect.width;
              const screenY = ((-tempVec.y + 1) / 2) * rect.height;
              screenPosMap[idStr] = { x: screenX, y: screenY };
            }
          });

          onUpdateAvatarHeadScreenPos(screenPosMap);
        }
      }

      // Complete an active click-to-move even when free floor movement is disabled.
      if (
        playerGroupRef.current &&
        !teleportAnimationRef.current &&
        (freeMoveEnabledRef.current || movementTargetRef.current || freeMoveHoldRef.current)
      ) {
        const movement = movementTargetRef.current;
        if (movement) {
          const elapsed = Math.max(0, (performance.now() - movement.startedAt) / 1000);
          const progress = Math.min(1, elapsed / Math.max(0.5, movementDurationRef.current));
          const easedProgress = progress * progress * (3 - 2 * progress);
          const path = movement.path || [movement.from, movement.to];
          const pathLength = movement.pathLength || movement.from.distanceTo(movement.to);
          let remainingDistance = pathLength * easedProgress;
          for (let index = 1; index < path.length; index += 1) {
            const segmentLength = path[index - 1].distanceTo(path[index]);
            if (remainingDistance <= segmentLength || index === path.length - 1) {
              const segmentProgress = segmentLength > 0 ? remainingDistance / segmentLength : 1;
              playerGroupRef.current.position.lerpVectors(
                path[index - 1],
                path[index],
                THREE.MathUtils.clamp(segmentProgress, 0, 1)
              );
              break;
            }
            remainingDistance -= segmentLength;
          }
          if (alternateAxisWalkingRef.current && progress < 1 && pathLength > 0.05) {
            const stepPhase = elapsed * Math.PI * 2 * 1.7;
            const hop = (1 - Math.cos(stepPhase * 2)) * 0.018;
            const rotationX = Math.cos(stepPhase) * 0.025;
            const rotationZ = Math.sin(stepPhase) * 0.075;
            playerGroupRef.current.position.y += hop;
            playerGroupRef.current.rotation.x += rotationX;
            playerGroupRef.current.rotation.z += rotationZ;
            walkingOffsetRef.current = { y: hop, rotationX, rotationZ };
          }
          const direction = movement.to.clone().sub(movement.from);
          if (direction.lengthSq() > 0.0001) {
            playerGroupRef.current.rotation.y = Math.atan2(direction.x, direction.z);
          }
          if (progress >= 1) {
            playerGroupRef.current.position.copy(movement.to);
            freeMoveHoldRef.current = movement.to.clone();
            movementTargetRef.current = null;
          }
        } else if (freeMoveEnabledRef.current && freeMoveHoldRef.current) {
          playerGroupRef.current.position.copy(freeMoveHoldRef.current);
        }
      } else if (!teleportAnimationRef.current && editorRoom?.spots && playerGroupRef.current) {
        const activeEditorSpot =
          editorRoom.spots[currentSpotIdRef.current - 1] ||
          editorRoom.spots.find((s, idx) => idx + 1 === currentSpotIdRef.current);
        if (activeEditorSpot?.motion?.enabled) {
          const cfg = activeEditorSpot.motion;
          const spd = cfg.speed || 1.0;
          const phase = (time * spd * 2.0) % (Math.PI * 2);
          const factor = cfg.loop ? (1 - Math.cos(phase)) / 2 : (time * spd) % 1.0;

          const baseDx = (cfg.deltaPosition?.[0] || 0) * factor;
          let baseDy = (cfg.deltaPosition?.[1] || 0) * factor;
          let baseDz = (cfg.deltaPosition?.[2] || 0) * factor;
          let posX = baseDx;
          let posY = baseDy;
          let posZ = baseDz;

          const traj = cfg.curveTrajectory || 'linear';
          if (traj === 'arc') {
            const h = cfg.curveHeight !== undefined ? cfg.curveHeight : 2.0;
            posY += 4 * h * factor * (1 - factor);
          } else if (traj === 'circle_turn') {
            const turnDeg = cfg.turnAngle !== undefined ? cfg.turnAngle : 360;
            const rad = THREE.MathUtils.degToRad(turnDeg * factor);
            const radius = cfg.curveRadius !== undefined ? cfg.curveRadius : 2.0;
            posX = radius * Math.sin(rad) + baseDx;
            posZ = radius * (1 - Math.cos(rad)) + baseDz;
          } else if (traj === 'spiral') {
            const turnDeg = cfg.turnAngle !== undefined ? cfg.turnAngle : 360;
            const rad = THREE.MathUtils.degToRad(turnDeg * factor);
            const radius = cfg.curveRadius !== undefined ? cfg.curveRadius : 1.5;
            posX = radius * Math.cos(rad) - radius + baseDx;
            posZ = radius * Math.sin(rad) + baseDz;
          } else if (traj === 'wave') {
            posY += Math.sin(factor * Math.PI * 4) * 0.35;
          }

          const ryDeg =
            cfg.turnAngle !== undefined && traj === 'circle_turn'
              ? cfg.turnAngle * factor
              : (cfg.deltaRotation?.[1] || 0) * factor;

          const activeSpot = spots.find((s) => s.id === currentSpotIdRef.current) || spots[1];
          const spotRotRad = THREE.MathUtils.degToRad(activeSpot?.rotation || 0);
          const worldX = posX * Math.cos(spotRotRad) + posZ * Math.sin(spotRotRad);
          const worldZ = -posX * Math.sin(spotRotRad) + posZ * Math.cos(spotRotRad);

          const offX = transformRef.current.positionOffset?.[0] || 0;
          const offY = transformRef.current.positionOffset?.[1] || 0;
          const offZ = transformRef.current.positionOffset?.[2] || 0;

          playerGroupRef.current.position.set(
            activeSpot.position[0] + offX + worldX,
            activeSpot.position[1] + (currentPoseRef.current.heightOffset || 0) + offY + posY,
            activeSpot.position[2] + offZ + worldZ
          );

          const totalAngleDeg =
            activeSpot.rotation +
            transformRef.current.angle +
            (currentPoseRef.current.rotationOffset || 0) +
            ryDeg;
          playerGroupRef.current.rotation.y = THREE.MathUtils.degToRad(totalAngleDeg);
        } else if (playerGroupRef.current) {
          // If the current spot has NO motion configured, ensure player avatar is held firmly at its still spot position
          const activeSpot = spots.find((s) => s.id === currentSpotIdRef.current) || spots[1];
          if (activeSpot) {
            const offX = transformRef.current.positionOffset?.[0] || 0;
            const offY = transformRef.current.positionOffset?.[1] || 0;
            const offZ = transformRef.current.positionOffset?.[2] || 0;
            const targetX = activeSpot.position[0] + offX;
            const targetY = activeSpot.position[1] + (currentPoseRef.current.heightOffset || 0) + offY;
            const targetZ = activeSpot.position[2] + offZ;
            if (
              Math.abs(playerGroupRef.current.position.x - targetX) > 0.001 ||
              Math.abs(playerGroupRef.current.position.y - targetY) > 0.001 ||
              Math.abs(playerGroupRef.current.position.z - targetZ) > 0.001
            ) {
              playerGroupRef.current.position.set(targetX, targetY, targetZ);
              const totalAngleDeg =
                activeSpot.rotation +
                transformRef.current.angle +
                (currentPoseRef.current.rotationOffset || 0);
              playerGroupRef.current.rotation.y = THREE.MathUtils.degToRad(totalAngleDeg);
            }
          }

        }
      }

      const remoteGroup = remotePlayersGroupRef.current;
      if (remoteGroup) {
        const currentRemotePlayers = remotePlayersRef.current;
        remoteGroup.children.forEach((container, index) => {
          const remoteId = container.userData.remoteUserId;
          const remote = currentRemotePlayers.find((item) => item.userId === remoteId);
          if (!remote) return;
          const spot =
            spots.find(
              (candidate) =>
                candidate.id === remote.spotId ||
                String(candidate.id) === String(remote.spotId)
            ) ||
            spots[index % Math.max(1, spots.length)] ||
            { position: [1.2 * (index + 1), 0.02, 0], rotation: 0 };
          const remotePosition = remote.position;
          const target = Array.isArray(remotePosition) && remotePosition.length >= 3
            ? new THREE.Vector3(
                Number(remotePosition[0]),
                Number(remotePosition[1]),
                Number(remotePosition[2])
              )
            : new THREE.Vector3(
                spot.position[0],
                spot.position[1] + 0.26,
                spot.position[2]
              );
          container.position.lerp(target, 0.12);
          container.rotation.y = THREE.MathUtils.degToRad(
            (spot.rotation || 0) + (remote.pose?.rotationOffset || 0)
          );
          headPosRef.current[String(remote.userId)] = new THREE.Vector3(
            container.position.x,
            container.position.y +
              (remote.pose?.glbKey?.toLowerCase().includes('sit') ||
              remote.pose?.name?.toLowerCase().includes('sentar') ||
              (spot as any).type === 'sentar'
                ? 1.0
                : 1.45),
            container.position.z
          );
        });
      }

      const avatarAction = activeAvatarActionRef.current;
      if (avatarAction?.motion && playerGroupRef.current) {
        const cfg = avatarAction.motion;
        if (activeAvatarActionStartRef.current.actionId !== avatarAction.id) {
          activeAvatarActionStartRef.current = { actionId: avatarAction.id, startedAt: time };
        }
        const elapsed = time - activeAvatarActionStartRef.current.startedAt;
        const factor =
          cfg.durationSeconds !== undefined && elapsed >= cfg.durationSeconds
            ? 0
            : getActionMotionFactor(cfg, elapsed);
        const trajectory = cfg.curveTrajectory || 'linear';
        let actionX = (cfg.deltaPosition?.[0] || 0) * factor;
        let actionY = (cfg.deltaPosition?.[1] || 0) * factor;
        let actionZ = (cfg.deltaPosition?.[2] || 0) * factor;

        if (trajectory === 'arc') {
          actionY += 4 * (cfg.curveHeight ?? 1.2) * factor * (1 - factor);
        } else if (trajectory === 'circle_turn') {
          const angle = THREE.MathUtils.degToRad((cfg.turnAngle ?? 360) * factor);
          const radius = cfg.curveRadius ?? 1.2;
          actionX = radius * Math.sin(angle) + (cfg.deltaPosition?.[0] || 0) * factor;
          actionZ = radius * (1 - Math.cos(angle)) + (cfg.deltaPosition?.[2] || 0) * factor;
        } else if (trajectory === 'spiral') {
          const angle = THREE.MathUtils.degToRad((cfg.turnAngle ?? 360) * factor);
          const radius = cfg.curveRadius ?? 0.8;
          actionX = radius * (Math.cos(angle) - 1) + (cfg.deltaPosition?.[0] || 0) * factor;
          actionZ = radius * Math.sin(angle) + (cfg.deltaPosition?.[2] || 0) * factor;
          actionY += factor * 0.5;
        } else if (trajectory === 'wave') {
          actionY += Math.sin(factor * Math.PI * 4) * 0.25;
        }

        const avatar = playerGroupRef.current;
        avatar.position.x += actionX;
        avatar.position.y += actionY;
        avatar.position.z += actionZ;
        const rotationX = THREE.MathUtils.degToRad((cfg.deltaRotation?.[0] || 0) * factor);
        const rotationY = THREE.MathUtils.degToRad(
          (trajectory === 'circle_turn' ? cfg.turnAngle ?? 360 : cfg.deltaRotation?.[1] || 0) *
            factor
        );
        const rotationZ = THREE.MathUtils.degToRad((cfg.deltaRotation?.[2] || 0) * factor);
        avatar.rotation.x += rotationX;
        avatar.rotation.y += rotationY;
        avatar.rotation.z += rotationZ;
        appliedAvatarActionRef.current.position.set(actionX, actionY, actionZ);
        appliedAvatarActionRef.current.rotation.set(rotationX, rotationY, rotationZ);

        if (cfg.scaleFactor !== undefined) {
          const scaleFactor = 1 + (cfg.scaleFactor - 1) * factor;
          avatar.scale.multiplyScalar(scaleFactor);
          appliedAvatarActionRef.current.scale = scaleFactor;
        }
      } else if (!avatarAction) {
        activeAvatarActionStartRef.current.actionId = null;
      }

      if (playerGroupRef.current && onPlayerPositionChangeRef.current) {
        const position = playerGroupRef.current.position;
        const lastPosition = lastReportedPlayerPositionRef.current;
        const moved =
          !lastPosition ||
          position.distanceToSquared(lastPosition) > 0.0004;
        if (moved && time - lastPositionReportAtRef.current >= 0.18) {
          const reportedPosition = new THREE.Vector3(
            Number(position.x.toFixed(3)),
            Number(position.y.toFixed(3)),
            Number(position.z.toFixed(3))
          );
          onPlayerPositionChangeRef.current([
            reportedPosition.x,
            reportedPosition.y,
            reportedPosition.z,
          ]);
          lastReportedPlayerPositionRef.current = reportedPosition;
          lastPositionReportAtRef.current = time;
        }
      }

      // Move any parent placedObjects in editorRoom that have motion configured
      if (editorRoom?.spots) {
        editorRoom.spots.forEach((spot) => {
          if (spot.motion?.enabled && spot.parentObjectId && (spot.motion.target === 'parent_object' || spot.motion.target === 'both')) {
            const pGroup = placedObjectsMapRef.current.get(spot.parentObjectId);
            const baseObj = editorRoom.placedObjects.find((o) => o.id === spot.parentObjectId);
            if (pGroup && baseObj) {
              const cfg = spot.motion;
              const spd = cfg.speed || 1.0;
              const phase = (time * spd * 2.0) % (Math.PI * 2);
              const factor = cfg.loop ? (1 - Math.cos(phase)) / 2 : (time * spd) % 1.0;

              const baseDx = (cfg.deltaPosition?.[0] || 0) * factor;
              let baseDy = (cfg.deltaPosition?.[1] || 0) * factor;
              let baseDz = (cfg.deltaPosition?.[2] || 0) * factor;
              let posX = baseDx;
              let posY = baseDy;
              let posZ = baseDz;

              const traj = cfg.curveTrajectory || 'linear';
              if (traj === 'arc') {
                const h = cfg.curveHeight !== undefined ? cfg.curveHeight : 2.0;
                posY += 4 * h * factor * (1 - factor);
              } else if (traj === 'circle_turn') {
                const turnDeg = cfg.turnAngle !== undefined ? cfg.turnAngle : 360;
                const rad = THREE.MathUtils.degToRad(turnDeg * factor);
                const radius = cfg.curveRadius !== undefined ? cfg.curveRadius : 2.0;
                posX = radius * Math.sin(rad) + baseDx;
                posZ = radius * (1 - Math.cos(rad)) + baseDz;
              } else if (traj === 'spiral') {
                const turnDeg = cfg.turnAngle !== undefined ? cfg.turnAngle : 360;
                const rad = THREE.MathUtils.degToRad(turnDeg * factor);
                const radius = cfg.curveRadius !== undefined ? cfg.curveRadius : 1.5;
                posX = radius * Math.cos(rad) - radius + baseDx;
                posZ = radius * Math.sin(rad) + baseDz;
              } else if (traj === 'wave') {
                posY += Math.sin(factor * Math.PI * 4) * 0.35;
              }

              const spotRotRad = THREE.MathUtils.degToRad(spot.rotation || 0);
              const worldX = posX * Math.cos(spotRotRad) + posZ * Math.sin(spotRotRad);
              const worldZ = -posX * Math.sin(spotRotRad) + posZ * Math.cos(spotRotRad);

              const rxDeg = (cfg.deltaRotation?.[0] || 0) * factor;
              const ryDeg = cfg.turnAngle !== undefined && traj === 'circle_turn'
                ? cfg.turnAngle * factor
                : (cfg.deltaRotation?.[1] || 0) * factor;
              const rzDeg = (cfg.deltaRotation?.[2] || 0) * factor;

              pGroup.position.set(
                baseObj.position[0] + worldX,
                baseObj.position[1] + posY,
                baseObj.position[2] + worldZ
              );
              pGroup.rotation.set(
                baseObj.rotation[0] + THREE.MathUtils.degToRad(rxDeg),
                baseObj.rotation[1] + THREE.MathUtils.degToRad(ryDeg),
                baseObj.rotation[2] + THREE.MathUtils.degToRad(rzDeg)
              );
            }
          }
        });
      }

      // Animate spot circles & blinking down-arrows
      spotAnimatedMeshesRef.current.forEach((item) => {
        const isCurrentSpot = item.spotId === currentSpotIdRef.current;
        const isPillarStyle = spotVisualConfigRef.current?.indicatorStyle === 'pillar';
        // Show arrow only if not currently occupying this spot and toggle is on
        const shouldShowArrow = showSpotArrowsRef.current && !isCurrentSpot && !isPillarStyle;
        item.arrowGroup.visible = shouldShowArrow;
        item.pillarMesh.visible = isPillarStyle && !isCurrentSpot;
        if (isPillarStyle) {
          item.pillarMat.opacity = 0.22 + 0.33 * (0.5 + 0.5 * Math.sin(time * 2.4));
        }

        if (shouldShowArrow) {
          // Bobbing up and down
          item.arrowGroup.position.y = item.baseY + Math.sin(time * 3.6) * 0.07;
          // Discreet blinking/pulsing opacity
          item.arrowMat.opacity = 0.45 + 0.55 * Math.abs(Math.sin(time * 3.2));
        }

        // Soft pulse on inner glowing circle
        item.innerRingMat.opacity = 0.35 + 0.45 * Math.sin(time * 2.8);
        item.outerRingMat.opacity = isCurrentSpot ? 0.95 : 0.70;
      });

      renderer.render(scene, camera);
    };

    animate();

    // Direct 3D Raycasting on Click: click on spot circle / arrow to move there
    let clickStartX = 0;
    let clickStartY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      clickStartX = e.clientX;
      clickStartY = e.clientY;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

      // Right-click (button === 2) or middle-click (button === 1): PAN
      if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        isPanningRef.current = true;
        isDraggingRef.current = false;
        container.style.cursor = 'grabbing';
        return;
      }

      // Left-click (button === 0): ORBIT
      if (e.button === 0) {
        isDraggingRef.current = true;
        isPanningRef.current = false;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

      // Right-click Pan Navigation
      if (isPanningRef.current && cameraRef.current) {
        if (e.buttons === 0) {
          isPanningRef.current = false;
          container.style.cursor = 'default';
          return;
        }
        const cam = cameraRef.current;
        const vFovRad = (cam.fov * Math.PI) / 180;
        const visibleHeightAtDist = 2 * Math.tan(vFovRad / 2) * Math.max(0.5, cameraAnglesRef.current.radius);
        const factor = visibleHeightAtDist / Math.max(100, container.clientHeight);

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);

        cameraPanOffsetRef.current.addScaledVector(
          right,
          -deltaX * factor * cameraSensitivityRef.current
        );
        cameraPanOffsetRef.current.addScaledVector(
          up,
          deltaY * factor * cameraSensitivityRef.current
        );
        return;
      }

      // Left-click Orbit
      if (isDraggingRef.current) {
        cameraAnglesRef.current.theta -= deltaX * 0.005 * cameraSensitivityRef.current;
        cameraAnglesRef.current.phi = Math.max(
          -0.35,
          Math.min(
            1.40,
            cameraAnglesRef.current.phi + deltaY * 0.005 * cameraSensitivityRef.current
          )
        );
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        container.style.cursor = 'default';
      }
      isDraggingRef.current = false;

      // Detect click if drag was minimal (< 5px)
      const dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);
      if (dist < 5 && container && cameraRef.current && spotClickablesGroupRef.current) {
        const rect = container.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, cameraRef.current);
        const getMagneticCollisionBounds = (): THREE.Box3[] => {
          const bounds: THREE.Box3[] = [];
          placedObjectsMapRef.current.forEach((group) => {
            group.updateMatrixWorld(true);
            const objectBounds = new THREE.Box3().setFromObject(group);
            if (!objectBounds.isEmpty()) bounds.push(objectBounds);
          });

          const remoteGroup = remotePlayersGroupRef.current;
          if (remoteGroup) {
            remoteGroup.updateMatrixWorld(true);
            remoteGroup.children.forEach((container) => {
              const avatarVisual = container.children.find(
                (child) => !(child instanceof THREE.Sprite)
              );
              if (!avatarVisual) return;
              const avatarBounds = new THREE.Box3().setFromObject(avatarVisual);
              if (!avatarBounds.isEmpty()) bounds.push(avatarBounds);
            });
          }
          return bounds;
        };
        const movePlayerTo = (
          target: THREE.Vector3,
          teleport = false,
          obstacleBounds: THREE.Box3[] = []
        ) => {
          const player = playerGroupRef.current;
          if (!player) return;
          const destination = target.clone();
          if (teleport) {
            movementTargetRef.current = null;
            prepareTeleportFade(player);
            teleportAnimationRef.current = {
              startedAt: performance.now(),
              destination,
              swapped: false,
            };
          } else {
            teleportAnimationRef.current = null;
            restoreTeleportFade();
            const from = player.position.clone();
            const path = obstacleBounds.length
              ? createCollisionFreePath(from, destination, obstacleBounds)
              : [from, destination];
            const pathLength = path.slice(1).reduce(
              (length, point, index) => length + path[index].distanceTo(point),
              0
            );
            movementTargetRef.current = {
              from,
              to: destination,
              startedAt: performance.now(),
              path,
              pathLength,
            };
          }
          freeMoveHoldRef.current = destination;
        };
        const moveBesideBounds = (bounds: THREE.Box3, hitPoint?: THREE.Vector3) => {
          const player = playerGroupRef.current;
          if (!player || bounds.isEmpty()) return false;
          const center = bounds.getCenter(new THREE.Vector3());
          const halfSize = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
          const direction = new THREE.Vector2();
          if (hitPoint) {
            direction.set(hitPoint.x - center.x, hitPoint.z - center.z);
          }
          if (direction.lengthSq() < 0.01 && cameraRef.current) {
            direction.set(
              cameraRef.current.position.x - center.x,
              cameraRef.current.position.z - center.z
            );
          }
          if (direction.lengthSq() < 0.0001) {
            direction.set(player.position.x - center.x, player.position.z - center.z);
          }
          if (direction.lengthSq() < 0.0001) direction.set(0, 1);
          direction.normalize();
          const projectedHalfExtent =
            Math.abs(direction.x) * halfSize.x + Math.abs(direction.y) * halfSize.z;
          const clearance = 0.48;
          const boundaryX = Math.max(0.5, (editorRoom?.boundary?.x || 16) / 2 - 0.35);
          const boundaryZ = Math.max(0.5, (editorRoom?.boundary?.z || 16) / 2 - 0.35);
          const target = new THREE.Vector3(
            THREE.MathUtils.clamp(center.x + direction.x * (projectedHalfExtent + clearance), -boundaryX, boundaryX),
            player.position.y,
            THREE.MathUtils.clamp(center.z + direction.y * (projectedHalfExtent + clearance), -boundaryZ, boundaryZ)
          );
          const nearestX = THREE.MathUtils.clamp(target.x, bounds.min.x, bounds.max.x);
          const nearestZ = THREE.MathUtils.clamp(target.z, bounds.min.z, bounds.max.z);
          if (Math.hypot(target.x - nearestX, target.z - nearestZ) < 0.38) return false;
          movePlayerTo(
            target,
            teleportOnSpotClickRef.current,
            getMagneticCollisionBounds()
          );
          return true;
        };

        const remoteGroup = remotePlayersGroupRef.current;
        const remoteHits = remoteGroup
          ? raycaster.intersectObjects(remoteGroup.children, true)
          : [];
        if (remoteHits.length > 0) {
          let hitObject: THREE.Object3D | null = remoteHits[0].object;
          while (
            hitObject &&
            !hitObject.userData?.remoteUserId &&
            hitObject.parent
          ) {
            hitObject = hitObject.parent;
          }
          const remoteUserId = hitObject?.userData?.remoteUserId;
          const remotePlayer = remotePlayersRef.current.find(
            (player) => player.userId === remoteUserId
          );
          if (remotePlayer) {
            if (magneticSnapEnabledRef.current && playerGroupRef.current && remoteGroup) {
              const remoteContainer = remoteGroup.children.find(
                (child) => child.userData.remoteUserId === remoteUserId
              );
              const avatarVisual = remoteContainer?.children.find(
                (child) => !(child instanceof THREE.Sprite)
              );
              if (avatarVisual) {
                remoteGroup.updateMatrixWorld(true);
                const avatarBounds = new THREE.Box3().setFromObject(avatarVisual);
                if (moveBesideBounds(avatarBounds, remoteHits[0].point)) {
                  cameraFocusUserIdRef.current = null;
                  cameraFocusTargetRef.current = null;
                  cameraPanOffsetRef.current.set(0, 0, 0);
                  return;
                }
              }
            }
            cameraFocusUserIdRef.current = remotePlayer.userId;
            cameraPanOffsetRef.current.set(0, 0, 0);
            cameraFocusTargetRef.current = new THREE.Vector3(
              Number(remotePlayer.position?.[0] ?? remoteHits[0].point.x),
              Number(remotePlayer.position?.[1] ?? remoteHits[0].point.y),
              Number(remotePlayer.position?.[2] ?? remoteHits[0].point.z)
            );
            cameraAnglesRef.current.radius = Math.max(
              3.4,
              Math.min(cameraAnglesRef.current.radius, 5)
            );
            return;
          }
        }
        const intersects = raycaster.intersectObjects(
          spotClickablesGroupRef.current.children,
          true
        );
        let clickedSpot: Spot | undefined;
        if (clickSpotsEnabledRef.current && intersects.length > 0) {
          let hitObject: THREE.Object3D | null = intersects[0].object;
          while (
            hitObject &&
            (hitObject as any).userData?.spotId === undefined &&
            hitObject.parent
          ) {
            hitObject = hitObject.parent;
          }
          const clickedSpotId = (hitObject as any)?.userData?.spotId;
          clickedSpot = spots.find(
            (spot) =>
              spot.id === clickedSpotId || String(spot.id) === String(clickedSpotId)
          );
        }

        if (clickedSpot) {
          cameraFocusUserIdRef.current = null;
          cameraFocusTargetRef.current = null;
          cameraPanOffsetRef.current.set(0, 0, 0);
          const player = playerGroupRef.current;
          if (
            player &&
            (freeMoveEnabledRef.current ||
              teleportOnSpotClickRef.current ||
              alternateAxisWalkingRef.current)
          ) {
            const offset = transformRef.current.positionOffset;
            const target = new THREE.Vector3(
              clickedSpot.position[0] + (offset?.[0] || 0),
              clickedSpot.position[1] +
                (currentPoseRef.current.heightOffset || 0) +
                (offset?.[1] || 0),
              clickedSpot.position[2] + (offset?.[2] || 0)
            );
            movePlayerTo(target, teleportOnSpotClickRef.current);
            onSelectSpotRef.current(clickedSpot.id);
          } else if (clickedSpot.id === currentSpotIdRef.current) {
            const hitPoint = intersects[0].point;
            const offX = hitPoint.x - clickedSpot.position[0];
            const offZ = hitPoint.z - clickedSpot.position[2];
            const maxRadius =
              (clickedSpot as any)?.relativeRadius ||
              (clickedSpot as any)?.radius ||
              spotVisualConfigRef.current?.relativeSpotRadius ||
              0.45;
            const distance = Math.hypot(offX, offZ);
            const ratio = distance > maxRadius && distance > 0 ? maxRadius / distance : 1;
            onChangeTransformRef.current?.({
              ...transformRef.current,
              positionOffset: [
                parseFloat((offX * ratio).toFixed(2)),
                transformRef.current.positionOffset?.[1] || 0,
                parseFloat((offZ * ratio).toFixed(2)),
              ],
            });
          } else {
            onSelectSpotRef.current(clickedSpot.id);
          }
          return;
        }

        if (magneticSnapEnabledRef.current && playerGroupRef.current) {
          const movableObjectIds = new Set(
            (editorRoom?.placedObjects || [])
              .filter((object) => object.type === 'movel' || object.type === 'objeto')
              .map((object) => object.id)
          );
          const objectGroups = Array.from(placedObjectsMapRef.current.entries())
            .filter(([id]) => movableObjectIds.has(id))
            .map(([, group]) => group);
          const objectHits = raycaster.intersectObjects(objectGroups, true);
          if (objectHits.length > 0) {
            let hitObject: THREE.Object3D | null = objectHits[0].object;
            while (
              hitObject &&
              typeof hitObject.userData?.placedObjectId !== 'string' &&
              hitObject.parent
            ) {
              hitObject = hitObject.parent;
            }
            const selectedObjectId = hitObject?.userData?.placedObjectId;
            const selectedObject = (editorRoom?.placedObjects || []).find(
              (object) => object.id === selectedObjectId
            );
            const selectedGroup = selectedObjectId
              ? placedObjectsMapRef.current.get(selectedObjectId)
              : undefined;
            if (selectedObject && selectedGroup) {
              selectedGroup.updateMatrixWorld(true);
              const objectBounds = new THREE.Box3().setFromObject(selectedGroup);
              if (moveBesideBounds(objectBounds, objectHits[0].point)) return;
            }
          }
        }

        if (
          (freeMoveEnabledRef.current || teleportOnSpotClickRef.current) &&
          playerGroupRef.current
        ) {
          cameraFocusUserIdRef.current = null;
          cameraFocusTargetRef.current = null;
          cameraPanOffsetRef.current.set(0, 0, 0);
          const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const floorPoint = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(floorPlane, floorPoint)) {
            const boundaryX = Math.max(1, (editorRoom?.boundary?.x || 16) / 2 - 0.35);
            const boundaryZ = Math.max(1, (editorRoom?.boundary?.z || 16) / 2 - 0.35);
            const target = new THREE.Vector3(
              THREE.MathUtils.clamp(floorPoint.x, -boundaryX, boundaryX),
              playerGroupRef.current.position.y,
              THREE.MathUtils.clamp(floorPoint.z, -boundaryZ, boundaryZ)
            );
            if (magneticSnapEnabledRef.current) {
              const nearbyBounds = getMagneticCollisionBounds()
                .map((bounds) => {
                  const nearestX = THREE.MathUtils.clamp(target.x, bounds.min.x, bounds.max.x);
                  const nearestZ = THREE.MathUtils.clamp(target.z, bounds.min.z, bounds.max.z);
                  return {
                    bounds,
                    distance: Math.hypot(target.x - nearestX, target.z - nearestZ),
                  };
                })
                .filter((entry) => entry.distance <= 1.25)
                .sort((a, b) => a.distance - b.distance);
              if (nearbyBounds[0] && moveBesideBounds(nearbyBounds[0].bounds, floorPoint)) {
                cameraFocusUserIdRef.current = null;
                cameraFocusTargetRef.current = null;
                cameraPanOffsetRef.current.set(0, 0, 0);
                return;
              }
            }
            const minAvatarDistance = 0.72;
            const peers = remotePlayersRef.current.map((remote, index) => {
              const position = remote.position;
              if (Array.isArray(position) && position.length >= 3) {
                return new THREE.Vector2(Number(position[0]), Number(position[2]));
              }
              const spot = spots.find(
                (candidate) =>
                  candidate.id === remote.spotId ||
                  String(candidate.id) === String(remote.spotId)
              );
              const fallback = spot?.position || [1.2 * (index + 1), 0, 0];
              return new THREE.Vector2(fallback[0], fallback[2]);
            });

            for (let pass = 0; pass < 4; pass += 1) {
              peers.forEach((peer) => {
                const offset = new THREE.Vector2(target.x - peer.x, target.z - peer.y);
                const distance = offset.length();
                if (distance < minAvatarDistance) {
                  if (distance < 0.001) {
                    offset.set(
                      playerGroupRef.current!.position.x - peer.x,
                      playerGroupRef.current!.position.z - peer.y
                    );
                    if (offset.length() < 0.001) offset.set(1, 0);
                  }
                  offset.normalize().multiplyScalar(minAvatarDistance);
                  target.x = THREE.MathUtils.clamp(peer.x + offset.x, -boundaryX, boundaryX);
                  target.z = THREE.MathUtils.clamp(peer.y + offset.y, -boundaryZ, boundaryZ);
                }
              });
            }

            movePlayerTo(
              target,
              teleportOnSpotClickRef.current,
              magneticSnapEnabledRef.current ? getMagneticCollisionBounds() : []
            );
            return;
          }
        }
      }
    };

    // Smooth exponential zoom with a wide range for viewing the full room.
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = Math.max(-150, Math.min(150, e.deltaY));
      const zoomFactor = Math.exp(delta * 0.0018 * cameraSensitivityRef.current);
      const current = cameraAnglesRef.current.radius;
      const next = current * zoomFactor;
      // At minimum radius, keep zooming by moving the orbit target forward (dolly) instead of stalling
      if (delta < 0 && next < MIN_CAMERA_RADIUS && cameraRef.current) {
        const dir = new THREE.Vector3();
        cameraRef.current.getWorldDirection(dir);
        cameraTargetRef.current.addScaledVector(dir, (MIN_CAMERA_RADIUS - next) + 0.04);
        cameraAnglesRef.current.radius = MIN_CAMERA_RADIUS;
      } else {
        cameraAnglesRef.current.radius = THREE.MathUtils.clamp(
          next,
          MIN_CAMERA_RADIUS,
          MAX_CAMERA_RADIUS
        );
      }
    };

    // Keyboard arrow keys navigation to move scenario / orbit room
    const handleKeyDown = (e: KeyboardEvent) => {
      if (interactionDisabledRef.current) return;
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        cameraAnglesRef.current.theta += 0.06;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        cameraAnglesRef.current.theta -= 0.06;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (e.shiftKey) {
          cameraAnglesRef.current.radius = Math.max(
            MIN_CAMERA_RADIUS,
            cameraAnglesRef.current.radius - 0.4
          );
        } else {
          cameraAnglesRef.current.phi = Math.min(1.40, cameraAnglesRef.current.phi + 0.04);
        }
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (e.shiftKey) {
          cameraAnglesRef.current.radius = Math.min(
            MAX_CAMERA_RADIUS,
            cameraAnglesRef.current.radius + 0.4
          );
        } else {
          cameraAnglesRef.current.phi = Math.max(-0.35, cameraAnglesRef.current.phi - 0.04);
        }
      }
    };

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = container.clientWidth / container.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    const domEl = renderer.domElement;
    domEl.style.touchAction = 'none';
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const handleTouchStart = (e: TouchEvent) => {
      if (interactionDisabledRef.current) return;
      e.preventDefault();
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const gesture = touchGestureRef.current;
        gesture.didPinch = false;
        gesture.moved = false;
        previousMousePositionRef.current = { x: touch.clientX, y: touch.clientY };
        clickStartX = touch.clientX;
        clickStartY = touch.clientY;
        isDraggingRef.current = true;
        isPanningRef.current = false;
      } else if (e.touches.length >= 2) {
        const first = e.touches[0];
        const second = e.touches[1];
        isDraggingRef.current = false;
        isPanningRef.current = false;
        touchGestureRef.current.didPinch = true;
        touchGestureRef.current.moved = true;
        touchGestureRef.current.pinchDistance = Math.hypot(
          second.clientX - first.clientX,
          second.clientY - first.clientY
        );
        touchGestureRef.current.midpointX = (first.clientX + second.clientX) / 2;
        touchGestureRef.current.midpointY = (first.clientY + second.clientY) / 2;
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (interactionDisabledRef.current) return;
      e.preventDefault();
      if (e.touches.length >= 2) {
        const first = e.touches[0];
        const second = e.touches[1];
        const distance = Math.hypot(
          second.clientX - first.clientX,
          second.clientY - first.clientY
        );
        const midpointX = (first.clientX + second.clientX) / 2;
        const midpointY = (first.clientY + second.clientY) / 2;
        const gesture = touchGestureRef.current;

        if (gesture.pinchDistance > 0 && distance > 0) {
          const previousRadius = cameraAnglesRef.current.radius;
          const zoomRatio = gesture.pinchDistance / distance;
          const nextRadius = THREE.MathUtils.clamp(
            previousRadius * Math.pow(zoomRatio, 1.35 * cameraSensitivityRef.current),
            MIN_CAMERA_RADIUS,
            MAX_CAMERA_RADIUS
          );
          const zoomChange = Math.log(nextRadius / previousRadius);
          cameraAnglesRef.current.radius = nextRadius;
          if (zoomChange > 0) {
            cameraAnglesRef.current.phi = THREE.MathUtils.clamp(
              cameraAnglesRef.current.phi + zoomChange * 0.28,
              -0.35,
              1.40
            );
          }
          if (cameraRef.current) {
            const cam = cameraRef.current;
            const vFovRad = (cam.fov * Math.PI) / 180;
            const visibleHeightAtDist =
              2 * Math.tan(vFovRad / 2) * Math.max(0.5, cameraAnglesRef.current.radius);
            const factor = visibleHeightAtDist / Math.max(100, container.clientHeight);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
            cameraPanOffsetRef.current.addScaledVector(
              right,
              -(midpointX - gesture.midpointX) * factor * cameraSensitivityRef.current
            );
            cameraPanOffsetRef.current.addScaledVector(
              up,
              (midpointY - gesture.midpointY) * factor * cameraSensitivityRef.current
            );
          }
        }

        gesture.pinchDistance = distance;
        gesture.midpointX = midpointX;
        gesture.midpointY = midpointY;
      } else if (e.touches.length === 1 && !touchGestureRef.current.didPinch) {
        const touch = e.touches[0];
        const previous = previousMousePositionRef.current;
        const deltaX = touch.clientX - previous.x;
        const deltaY = touch.clientY - previous.y;
        previousMousePositionRef.current = { x: touch.clientX, y: touch.clientY };
        if (Math.abs(deltaX) + Math.abs(deltaY) > 1) {
          touchGestureRef.current.moved = true;
          cameraAnglesRef.current.theta -=
            deltaX * 0.005 * cameraSensitivityRef.current;
          cameraAnglesRef.current.phi = THREE.MathUtils.clamp(
            cameraAnglesRef.current.phi +
              deltaY * 0.005 * cameraSensitivityRef.current,
            -0.35,
            1.40
          );
        }
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchGestureRef.current.didPinch = true;
        touchGestureRef.current.pinchDistance = 0;
        return;
      }
      touchGestureRef.current.pinchDistance = 0;
      if (!touchGestureRef.current.didPinch && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        handleMouseUp(
          new MouseEvent('mouseup', {
            button: 0,
            clientX: touch.clientX,
            clientY: touch.clientY,
          })
        );
      } else {
        isDraggingRef.current = false;
      }
      touchGestureRef.current.didPinch = false;
    };
    const handleTouchCancel = () => {
      isDraggingRef.current = false;
      isPanningRef.current = false;
      touchGestureRef.current.pinchDistance = 0;
      touchGestureRef.current.didPinch = false;
    };
    domEl.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('contextmenu', handleContextMenu);
    domEl.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domEl.addEventListener('wheel', handleWheel, { passive: false });
    domEl.addEventListener('touchstart', handleTouchStart, { passive: false });
    domEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    domEl.addEventListener('touchend', handleTouchEnd);
    domEl.addEventListener('touchcancel', handleTouchCancel);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      domEl.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('contextmenu', handleContextMenu);
      domEl.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domEl.removeEventListener('wheel', handleWheel);
      domEl.removeEventListener('touchstart', handleTouchStart);
      domEl.removeEventListener('touchmove', handleTouchMove);
      domEl.removeEventListener('touchend', handleTouchEnd);
      domEl.removeEventListener('touchcancel', handleTouchCancel);
      window.removeEventListener('keydown', handleKeyDown);
      domEl.style.touchAction = '';
      teleportAnimationRef.current = null;
      restoreTeleportFade();
      if (container.contains(domEl)) {
        container.removeChild(domEl);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const previous = appliedCameraControlRef.current;
    const panX = cameraControl?.panX ?? 0;
    const panY = cameraControl?.panY ?? 0;
    const zoom = cameraControl?.zoom ?? 0;
    const deltaX = panX - previous.panX;
    const deltaY = panY - previous.panY;
    const deltaZoom = zoom - previous.zoom;
    appliedCameraControlRef.current = { panX, panY, zoom };

    const camera = cameraRef.current;
    const container = mountRef.current;
    if (camera && container && (deltaX !== 0 || deltaY !== 0)) {
      const vFovRad = (camera.fov * Math.PI) / 180;
      const visibleHeightAtDist =
        2 * Math.tan(vFovRad / 2) * Math.max(0.5, cameraAnglesRef.current.radius);
      const factor = visibleHeightAtDist / Math.max(100, container.clientHeight);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      cameraPanOffsetRef.current.addScaledVector(right, -deltaX * factor);
      cameraPanOffsetRef.current.addScaledVector(up, deltaY * factor);
    }
    if (deltaZoom !== 0) {
      cameraAnglesRef.current.radius = THREE.MathUtils.clamp(
        cameraAnglesRef.current.radius * Math.exp(deltaZoom),
        MIN_CAMERA_RADIUS,
        MAX_CAMERA_RADIUS
      );
    }
  }, [cameraControl?.panX, cameraControl?.panY, cameraControl?.zoom]);

  useEffect(() => {
    if (!focusAvatarRequest) return;
    cameraFocusUserIdRef.current = null;
    cameraFocusTargetRef.current = null;
    cameraPanOffsetRef.current.set(0, 0, 0);
    cameraAnglesRef.current.radius = 3.4;
    cameraAnglesRef.current.phi = 0.12;
    cameraAnglesRef.current.theta = 0;
    cameraFollowOffsetRef.current.set(0, 0.45, 0);
  }, [focusAvatarRequest]);

  const placedObjectsKey = (editorRoom?.placedObjects || [])
    .map((object) => [
      object.id,
      object.assetId,
      object.position.join(','),
      object.rotation.join(','),
      object.scale.join(','),
      object.isMissingAsset ? 'missing' : '',
    ].join(':'))
    .join('|');
  const sceneAssetUuid =
    extractAssetUuid(editorRoom?.sceneAssetId || editorRoom?.sceneAssetBlobUrl) ||
    extractAssetUuid(editorRoom?.placedObjects?.find((object) => object.type === 'cenario'));

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const desiredObjects = new Map(
      (editorRoom?.placedObjects || [])
        .filter((object) =>
          !((object.type === 'pose' || object.isPose) && object.attachedAvatarIds?.length) &&
          !(object.type === 'cenario' && sceneAssetUuid &&
            extractAssetUuid(object.assetId || object.fileBlobUrl) === sceneAssetUuid) &&
          !(customAvatarObject && object.id === customAvatarObject.id)
        )
        .map((object) => [object.id, object])
    );

    const disposeGroup = (group: THREE.Group) => {
      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
    };

    placedObjectsMapRef.current.forEach((group, id) => {
      if (desiredObjects.has(id)) return;
      scene.remove(group);
      disposeGroup(group);
      placedObjectsMapRef.current.delete(id);
    });

    const loader = new GLTFLoader();
    desiredObjects.forEach((object, id) => {
      const existing = placedObjectsMapRef.current.get(id);
      if (existing) {
        existing.position.set(...object.position);
        existing.rotation.set(...object.rotation);
        existing.scale.set(...object.scale);
        return;
      }

      const assetId = extractAssetUuid(object.assetId || (object as any).originalItemId || object.fileBlobUrl);
      if (object.isMissingAsset || (!assetId && !object.fileBlobUrl)) return;

      const group = new THREE.Group();
      group.position.set(...object.position);
      group.rotation.set(...object.rotation);
      group.scale.set(...object.scale);
      group.userData.placedObjectId = id;
      scene.add(group);
      placedObjectsMapRef.current.set(id, group);

      const loadModel = (url: string) => {
        loader.load(
          url,
          (gltf) => {
            if (placedObjectsMapRef.current.get(id) !== group) {
              disposeGroup(gltf.scene as THREE.Group);
              return;
            }
            const model = gltf.scene;
            const bounds = new THREE.Box3().setFromObject(model);
            const center = bounds.getCenter(new THREE.Vector3());
            model.position.set(-center.x, -bounds.min.y, -center.z);
            model.traverse((child) => {
              if (!(child as THREE.Mesh).isMesh) return;
              child.castShadow = true;
              child.receiveShadow = true;
              const material = (child as THREE.Mesh).material;
              if (Array.isArray(material)) material.forEach((entry) => (entry.side = THREE.DoubleSide));
              else material.side = THREE.DoubleSide;
            });
            group.add(model);
          },
          undefined,
          () => console.warn(`Não foi possível carregar o asset do objeto "${object.name}".`)
        );
      };

      if (assetId) {
        void resolveAssetDownloadUrl(assetId, editorRoom?.id).then((url) => {
          if (url && placedObjectsMapRef.current.get(id) === group) loadModel(url);
        });
      } else if (object.fileBlobUrl) {
        loadModel(object.fileBlobUrl);
      }
    });

  }, [customAvatarObject?.id, editorRoom?.id, placedObjectsKey, sceneAssetUuid]);

  // Update Remote Players 3D Meshes & Floating Display Names
  useEffect(() => {
    if (!remotePlayersGroupRef.current) return;
    const group = remotePlayersGroupRef.current;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    if (remotePlayers && remotePlayers.length > 0) {
      remotePlayers.forEach((player, idx) => {
        const spot = spots.find(
          (s) => s.id === player.spotId || String(s.id) === String(player.spotId)
        ) || spots[idx % spots.length] || { position: [1.2 * (idx + 1), 0.02, 0], rotation: 0, type: 'pe' };

        const posX = spot.position?.[0] ?? (1.2 * (idx + 1));
        const posY = (spot.position?.[1] ?? 0.02) + 0.26;
        const posZ = spot.position?.[2] ?? 0;
        const rotY = THREE.MathUtils.degToRad(spot.rotation || 0);

        const poseName = String(player.pose?.name || '').toLowerCase();
        const poseGlbKey = String(player.pose?.glbKey || '').toLowerCase();
        const isSeated =
          poseGlbKey.includes('sit') ||
          poseName.includes('sentar') ||
          (spot as any).type === 'sentar';
        const poseAssetUrl =
          typeof player.pose?.fileBlobUrl === 'string' &&
          /^https?:\/\//i.test(player.pose.fileBlobUrl)
            ? player.pose.fileBlobUrl
            : undefined;
        const poseAssetId = extractAssetUuid(player.pose);

        const avatarUrls = [
          ...new Set(
            [
              player.avatar?.fileBlobUrl,
              player.avatar?.asset_url,
              player.avatar?.url,
              player.customAvatarUrl,
              player.avatarUrl,
            ].filter(
              (url): url is string =>
                typeof url === 'string' && /^https?:\/\//i.test(url)
            )
          ),
        ];
        const avatarAssetIds = [
          ...new Set(
            [
              player.avatar?.assetId,
              player.customAvatarAssetId,
              extractAssetUuid(player.avatar?.asset_url),
              extractAssetUuid(player.avatar?.fileBlobUrl),
              extractAssetUuid(player.avatar?.url),
              extractAssetUuid(player.customAvatarUrl),
            ]
              .map((candidate) => extractAssetUuid(candidate))
              .filter((assetId): assetId is string => Boolean(assetId))
          ),
        ];
        const playerContainer = new THREE.Group();
        const remotePosition = player.position;
        playerContainer.position.set(
          Array.isArray(remotePosition) ? Number(remotePosition[0]) : posX,
          Array.isArray(remotePosition) ? Number(remotePosition[1]) : posY,
          Array.isArray(remotePosition) ? Number(remotePosition[2]) : posZ
        );
        playerContainer.rotation.y = rotY;
        playerContainer.userData.remoteUserId = player.userId;

        // Create 3D floating canvas name tag above remote player's head
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'rgba(15, 17, 23, 0.90)';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(6, 6, 244, 52, 10);
          } else {
            ctx.rect(6, 6, 244, 52);
          }
          ctx.fill();

          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 3;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(6, 6, 244, 52, 10);
          } else {
            ctx.rect(6, 6, 244, 52);
          }
          ctx.stroke();

          ctx.font = 'bold 20px sans-serif';
          ctx.fillStyle = '#ffd700';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(player.displayName || 'Usuário', 128, 32);
        }

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(0, 1.35, 0);
        sprite.scale.set(1.4, 0.35, 1);
        playerContainer.add(sprite);

        // Store remote player head position in 3D for floating SpeechBubbleOverlay projection
        const headHeight = isSeated ? 1.0 : 1.45;
        headPosRef.current[String(player.userId)] = new THREE.Vector3(posX, posY + headHeight, posZ);

        const fallbackAvatar = new THREE.Group();
        const fallbackMaterial = new THREE.MeshStandardMaterial({
          color: '#d6b33f',
          roughness: 0.72,
          metalness: 0.08,
        });
        const torso = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.22, 0.62, 4, 8),
          fallbackMaterial
        );
        torso.position.y = 0.58;
        fallbackAvatar.add(torso);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 12, 10),
          fallbackMaterial
        );
        head.position.y = 1.12;
        fallbackAvatar.add(head);
        playerContainer.add(fallbackAvatar);

        const loader = new GLTFLoader();
        let directUrlIndex = 0;
        let assetIdIndex = 0;
        let poseAttempted = false;

        const tryNextAvatarSource = async (): Promise<void> => {
          if (playerContainer.parent !== group) return;
          if (!poseAttempted) {
            poseAttempted = true;
            let resolvedPoseUrl = poseAssetUrl;
            if (!resolvedPoseUrl && poseAssetId) {
              resolvedPoseUrl = (await resolveAssetDownloadUrl(poseAssetId, editorRoom?.id)) || undefined;
            }
            if (playerContainer.parent !== group) return;
            if (resolvedPoseUrl) {
              loadAvatar(resolvedPoseUrl, true);
              return;
            }
          }

          const nextDirectUrl = avatarUrls[directUrlIndex++];
          if (nextDirectUrl) {
            loadAvatar(nextDirectUrl);
            return;
          }

          while (assetIdIndex < avatarAssetIds.length) {
            const assetId = avatarAssetIds[assetIdIndex++];
            const resolvedUrl = await resolveAssetDownloadUrl(assetId, editorRoom?.id);
            if (playerContainer.parent !== group) return;
            if (resolvedUrl) {
              loadAvatar(resolvedUrl);
              return;
            }
          }
        };

        const applyRemotePoseAdjustment = (model: THREE.Group) => {
          if (poseName.includes('sentar') || poseName.includes('sitting')) {
            model.position.y -= 0.38;
          } else if (poseName.includes('deitar') || poseName.includes('reclinad')) {
            model.rotation.x = -Math.PI / 4.2;
            model.position.y -= 0.25;
            model.position.z -= 0.2;
          } else if (poseName.includes('acenar') || poseName.includes('wave')) {
            model.rotation.z = -0.06;
            model.rotation.y = 0.12;
          } else if (poseName.includes('rindo') || poseName.includes('laugh')) {
            model.rotation.x = 0.1;
            model.rotation.z = -0.03;
          } else if (poseName.includes('modelo') || poseName.includes('noir')) {
            model.rotation.y = 0.25;
            model.rotation.z = 0.04;
          }
        };

        const loadAvatar = (avatarGlbUrl: string, isPoseModel = false) => {
          loader.load(
            avatarGlbUrl,
            (gltf) => {
              if (playerContainer.parent !== group) return;
              const glbModel = gltf.scene;
              const box = new THREE.Box3().setFromObject(glbModel);
              const size = box.getSize(new THREE.Vector3());
              const targetHeight = isPoseModel ? 1.7 : isSeated ? 1.0 : 1.6;
              const scale = size.y > 0 ? targetHeight / size.y : 1;
              glbModel.scale.set(scale, scale, scale);

              const center = box.getCenter(new THREE.Vector3());
              glbModel.position.x = -center.x * scale;
              glbModel.position.z = -center.z * scale;
              glbModel.position.y = -box.min.y * scale;
              if (!isPoseModel && player.pose?.boneRotations) {
                glbModel.traverse((node) => {
                  if (!(node instanceof THREE.Bone)) return;
                  const rotation = player.pose.boneRotations[node.name];
                  if (!rotation) return;
                  node.rotation.set(
                    THREE.MathUtils.degToRad(rotation[0]),
                    THREE.MathUtils.degToRad(rotation[1]),
                    THREE.MathUtils.degToRad(rotation[2])
                  );
                });
              } else if (!isPoseModel) {
                applyRemotePoseAdjustment(glbModel);
              }

              playerContainer.remove(fallbackAvatar);
              playerContainer.add(glbModel);
            },
            undefined,
            (err) => {
              console.warn('Could not load remote player GLB model:', {
                userId: player.userId,
                assetId: isPoseModel ? poseAssetId : undefined,
                error: err,
              });
              void tryNextAvatarSource();
            }
          );
        };

        group.add(playerContainer);
        void tryNextAvatarSource();
      });
    }
  }, [remotePlayerSceneKey, spots]);

  // Update Player transform & Spot position & Pose geometry
  useEffect(() => {
    if (!playerGroupRef.current) return;
    const player = playerGroupRef.current;
    const previous = previousPoseOffsetsRef.current;
    const heightOffset = currentPose.heightOffset || 0;
    const rotationOffset = currentPose.rotationOffset || 0;
    const heightDelta = heightOffset - previous.height;
    const rotationDelta = rotationOffset - previous.rotation;
    previousPoseOffsetsRef.current = { height: heightOffset, rotation: rotationOffset };
    if (heightDelta !== 0) {
      player.position.y += heightDelta;
      if (freeMoveHoldRef.current) freeMoveHoldRef.current.y += heightDelta;
      if (movementTargetRef.current) {
        movementTargetRef.current.from.y += heightDelta;
        movementTargetRef.current.to.y += heightDelta;
      }
    }
    if (rotationDelta !== 0) {
      player.rotation.y += THREE.MathUtils.degToRad(rotationDelta);
    }
  }, [currentPose.heightOffset, currentPose.rotationOffset]);

  useEffect(() => {
    if (!playerGroupRef.current) return;
    const player = playerGroupRef.current;
    if (teleportAnimationRef.current) return;

    // Spot position & max radius clamping
    const activeSpot = spots.find((s) => s.id === currentSpotId) || spots[1];
    if (!activeSpot) {
      player.position.set(
        transform.positionOffset?.[0] || 0,
        (currentPose.heightOffset || 0) + (transform.positionOffset?.[1] || 0),
        0.2 + (transform.positionOffset?.[2] || 0)
      );
      player.scale.set(
        transform.scale,
        transform.scale * (transform.sizeY || 1.0),
        transform.scale
      );
      player.rotation.y = THREE.MathUtils.degToRad(
        transform.angle + (currentPose.rotationOffset || 0)
      );
      return;
    }

    const maxRadius =
      (activeSpot as any)?.relativeRadius ||
      (activeSpot as any)?.radius ||
      spotVisualConfig?.relativeSpotRadius ||
      0.45;

    let offX = transform.positionOffset?.[0] || 0;
    let offZ = transform.positionOffset?.[2] || 0;
    const dist = Math.hypot(offX, offZ);
    if (dist > maxRadius && dist > 0) {
      const ratio = maxRadius / dist;
      offX = offX * ratio;
      offZ = offZ * ratio;
    }
    const offY = transform.positionOffset?.[1] || 0;

    const previousPositionOffset = previousGizmoPositionRef.current;
    const positionDelta = [
      (transform.positionOffset?.[0] || 0) - previousPositionOffset[0],
      (transform.positionOffset?.[1] || 0) - previousPositionOffset[1],
      (transform.positionOffset?.[2] || 0) - previousPositionOffset[2],
    ];
    const spotChanged = previousGizmoSpotIdRef.current !== currentSpotId;
    const angleChanged = previousGizmoAngleRef.current !== transform.angle;
    previousGizmoPositionRef.current = [
      transform.positionOffset?.[0] || 0,
      transform.positionOffset?.[1] || 0,
      transform.positionOffset?.[2] || 0,
    ];
    previousGizmoSpotIdRef.current = currentSpotId;
    previousGizmoAngleRef.current = transform.angle;

    if (freeMoveEnabledRef.current) {
      if (spotChanged && !movementTargetRef.current) {
        player.position.set(
          activeSpot.position[0] + offX,
          activeSpot.position[1] + (currentPose.heightOffset || 0) + offY,
          activeSpot.position[2] + offZ
        );
      } else if (positionDelta.some((delta) => delta !== 0)) {
        const delta = new THREE.Vector3(...positionDelta);
        player.position.add(delta);
        if (movementTargetRef.current) {
          movementTargetRef.current.from.add(delta);
          movementTargetRef.current.to.add(delta);
        }
        if (freeMoveHoldRef.current) freeMoveHoldRef.current.add(delta);
      }
      freeMoveHoldRef.current = player.position.clone();
    } else if (!movementTargetRef.current) {
      player.position.set(
        activeSpot.position[0] + offX,
        activeSpot.position[1] + (currentPose.heightOffset || 0) + offY,
        activeSpot.position[2] + offZ
      );
    }

    // Transform from Gizmo (Scale, SizeY, Angle)
    player.scale.set(
      transform.scale,
      transform.scale * (transform.sizeY || 1.0),
      transform.scale
    );

    // Rotation: spot base angle + gizmo angle + pose angle offset
    if (!freeMoveEnabledRef.current || spotChanged || angleChanged) {
      const totalAngleDeg =
        activeSpot.rotation + transform.angle + (currentPose.rotationOffset || 0);
      player.rotation.y = THREE.MathUtils.degToRad(totalAngleDeg);
    }
  }, [
    transform.positionOffset?.[0],
    transform.positionOffset?.[1],
    transform.positionOffset?.[2],
    transform.angle,
    currentSpotId,
    spots,
  ]);

  // Synchronize Player Avatar 3D Model and Posture dynamically whenever activeUserAvatar, currentPose, customAvatarObject, or equippedAccessories changes
  useEffect(() => {
    if (!playerGroupRef.current) return;
    const playerGroup = playerGroupRef.current;
    let isEffectActive = true;

    // Clear previous avatar meshes from playerGroup
    while (playerGroup.children.length > 0) {
      const child = playerGroup.children[0];
      playerGroup.remove(child);
      child.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material.dispose());
      });
    }

    const poseName = (currentPose?.name || '').toLowerCase();
    const fallbackAvatar = createCharacterMesh({
      skinColor: 0xd6a77a,
      hairColor: 0x2b2018,
      clothColor: 0x9b2638,
      pantsColor: 0x25242a,
      hasGlasses: false,
      hasGoldChain: true,
      hairStyle: 'curly',
      currentPose: currentPose?.name,
    });
    playerGroup.add(fallbackAvatar);

    const removeFallbackAvatar = () => {
      playerGroup.remove(fallbackAvatar);
      fallbackAvatar.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material.dispose());
      });
    };

    const applyModelPoseAdjustments = (m: THREE.Group) => {
      if (poseName.includes('sentar')) {
        m.position.y -= 0.38;
      } else if (poseName.includes('deitar') || poseName.includes('reclinad')) {
        m.rotation.x = -Math.PI / 4.2;
        m.position.y -= 0.25;
        m.position.z -= 0.2;
      } else if (poseName.includes('acenar')) {
        m.rotation.z = -0.06;
        m.rotation.y = 0.12;
      } else if (poseName.includes('rindo')) {
        m.rotation.x = 0.1;
        m.rotation.z = -0.03;
      } else if (poseName.includes('modelo') || poseName.includes('noir')) {
        m.rotation.y = 0.25;
        m.rotation.z = 0.04;
      }
    };

    const avatarUuid = extractAssetUuid(
      activeUserAvatar?.assetId ||
      activeUserAvatar?.originalItemId ||
      customAvatarObject?.assetId
    );
    const poseAssetUuid = extractAssetUuid(currentPose?.assetId || currentPose?.fileBlobUrl);
    const avatarName = activeUserAvatar?.name || customAvatarObject?.name || 'Avatar';
    const avatarScale = activeUserAvatar ? undefined : customAvatarObject?.scale;
    const avatarRotation = activeUserAvatar ? undefined : customAvatarObject?.rotation;

    const renderGlbAvatar = (
      loadUrl: string,
      targetName: string,
      objScale?: [number, number, number],
      objRotation?: [number, number, number],
      isPoseModel = false
    ) => {
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(
        loadUrl,
        (gltf) => {
          if (!isEffectActive) return;
          const m = gltf.scene;
          const box = new THREE.Box3().setFromObject(m);
          const size = box.getSize(new THREE.Vector3());
          const targetH = 1.70;
          const s = targetH / Math.max(0.1, size.y);
          if (objScale) m.scale.set(...objScale);
          else m.scale.set(s, s, s);
          const scaledBox = new THREE.Box3().setFromObject(m);
          const center = scaledBox.getCenter(new THREE.Vector3());
          m.position.set(-center.x, -scaledBox.min.y, -center.z);
          if (objRotation) m.rotation.set(...objRotation);
          if (!isPoseModel && currentPose?.boneRotations) {
            m.traverse((node) => {
              if (!(node instanceof THREE.Bone)) return;
              const rotation = currentPose.boneRotations?.[node.name];
              if (!rotation) return;
              node.rotation.set(
                THREE.MathUtils.degToRad(rotation[0]),
                THREE.MathUtils.degToRad(rotation[1]),
                THREE.MathUtils.degToRad(rotation[2])
              );
            });
          } else if (!isPoseModel) {
            applyModelPoseAdjustments(m);
          }
          m.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.frustumCulled = false;
            }
          });
          removeFallbackAvatar();
          playerGroup.add(m);
        },
        undefined,
        () => {
          if (!isEffectActive) return;
          console.warn(`Não foi possível carregar o asset do avatar "${targetName}".`);
        }
      );
    };

    const poseAssetSource = currentPose?.fileBlobUrl;
    if (poseAssetUuid || poseAssetSource) {
      const resolvePoseUrl = poseAssetUuid
        ? resolveAssetDownloadUrl(poseAssetUuid)
        : Promise.resolve(poseAssetSource || null);
      resolvePoseUrl.then((freshUrl) => {
        if (!isEffectActive) return;
        if (freshUrl) {
          renderGlbAvatar(freshUrl, currentPose.name, undefined, undefined, true);
        } else {
          console.warn(`Não foi possível resolver o asset da pose "${currentPose.name}".`);
        }
      }).catch((error) => {
        if (isEffectActive) console.error('Falha ao resolver a pose da room:', error);
      });
    } else if (avatarUuid) {
      resolveAssetDownloadUrl(avatarUuid).then((freshUrl) => {
        if (!isEffectActive) return;
        if (freshUrl) {
          renderGlbAvatar(freshUrl, avatarName, avatarScale, avatarRotation);
        } else {
          console.warn(`Não foi possível resolver o asset do avatar "${avatarName}".`);
        }
      }).catch((error) => {
        if (isEffectActive) console.error('Falha ao resolver o avatar da room:', error);
      });
    }
    // Attach equipped accessories with their saved transforms to the player avatar
    if (!poseAssetUuid && !poseAssetSource && avatarUuid && Array.isArray(equippedAccessories) && equippedAccessories.length > 0) {
      equippedAccessories.forEach((acc: any) => {
        if (!acc || typeof acc !== 'object') return;
        if (!acc.equipped || !acc.isAccessory) return;
        const accGroup = new THREE.Group();
        const baseTrans: AccessoryTransform = acc.accessoryTransform || {
          position: [0.45, 1.45, 0.25],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        };
        const pos = baseTrans.position || [0.45, 1.45, 0.25];
        const rot = baseTrans.rotation || [0, 0, 0];
        const sca = baseTrans.scale || [1, 1, 1];
        accGroup.position.set(pos[0], pos[1], pos[2]);
        accGroup.rotation.set(rot[0], rot[1], rot[2]);
        accGroup.scale.set(sca[0], sca[1], sca[2]);

        const accAssetId = extractAssetUuid(
          acc.assetId || acc.originalItemId || acc.fileBlobUrl
        );
        const loadAccessory = (url: string) => {
          const accLoader = new GLTFLoader();
          accLoader.load(url, (accGltf) => {
            if (!isEffectActive) return;
            const accM = accGltf.scene;
            const accBox = new THREE.Box3().setFromObject(accM);
            const accSize = accBox.getSize(new THREE.Vector3());
            const maxDim = Math.max(accSize.x, accSize.y, accSize.z, 0.05);
            const s = 0.45 / maxDim;
            accM.scale.set(s, s, s);
            accM.traverse((n) => {
              if ((n as THREE.Mesh).isMesh) {
                n.castShadow = true;
                n.receiveShadow = true;
                n.frustumCulled = false;
              }
            });
            accGroup.add(accM);
          });
        };
        if (accAssetId) {
          resolveAssetDownloadUrl(accAssetId).then((freshUrl) => {
            if (!isEffectActive) return;
            if (freshUrl) loadAccessory(freshUrl);
            else console.warn(`Não foi possível resolver o asset do acessório "${acc.name}".`);
          }).catch((error) => {
            if (isEffectActive) console.error(`Falha ao resolver o acessório "${acc.name}":`, error);
          });
        }
        playerGroup.add(accGroup);
      });
    }
    return () => {
      isEffectActive = false;
    };
  }, [activeUserAvatar, currentPose, customAvatarObject, equippedAccessories]);

  // Update spot visual style dynamically on config changes
  useEffect(() => {
    if (!spotAnimatedMeshesRef.current || spotAnimatedMeshesRef.current.length === 0) return;
    const style = spotVisualConfig?.indicatorStyle || 'full';
    const arrowScale = spotVisualConfig?.arrowScale || 1.0;
    const signalScale = spotVisualConfig?.signalScale || 1.0;
    const isWhitePulse = style === 'white_pulse';
    const isYellow = style === 'yellow_gold';
    const isArrowOnly = style === 'arrow_only';

    spotAnimatedMeshesRef.current.forEach((item) => {
      if (item.arrowMat) {
        item.arrowMat.color.setHex(isWhitePulse ? 0xffffff : 0xffd700);
      }
      if (item.outerRingMat) {
        item.outerRingMat.color.setHex(isWhitePulse ? 0xffffff : 0xffd700);
      }
      if (item.innerRingMat) {
        item.innerRingMat.color.setHex(isWhitePulse ? 0xffffff : 0xfff0a0);
      }
      if (item.arrowGroup) {
        item.arrowGroup.visible = isArrowOnly ? true : isYellow ? false : showSpotArrowsRef.current;
        item.arrowGroup.scale.set(arrowScale, arrowScale, arrowScale);
      }
      if (item.group) {
        item.group.children.forEach((child) => {
          if ((child as any).userData?.isSpotArrow || (child as any).userData?.isSpotPillar) return;
          child.visible = !isArrowOnly;
          if ((child as THREE.Mesh).isMesh) {
            child.scale.set(signalScale, signalScale, signalScale);
          }
        });
      }
    });
  }, [spotVisualConfig]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden" ref={mountRef}>
      {/* Spot Click Targets Overlay */}
      <div className="absolute inset-0 pointer-events-none flex justify-center items-center">
        {/* Helper overlay for spot clicks */}
      </div>
    </div>
  );
};

// Procedural stylized 3D avatar mesh builder matching the stylish figures in Reference 1
function createCharacterMesh(options: {
  skinColor: number;
  hairColor: number;
  clothColor: number;
  pantsColor: number;
  hasGlasses: boolean;
  hasGoldChain: boolean;
  hairStyle: 'female-long' | 'curly' | 'afro-short';
  currentPose?: string;
}) {
  const group = new THREE.Group();
  const poseName = (options.currentPose || 'Em pé').toLowerCase();
  const isSeated = poseName.includes('sentar');
  const isReclined = poseName.includes('deitar') || poseName.includes('reclinad');
  const isWaving = poseName.includes('acenar');
  const isLaughing = poseName.includes('rindo');
  const isModel = poseName.includes('modelo') || poseName.includes('noir');

  // Materials
  const skinMat = new THREE.MeshStandardMaterial({
    color: options.skinColor,
    roughness: 0.6,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: options.hairColor,
    roughness: 0.8,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: options.clothColor,
    roughness: 0.7,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: options.pantsColor,
    roughness: 0.75,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // White clean sneakers matching reference
    roughness: 0.4,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    metalness: 0.9,
    roughness: 0.2,
  });

  // Torso / Hoodie
  const torsoGeo = new THREE.CylinderGeometry(0.24, 0.2, 0.45, 16);
  const torso = new THREE.Mesh(torsoGeo, clothMat);
  torso.position.y = 0.42;
  torso.castShadow = true;
  group.add(torso);

  // Hoodie collar / hood
  const hoodGeo = new THREE.TorusGeometry(0.16, 0.06, 12, 24);
  const hood = new THREE.Mesh(hoodGeo, clothMat);
  hood.rotation.x = Math.PI / 2.2;
  hood.position.set(0, 0.62, -0.04);
  group.add(hood);

  // Gold chain necklace (if equipped)
  if (options.hasGoldChain) {
    const chainGeo = new THREE.TorusGeometry(0.14, 0.018, 8, 24);
    const chain = new THREE.Mesh(chainGeo, goldMat);
    chain.rotation.x = Math.PI / 2.4;
    chain.position.set(0, 0.58, 0.05);
    group.add(chain);
  }

  // Head & Neck
  const neckGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.12, 12);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.68;
  group.add(neck);

  const headGeo = new THREE.SphereGeometry(0.17, 24, 24);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 0.84, 0.02);
  head.castShadow = true;
  if (isLaughing) {
    head.rotation.z = 0.12;
    head.rotation.x = -0.05;
  }
  group.add(head);

  // Hair
  if (options.hairStyle === 'curly') {
    const hairGeo = new THREE.SphereGeometry(0.19, 16, 16);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 0.9, -0.02);
    group.add(hair);

    for (let i = -2; i <= 2; i++) {
      const curlGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const curl = new THREE.Mesh(curlGeo, hairMat);
      curl.position.set(i * 0.05, 0.95, 0.12);
      group.add(curl);
    }
  } else if (options.hairStyle === 'female-long') {
    const topHairGeo = new THREE.SphereGeometry(0.185, 16, 16);
    const topHair = new THREE.Mesh(topHairGeo, hairMat);
    topHair.position.set(0, 0.88, -0.01);
    group.add(topHair);

    const backHairGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.45, 12);
    const backHair = new THREE.Mesh(backHairGeo, hairMat);
    backHair.position.set(0, 0.65, -0.1);
    group.add(backHair);
  } else {
    const afroGeo = new THREE.SphereGeometry(0.185, 16, 16);
    const afro = new THREE.Mesh(afroGeo, hairMat);
    afro.position.set(0, 0.88, 0);
    group.add(afro);
  }

  // Sunglasses / Glasses
  if (options.hasGlasses) {
    const glassesFrameMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.8,
      roughness: 0.2,
    });
    const glassesGeo = new THREE.BoxGeometry(0.24, 0.06, 0.05);
    const glasses = new THREE.Mesh(glassesGeo, glassesFrameMat);
    glasses.position.set(0, 0.85, 0.17);
    group.add(glasses);
  }

  // Posture Legs & Pelvis
  if (isSeated) {
    // Seated Cross-legged / Relaxed Legs on Pouf
    const pelvisGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.15, 16);
    const pelvis = new THREE.Mesh(pelvisGeo, pantsMat);
    pelvis.position.y = 0.14;
    group.add(pelvis);

    const leftThighGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.35, 12);
    const leftThigh = new THREE.Mesh(leftThighGeo, pantsMat);
    leftThigh.rotation.set(Math.PI / 2.5, 0, -Math.PI / 4.5);
    leftThigh.position.set(-0.18, 0.12, 0.18);
    group.add(leftThigh);

    const leftShinGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.34, 12);
    const leftShin = new THREE.Mesh(leftShinGeo, pantsMat);
    leftShin.rotation.set(0, 0, Math.PI / 2.3);
    leftShin.position.set(-0.08, 0.06, 0.32);
    group.add(leftShin);

    const rightThighGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.35, 12);
    const rightThigh = new THREE.Mesh(rightThighGeo, pantsMat);
    rightThigh.rotation.set(Math.PI / 2.5, 0, Math.PI / 4.5);
    rightThigh.position.set(0.18, 0.12, 0.18);
    group.add(rightThigh);

    const rightShinGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.34, 12);
    const rightShin = new THREE.Mesh(rightShinGeo, pantsMat);
    rightShin.rotation.set(0, 0, -Math.PI / 2.3);
    rightShin.position.set(0.08, 0.06, 0.32);
    group.add(rightShin);

    const shoeLeftGeo = new THREE.BoxGeometry(0.1, 0.08, 0.18);
    const shoeLeft = new THREE.Mesh(shoeLeftGeo, shoeMat);
    shoeLeft.position.set(-0.25, 0.05, 0.35);
    group.add(shoeLeft);

    const shoeRight = new THREE.Mesh(shoeLeftGeo, shoeMat);
    shoeRight.position.set(0.25, 0.05, 0.35);
    group.add(shoeRight);
  } else if (isReclined) {
    // Reclined / Lying on lounge
    group.rotation.x = -Math.PI / 4.5;
    group.position.y -= 0.15;
    group.position.z -= 0.2;

    const pelvisGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.15, 16);
    const pelvis = new THREE.Mesh(pelvisGeo, pantsMat);
    pelvis.position.y = 0.14;
    group.add(pelvis);

    const legGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.5, 12);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.1, -0.15, 0.08);
    legL.rotation.x = 0.2;
    group.add(legL);

    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.1, -0.15, 0.08);
    legR.rotation.x = 0.15;
    group.add(legR);

    const shoeLeftGeo = new THREE.BoxGeometry(0.1, 0.08, 0.18);
    const shoeL = new THREE.Mesh(shoeLeftGeo, shoeMat);
    shoeL.position.set(-0.1, -0.42, 0.12);
    group.add(shoeL);

    const shoeR = new THREE.Mesh(shoeLeftGeo, shoeMat);
    shoeR.position.set(0.1, -0.42, 0.12);
    group.add(shoeR);
  } else {
    // Standing legs (Em pé, Acenar, Rindo, Modelo Noir)
    const pelvisGeo = new THREE.CylinderGeometry(0.19, 0.17, 0.16, 16);
    const pelvis = new THREE.Mesh(pelvisGeo, pantsMat);
    pelvis.position.y = 0.22;
    group.add(pelvis);

    const legGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.44, 12);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.09, 0.0, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.09, 0.0, 0);
    group.add(rightLeg);

    const shoeLeftGeo = new THREE.BoxGeometry(0.1, 0.07, 0.18);
    const shoeLeft = new THREE.Mesh(shoeLeftGeo, shoeMat);
    shoeLeft.position.set(-0.09, -0.22, 0.03);
    group.add(shoeLeft);

    const shoeRight = new THREE.Mesh(shoeLeftGeo, shoeMat);
    shoeRight.position.set(0.09, -0.22, 0.03);
    group.add(shoeRight);
  }

  // Arms and Gestures
  const armLGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.32, 10);
  const armL = new THREE.Mesh(armLGeo, clothMat);
  const armRGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.32, 10);
  const armR = new THREE.Mesh(armRGeo, clothMat);

  if (isWaving) {
    // Right arm raised waving cordial greeting
    armR.rotation.set(-0.25, 0, -2.2);
    armR.position.set(0.26, 0.58, 0.05);
    armL.rotation.set(0.15, 0, 0.2);
    armL.position.set(-0.26, 0.38, 0.05);
  } else if (isLaughing) {
    // Hands playfully resting forward with laughter
    armL.rotation.set(0.5, 0, 0.35);
    armR.rotation.set(0.5, 0, -0.35);
    armL.position.set(-0.26, 0.36, 0.12);
    armR.position.set(0.26, 0.36, 0.12);
  } else if (isModel) {
    // Chic runway posture
    armL.rotation.set(-0.2, 0.2, 0.6);
    armL.position.set(-0.26, 0.38, 0.05);
    armR.rotation.set(0.1, 0, -0.2);
    armR.position.set(0.26, 0.36, 0.05);
    group.rotation.y = 0.2;
  } else if (isSeated) {
    armL.rotation.set(0.3, 0, 0.4);
    armL.position.set(-0.28, 0.36, 0.1);
    armR.rotation.set(0.3, 0, -0.4);
    armR.position.set(0.28, 0.36, 0.1);
  } else {
    // Default standing relaxed
    armL.rotation.set(0.15, 0, 0.15);
    armL.position.set(-0.26, 0.38, 0.02);
    armR.rotation.set(0.15, 0, -0.15);
    armR.position.set(0.26, 0.38, 0.02);
  }

  group.add(armL);
  group.add(armR);

  return group;
}
