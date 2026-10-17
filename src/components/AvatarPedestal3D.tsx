import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { CustomizationItem, ObjectAction, AccessoryTransform } from '../types';
import { getGlbFile, getAllGlbIds } from '../lib/storageIndexedDB';
import { extractAssetUuid, resolveAssetDownloadUrl } from '../lib/assetSyncClient';
import { getActionMotionFactor } from '../lib/actionMotion';

const PEDESTAL_SURFACE_Y = 0.12;
const PEDESTAL_OBJECT_CLEARANCE = 0.06;

function alignObjectBottomToY(object: THREE.Object3D, targetY: number): void {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (!bounds.isEmpty() && bounds.min.y < targetY) {
    object.position.y += targetY - bounds.min.y;
  }
}

interface AvatarPedestal3DProps {
  currentPose: string; // 'Em pé' | 'Sentar' | 'Deitar' | 'Rindo' | 'Acenar' | 'Modelo Noir'
  equippedItems: CustomizationItem[];
  avatarModelUrl?: string;
  avatarAssetId?: string | null;
  isAvatarMissingAsset?: boolean;
  avatarName?: string;
  posePreviewUrl?: string;
  posePreviewAssetId?: string | null;
  posePreviewName?: string;
  fineAdjustments: {
    panX: number;
    panY: number;
    rotationY: number;
    scale: number;
    elevationY: number;
  };
  onUpdateRotation?: (rotY: number) => void;
  onUpdateElevation?: (elevY: number) => void;
  onUpdateScale?: (scale: number) => void;
  onUpdatePan?: (x: number, y: number) => void;
  onRegisterSnapshotTaker?: (taker: () => string | null) => void;
  // Accessory positioning & Gizmo
  selectedItemToInspect?: CustomizationItem | null;
  selectedAccessoryId?: string | null;
  selectedAccessoryItem?: CustomizationItem | null;
  onSelectAccessory?: (id: string | null) => void;
  onUpdateAccessoryTransform?: (
    itemId: string,
    transform: AccessoryTransform
  ) => void;
  gizmoMode?: 'mover' | 'rodar' | 'escalar';
  activeAction?: ObjectAction | null;
  onActionComplete?: (actionId: string) => void;
  isPositionLocked?: boolean;
}

async function loadGlbWithIndexedDBFallback(
  url: string | undefined,
  itemId: string | undefined,
  originalItemId: string | undefined,
  onSuccess: (gltf: any) => void,
  onError: () => void,
  assetId?: string
) {
  const loader = new GLTFLoader();

  const tryLoad = (modelUrl: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        loader.load(
          modelUrl,
          (gltf) => {
            onSuccess(gltf);
            resolve(true);
          },
          undefined,
          (err) => {
            console.warn('[Pedestal3D GLTFLoader warning]:', modelUrl, err);
            resolve(false);
          }
        );
      } catch (err) {
        resolve(false);
      }
    });
  };

  // 1. PRIORIDADE MÁXIMA: Se houver um UUID real (public.assets.id), resolve URL fresca assinada
  const validUuid =
    extractAssetUuid(assetId) ||
    extractAssetUuid(itemId) ||
    extractAssetUuid(originalItemId) ||
    extractAssetUuid(url);

  if (validUuid) {
    try {
      const freshDownloadUrl = await resolveAssetDownloadUrl(validUuid);
      if (freshDownloadUrl) {
        console.log(`[Pedestal3D] Carregando model.glb via URL resolvida para UUID ${validUuid}`);
        const ok = await tryLoad(freshDownloadUrl);
        if (ok) return;
      }
    } catch (e) {
      console.warn('[Pedestal3D] Erro ao resolver asset:', e);
    }
  }

  // 2. Se a URL fornecida for uma URL remota válida https:// (sem query expirada)
  if (
    url &&
    typeof url === 'string' &&
    url.startsWith('http') &&
    !url.includes('X-Amz-Signature') &&
    !url.includes('Expires=')
  ) {
    const ok = await tryLoad(url);
    if (ok) return;
  }

  // 3. Fallback para IndexedDB local (se houver cópia em cache local)
  const localFileIds = [assetId, originalItemId, itemId]
    .filter((id): id is string => Boolean(id && !id.startsWith('blob:')))
    .filter((id, index, ids) => ids.indexOf(id) === index);

  for (const localFileId of localFileIds) {
    try {
      const blob = await getGlbFile(localFileId);
      if (blob) {
        const freshUrl = URL.createObjectURL(blob);
        const ok = await tryLoad(freshUrl);
        if (ok) return;
      }
    } catch (e) {}
  }

  // 4. Último recurso se ainda for blob e estiver vivo nesta aba
  if (url && url.startsWith('blob:')) {
    try {
      const testRes = await fetch(url).catch(() => null);
      if (testRes && testRes.ok) {
        const ok = await tryLoad(url);
        if (ok) return;
      }
    } catch (e) {}
  }

  // Falha na obtenção do arquivo 3D real
  onError();
}

export const AvatarPedestal3D: React.FC<AvatarPedestal3DProps> = ({
  currentPose,
  equippedItems,
  avatarModelUrl,
  avatarAssetId = null,
  isAvatarMissingAsset = false,
  avatarName = 'Noite de Gala',
  posePreviewUrl,
  posePreviewAssetId,
  posePreviewName,
  fineAdjustments,
  onUpdateRotation,
  onRegisterSnapshotTaker,
  selectedItemToInspect = null,
  selectedAccessoryId = null,
  selectedAccessoryItem = null,
  onSelectAccessory,
  onUpdateAccessoryTransform,
  gizmoMode = 'mover',
  activeAction = null,
  onActionComplete,
  isPositionLocked = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const pedestalGroupRef = useRef<THREE.Group | null>(null);
  const isolatedGroupRef = useRef<THREE.Group | null>(null);
  const accessoryGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const transformControlsRef = useRef<TransformControls | null>(null);
  const isTransformDraggingRef = useRef(false);

  // Mouse interaction
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const internalRotationRef = useRef(fineAdjustments.rotationY);

  // 3D Animation Mixer & Clock for playing GLTF pose animations
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());

  const selectedAccessoryIdRef = useRef(selectedAccessoryId);
  selectedAccessoryIdRef.current = selectedAccessoryId;

  const onUpdateAccessoryTransformRef = useRef(onUpdateAccessoryTransform);
  onUpdateAccessoryTransformRef.current = onUpdateAccessoryTransform;

  const gizmoModeRef = useRef(gizmoMode);
  gizmoModeRef.current = gizmoMode;

  const activeActionRef = useRef(activeAction);
  activeActionRef.current = activeAction;
  const onActionCompleteRef = useRef(onActionComplete);
  onActionCompleteRef.current = onActionComplete;
  const actionStartRef = useRef<{ actionId: string | null; startedAt: number; completed: boolean }>({
    actionId: null,
    startedAt: 0,
    completed: false,
  });

  useEffect(() => {
    internalRotationRef.current = fineAdjustments.rotationY;
  }, [fineAdjustments.rotationY]);

  // Update TransformControls Gizmo mode
  useEffect(() => {
    if (transformControlsRef.current) {
      const mode = gizmoMode === 'rodar' ? 'rotate' : gizmoMode === 'escalar' ? 'scale' : 'translate';
      transformControlsRef.current.setMode(mode);
    }
  }, [gizmoMode]);

  // Main Scene & Renderer Initialization
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 650;

    // Scene setup with dark studio luxury backdrop
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b0e);
    sceneRef.current = scene;

    // Camera setup with safe near/far to prevent any clipping/disappearing
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.01, 1000);
    camera.position.set(0, 1.45, 4.2);
    camera.lookAt(0, 1.05, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    if (onRegisterSnapshotTaker) {
      onRegisterSnapshotTaker(() => {
        try {
          if (!rendererRef.current) return null;
          return rendererRef.current.domElement.toDataURL('image/png');
        } catch (err) {
          console.error('Failed to capture snapshot from WebGL canvas:', err);
          return null;
        }
      });
    }

    // Lighting (Dark Studio Lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.6);
    keyLight.position.set(2.5, 4.5, 3.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 15;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xddeeff, 1.1);
    rimLight.position.set(-2.5, 3.2, -2.8);
    scene.add(rimLight);

    const goldAccentLight = new THREE.PointLight(0xc5a059, 1.8, 5.0);
    goldAccentLight.position.set(0, 0.05, 0);
    scene.add(goldAccentLight);

    // PEDESTAL (Black Obsidian Cylindrical Podium)
    const pedestalGroup = new THREE.Group();
    pedestalGroupRef.current = pedestalGroup;

    const discGeo = new THREE.CylinderGeometry(1.28, 1.32, 0.12, 64);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x14151a,
      roughness: 0.22,
      metalness: 0.65,
    });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.position.y = 0.06;
    discMesh.receiveShadow = true;
    pedestalGroup.add(discMesh);

    const goldRingGeo = new THREE.TorusGeometry(1.30, 0.022, 16, 64);
    const goldRingMat = new THREE.MeshStandardMaterial({
      color: 0xc5a059,
      roughness: 0.28,
      metalness: 0.9,
    });
    const goldRing = new THREE.Mesh(goldRingGeo, goldRingMat);
    goldRing.rotation.x = Math.PI / 2;
    goldRing.position.y = 0.12;
    pedestalGroup.add(goldRing);

    const baseGeo = new THREE.CylinderGeometry(1.42, 1.48, 0.06, 64);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0d0e12,
      roughness: 0.45,
      metalness: 0.4,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.01;
    baseMesh.receiveShadow = true;
    pedestalGroup.add(baseMesh);

    const floorGeo = new THREE.CircleGeometry(2.2, 48);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x050608,
      transparent: true,
      opacity: 0.85,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.042;
    pedestalGroup.add(floorMesh);

    scene.add(pedestalGroup);

    // GROUPS
    const avatarGroup = new THREE.Group();
    avatarGroupRef.current = avatarGroup;
    scene.add(avatarGroup);

    const isolatedGroup = new THREE.Group();
    isolatedGroupRef.current = isolatedGroup;
    scene.add(isolatedGroup);

    // TransformControls Gizmo for positioning accessories on the avatar
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.size = 0.75;
    scene.add(transformControls.getHelper());
    transformControlsRef.current = transformControls;

    transformControls.addEventListener('dragging-changed', (event: any) => {
      isTransformDraggingRef.current = Boolean(event.value);
      if (event.value) {
        isDraggingRef.current = false;
      }
    });

    transformControls.addEventListener('change', () => {
      if (isTransformDraggingRef.current && selectedAccessoryIdRef.current) {
        const accId = selectedAccessoryIdRef.current;
        const targetGroup = accessoryGroupsRef.current.get(accId);
        if (targetGroup && onUpdateAccessoryTransformRef.current) {
          const pos: [number, number, number] = [
            parseFloat(targetGroup.position.x.toFixed(3)),
            parseFloat(targetGroup.position.y.toFixed(3)),
            parseFloat(targetGroup.position.z.toFixed(3)),
          ];
          const rot: [number, number, number] = [
            parseFloat(targetGroup.rotation.x.toFixed(3)),
            parseFloat(targetGroup.rotation.y.toFixed(3)),
            parseFloat(targetGroup.rotation.z.toFixed(3)),
          ];
          const scl: [number, number, number] = [
            parseFloat(targetGroup.scale.x.toFixed(3)),
            parseFloat(targetGroup.scale.y.toFixed(3)),
            parseFloat(targetGroup.scale.z.toFixed(3)),
          ];
          onUpdateAccessoryTransformRef.current(accId, {
            position: pos,
            rotation: rot,
            scale: scl,
          });
        }
      }
    });

    // Resize Handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop with Action Trajectory Simulation
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const time = performance.now() * 0.001;
      const delta = clockRef.current.getDelta();
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      if (avatarGroupRef.current) {
        avatarGroupRef.current.rotation.y = internalRotationRef.current;
        avatarGroupRef.current.position.set(
          fineAdjustments.panX,
          PEDESTAL_SURFACE_Y + PEDESTAL_OBJECT_CLEARANCE + fineAdjustments.elevationY,
          fineAdjustments.panY
        );
        const s = fineAdjustments.scale;
        avatarGroupRef.current.scale.set(s, s, s);
      }

      // If viewing isolated item on the pedestal, rotate slowly
      if (isolatedGroupRef.current && isolatedGroupRef.current.children.length > 0) {
        isolatedGroupRef.current.rotation.y = internalRotationRef.current + time * 0.15;
      }

      // Action Animation execution on the active accessory or inspected object
      const currAction = activeActionRef.current;
      if (currAction && currAction.motion && !isTransformDraggingRef.current) {
        const cfg = currAction.motion;
        if (actionStartRef.current.actionId !== currAction.id) {
          actionStartRef.current = { actionId: currAction.id, startedAt: time, completed: false };
        }
        const elapsed = time - actionStartRef.current.startedAt;
        const durationComplete =
          cfg.durationSeconds !== undefined && elapsed >= cfg.durationSeconds;
        const factor = durationComplete
          ? 0
          : getActionMotionFactor(cfg, elapsed);
        if (durationComplete && !actionStartRef.current.completed) {
          actionStartRef.current.completed = true;
          onActionCompleteRef.current?.(currAction.id);
        }

        let posX = (cfg.deltaPosition?.[0] || 0) * factor;
        let posY = (cfg.deltaPosition?.[1] || 0) * factor;
        let posZ = (cfg.deltaPosition?.[2] || 0) * factor;

        // Mirrors the editor's motion math (CreatorEditorCanvas3D) so store preview == editor test
        const traj = cfg.curveTrajectory || 'linear';
        if (traj === 'arc') {
          const h = cfg.curveHeight !== undefined ? cfg.curveHeight : 2.0;
          posY += 4 * h * factor * (1 - factor);
        } else if (traj === 'circle_turn') {
          const turnDeg = cfg.turnAngle !== undefined ? cfg.turnAngle : 360;
          const rad = THREE.MathUtils.degToRad(turnDeg * factor);
          const radius = cfg.curveRadius !== undefined ? cfg.curveRadius : 2.0;
          posX += radius * Math.sin(rad);
          posZ += radius * (1 - Math.cos(rad));
        } else if (traj === 'spiral') {
          const turnDeg = cfg.turnAngle !== undefined ? cfg.turnAngle : 360;
          const rad = THREE.MathUtils.degToRad(turnDeg * factor);
          const radius = cfg.curveRadius !== undefined ? cfg.curveRadius : 1.5;
          posX += radius * Math.cos(rad) - radius;
          posZ += radius * Math.sin(rad);
        } else if (traj === 'wave') {
          posY += Math.sin(factor * Math.PI * 4) * 0.35;
        }

        const rx = THREE.MathUtils.degToRad((cfg.deltaRotation?.[0] || 0) * factor);
        const ry = THREE.MathUtils.degToRad((cfg.deltaRotation?.[1] || 0) * factor);
        const rz = THREE.MathUtils.degToRad((cfg.deltaRotation?.[2] || 0) * factor);

        const scaleVal = cfg.scaleFactor !== undefined
          ? 1.0 + factor * (cfg.scaleFactor - 1.0)
          : 1.0;

        // Apply action trajectory to selected accessory
        if (selectedAccessoryIdRef.current) {
          const accGroup = accessoryGroupsRef.current.get(selectedAccessoryIdRef.current);
          if (accGroup && (accGroup as any)._baseTransform) {
            const bt = (accGroup as any)._baseTransform;
            accGroup.position.set(
              bt.position[0] + posX,
              bt.position[1] + posY,
              bt.position[2] + posZ
            );
            accGroup.rotation.set(
              bt.rotation[0] + rx,
              bt.rotation[1] + ry,
              bt.rotation[2] + rz
            );
            accGroup.scale.set(
              bt.scale[0] * scaleVal,
              bt.scale[1] * scaleVal,
              bt.scale[2] * scaleVal
            );
          }
        } else {
          const isolatedItem = isolatedGroupRef.current?.children[0];
          const baseTransform = isolatedItem?.userData.baseTransform;
          if (isolatedItem && baseTransform) {
            isolatedItem.position.set(
              baseTransform.position[0] + posX,
              baseTransform.position[1] + posY,
              baseTransform.position[2] + posZ
            );
            isolatedItem.rotation.set(
              baseTransform.rotation[0] + rx,
              baseTransform.rotation[1] + ry,
              baseTransform.rotation[2] + rz
            );
            isolatedItem.scale.set(
              baseTransform.scale[0] * scaleVal,
              baseTransform.scale[1] * scaleVal,
              baseTransform.scale[2] * scaleVal
            );
            alignObjectBottomToY(isolatedItem, PEDESTAL_SURFACE_Y + PEDESTAL_OBJECT_CLEARANCE);
          } else if (avatarGroupRef.current) {
            const avatarScale = fineAdjustments.scale * scaleVal;
            avatarGroupRef.current.position.set(
              fineAdjustments.panX + posX,
              PEDESTAL_SURFACE_Y + PEDESTAL_OBJECT_CLEARANCE + fineAdjustments.elevationY + posY,
              fineAdjustments.panY + posZ
            );
            avatarGroupRef.current.rotation.set(rx, internalRotationRef.current + ry, rz);
            avatarGroupRef.current.scale.set(avatarScale, avatarScale, avatarScale);
          }
        }
      } else if (!currAction) {
        actionStartRef.current.actionId = null;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Mouse Drag for Orbit Rotation
    const onMouseDown = (e: MouseEvent) => {
      if (isTransformDraggingRef.current) return;
      if (transformControlsRef.current && transformControlsRef.current.axis !== null) {
        return;
      }
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || isTransformDraggingRef.current) return;
      const deltaX = e.clientX - prevMouseRef.current.x;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      const newRot = internalRotationRef.current + deltaX * 0.012;
      internalRotationRef.current = newRot;
      if (onUpdateRotation) {
        onUpdateRotation(newRot);
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      cameraRef.current.position.z = THREE.MathUtils.clamp(
        cameraRef.current.position.z + e.deltaY * 0.003,
        2.0,
        7.0
      );
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      if (container.contains(dom)) {
        container.removeChild(dom);
      }
      renderer.dispose();
    };
  }, []);

  // UPDATE SCENE: Either ISOLATED ITEM or AVATAR WITH ACCESSORIES
  useEffect(() => {
    const avatarGroup = avatarGroupRef.current;
    const isolatedGroup = isolatedGroupRef.current;
    const transformControls = transformControlsRef.current;
    if (!avatarGroup || !isolatedGroup) return;
    let cancelled = false;

    // Detach Gizmo while rebuilding
    if (transformControls) transformControls.detach();

    // Clear previous children cleanly
    while (avatarGroup.children.length > 0) {
      avatarGroup.remove(avatarGroup.children[0]);
    }
    while (isolatedGroup.children.length > 0) {
      isolatedGroup.remove(isolatedGroup.children[0]);
    }
    accessoryGroupsRef.current.clear();

    // Helper to synchronize Gizmo attachment
    const syncGizmo = () => {
      const tc = transformControlsRef.current;
      if (!tc) return;

      if (isPositionLocked) {
        tc.detach();
        if (tc.getHelper()) tc.getHelper().visible = false;
        return;
      }

      if (selectedAccessoryId) {
        const accGroup = accessoryGroupsRef.current.get(selectedAccessoryId);
        if (accGroup) {
          accGroup.updateMatrixWorld(true);
          tc.attach(accGroup);
          tc.enabled = true;
          const mode = gizmoMode === 'rodar' ? 'rotate' : gizmoMode === 'escalar' ? 'scale' : 'translate';
          tc.setMode(mode);
          tc.size = 0.85;
          if (tc.getHelper()) tc.getHelper().visible = true;
          return;
        }
      } else if (selectedItemToInspect && isolatedGroupRef.current && isolatedGroupRef.current.children.length > 0) {
        const target = isolatedGroupRef.current.children[0];
        if (target) {
          target.updateMatrixWorld(true);
          tc.attach(target);
          tc.enabled = true;
          const mode = gizmoMode === 'rodar' ? 'rotate' : gizmoMode === 'escalar' ? 'scale' : 'translate';
          tc.setMode(mode);
          tc.size = 0.85;
          if (tc.getHelper()) tc.getHelper().visible = true;
          return;
        }
      }

      tc.detach();
      if (tc.getHelper()) tc.getHelper().visible = false;
    };

    // CASE 1: ISOLATED ITEM INSPECTION
    const isIsolatedItem =
      selectedItemToInspect &&
      !selectedItemToInspect.isAccessory &&
      selectedItemToInspect.category !== 'acessorios' &&
      !selectedItemToInspect.isAvatar &&
      selectedItemToInspect.category !== 'avatares';

    if (isIsolatedItem) {
      avatarGroup.visible = false;
      isolatedGroup.visible = true;

      const itemAssetUuid = extractAssetUuid(
        (selectedItemToInspect as any).assetId ||
        selectedItemToInspect.originalItemId ||
        selectedItemToInspect.id ||
        selectedItemToInspect.fileBlobUrl
      );

      const hasAnyLocalRef = !!(selectedItemToInspect.fileBlobUrl || selectedItemToInspect.originalItemId || selectedItemToInspect.id);
      if (!itemAssetUuid && !hasAnyLocalRef) {
        syncGizmo();
        return () => {
          cancelled = true;
        };
      }

      loadGlbWithIndexedDBFallback(
        selectedItemToInspect.fileBlobUrl,
        selectedItemToInspect.id,
        selectedItemToInspect.originalItemId,
        (gltf) => {
          if (cancelled) return;
          const m = gltf.scene;
          const box = new THREE.Box3().setFromObject(m);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.1);
          const s = 1.3 / maxDim;
          m.scale.set(s, s, s);

          const scaledBox = new THREE.Box3().setFromObject(m);
          const center = scaledBox.getCenter(new THREE.Vector3());
          m.position.x = -center.x;
          m.position.z = -center.z;
          m.position.y = PEDESTAL_SURFACE_Y + PEDESTAL_OBJECT_CLEARANCE - scaledBox.min.y;

          m.traverse((node: any) => {
            if ((node as THREE.Mesh).isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
              node.frustumCulled = false;
            }
          });
          m.userData.baseTransform = {
            position: m.position.toArray(),
            rotation: m.rotation.toArray(),
            scale: m.scale.toArray(),
          };
          isolatedGroup.add(m);
          syncGizmo();
        },
        () => {
          if (cancelled) return;
          console.warn(`Não foi possível carregar o asset do item "${selectedItemToInspect.name}".`);
          syncGizmo();
        },
        itemAssetUuid || undefined
      );
      return () => {
        cancelled = true;
      };
    }

    // CASE 2: AVATAR VIEW WITH EQUIPPED ACCESSORIES
    avatarGroup.visible = true;
    isolatedGroup.visible = false;

    // Helper to attach accessories to avatar
    const attachAccessories = (root: THREE.Group) => {
      const accessoriesMap = new Map<string, CustomizationItem>();
      equippedItems.forEach((i) => {
        if (i.isAccessory || i.category === 'acessorios' || i.equipped || i.id === selectedAccessoryId) {
          accessoriesMap.set(i.id, i);
        }
      });
      if (selectedAccessoryItem) {
        accessoriesMap.set(selectedAccessoryItem.id, selectedAccessoryItem);
      }
      const accessories = Array.from(accessoriesMap.values());

      accessories.forEach((acc) => {
        const accGroup = new THREE.Group();
        const baseTrans: AccessoryTransform = acc.accessoryTransform || {
          position: getDefaultAttachmentOffset(acc.accessoryAttachment),
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        };

        accGroup.position.set(...baseTrans.position);
        accGroup.rotation.set(...baseTrans.rotation);
        accGroup.scale.set(...baseTrans.scale);
        (accGroup as any)._baseTransform = baseTrans;
        (accGroup as any).userData = { accessoryId: acc.id };

        accessoryGroupsRef.current.set(acc.id, accGroup);
        root.add(accGroup);

        const accAssetUuid = extractAssetUuid((acc as any).assetId || acc.originalItemId || acc.id || acc.fileBlobUrl);

        loadGlbWithIndexedDBFallback(
          acc.fileBlobUrl,
          acc.id,
          acc.originalItemId,
          (gltf) => {
            if (cancelled) return;

            const m = gltf.scene;
            const box = new THREE.Box3().setFromObject(m);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 0.05);
            const s = 0.45 / maxDim;
            m.scale.set(s, s, s);

            m.traverse((n: any) => {
              if ((n as THREE.Mesh).isMesh) {
                n.castShadow = true;
                n.receiveShadow = true;
                n.frustumCulled = false;
              }
            });
            accGroup.add(m);
            syncGizmo();
          },
          () => {
            if (cancelled) return;
            console.warn(`Não foi possível carregar o asset do acessório "${acc.name}".`);
            syncGizmo();
          },
          accAssetUuid || undefined
        );
      });
    };

    const effectiveAvatarAssetId = extractAssetUuid(
      avatarAssetId ||
      avatarModelUrl
    );
    const effectivePoseAssetId = extractAssetUuid(posePreviewAssetId || posePreviewUrl);

    if (effectivePoseAssetId || posePreviewUrl) {
      const previewName = posePreviewName || currentPose || 'Pose 3D';
      loadGlbWithIndexedDBFallback(
        posePreviewUrl,
        effectivePoseAssetId || undefined,
        effectivePoseAssetId || undefined,
        (gltf) => {
          if (cancelled) return;
          const poseModel = gltf.scene;
          const bounds = new THREE.Box3().setFromObject(poseModel);
          const size = bounds.getSize(new THREE.Vector3());
          const scale = 1.75 / Math.max(0.1, size.y);
          poseModel.scale.setScalar(scale);

          const scaledBounds = new THREE.Box3().setFromObject(poseModel);
          const center = scaledBounds.getCenter(new THREE.Vector3());
          poseModel.position.set(
            -center.x,
            PEDESTAL_SURFACE_Y - scaledBounds.min.y,
            -center.z
          );
          poseModel.traverse((node: THREE.Object3D) => {
            if (node instanceof THREE.Mesh) {
              node.castShadow = true;
              node.receiveShadow = true;
              node.frustumCulled = false;
            }
          });

          if (gltf.animations?.length) {
            const mixer = new THREE.AnimationMixer(poseModel);
            mixerRef.current = mixer;
            mixer.clipAction(gltf.animations[0]).reset().fadeIn(0.2).play();
          }
          avatarGroup.add(poseModel);
          attachAccessories(avatarGroup);
        },
        () => {
          if (cancelled) return;
          console.warn(`Não foi possível carregar o asset da pose "${previewName}".`);
        },
        effectivePoseAssetId || undefined
      );
      return () => {
        cancelled = true;
      };
    }

    const isSystemDefaultAvatar =
      !avatarAssetId &&
      !avatarModelUrl &&
      (!avatarName || avatarName.toLowerCase().includes('luzenne') || avatarName.toLowerCase().includes('default'));

    // Se o avatar está explicitamente sem asset_id ou com arquivo ausente, não finge manequim calado!
    if (isAvatarMissingAsset || (!effectiveAvatarAssetId && !avatarModelUrl && !isSystemDefaultAvatar)) {
      return () => {
        cancelled = true;
      };
    }

    if (effectiveAvatarAssetId || avatarModelUrl) {
      loadGlbWithIndexedDBFallback(
        avatarModelUrl,
        effectiveAvatarAssetId || undefined,
        effectiveAvatarAssetId || undefined,
        (gltf) => {
          if (cancelled) return;
          const customModel = gltf.scene;
          const box = new THREE.Box3().setFromObject(customModel);
          const size = box.getSize(new THREE.Vector3());
          const targetHeight = 1.75;
          const s = targetHeight / Math.max(0.1, size.y);
          customModel.scale.set(s, s, s);

          const scaledBox = new THREE.Box3().setFromObject(customModel);
          const center = scaledBox.getCenter(new THREE.Vector3());
          customModel.position.x = -center.x;
          customModel.position.z = -center.z;
          customModel.position.y = PEDESTAL_SURFACE_Y - scaledBox.min.y;

          // 1. Play animation from GLTF if animations are present
          if (mixerRef.current) {
            mixerRef.current.stopAllAction();
            mixerRef.current = null;
          }

          const poseLower = (currentPose || '').toLowerCase().trim();

          if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(customModel);
            mixerRef.current = mixer;
            let clip = gltf.animations.find((c: any) =>
              c.name.toLowerCase().includes(poseLower) ||
              poseLower.includes(c.name.toLowerCase())
            );
            if (!clip) {
              const matchNum = poseLower.match(/\d+/);
              if (matchNum) {
                const idx = (parseInt(matchNum[0], 10) - 1) % gltf.animations.length;
                clip = gltf.animations[idx];
              }
            }
            if (!clip) {
              clip = gltf.animations[0];
            }
            if (clip) {
              const action = mixer.clipAction(clip);
              action.reset().fadeIn(0.2).play();
            }
          }

          // 2. Identify skeletal bones for humanoid rigged avatars
          const bones: Record<string, THREE.Bone> = {};
          customModel.traverse((node: any) => {
            if (node.isBone) {
              const bName = node.name.toLowerCase();
              if (bName.includes('head')) bones.head = node;
              else if (bName.includes('neck')) bones.neck = node;
              else if (bName.includes('spine')) bones.spine = node;
              else if (bName.includes('hips') || bName.includes('pelvis')) bones.hips = node;
              else if (bName.includes('leftarm') || bName.includes('leftupperarm') || bName.includes('arm_l') || bName.includes('upper_arm.l')) bones.leftArm = node;
              else if (bName.includes('rightarm') || bName.includes('rightupperarm') || bName.includes('arm_r') || bName.includes('upper_arm.r')) bones.rightArm = node;
              else if (bName.includes('leftforearm') || bName.includes('forearm_l')) bones.leftForeArm = node;
              else if (bName.includes('rightforearm') || bName.includes('forearm_r')) bones.rightForeArm = node;
              else if (bName.includes('leftupleg') || bName.includes('leftleg') || bName.includes('thigh_l')) bones.leftLeg = node;
              else if (bName.includes('rightupleg') || bName.includes('rightleg') || bName.includes('thigh_r')) bones.rightLeg = node;
            }
          });

          // 3. Apply posture & bone adjustments according to currentPose
          if (poseLower.includes('sentar') || poseLower.includes('sit')) {
            customModel.position.y -= 0.38;
            if (bones.hips) bones.hips.position.y -= 0.3;
            if (bones.leftLeg) bones.leftLeg.rotation.x = -Math.PI / 2.2;
            if (bones.rightLeg) bones.rightLeg.rotation.x = -Math.PI / 2.2;
          } else if (poseLower.includes('deitar') || poseLower.includes('reclinad') || poseLower.includes('lay')) {
            customModel.rotation.x = -Math.PI / 4.2;
            customModel.position.y -= 0.25;
            customModel.position.z -= 0.2;
          } else if (poseLower.includes('acenar') || poseLower.includes('wave')) {
            customModel.rotation.z = -0.06;
            customModel.rotation.y = 0.14;
            if (bones.rightArm) bones.rightArm.rotation.z = -1.9;
            if (bones.rightForeArm) bones.rightForeArm.rotation.z = -0.7;
            if (bones.head) bones.head.rotation.y = 0.2;
          } else if (poseLower.includes('rindo') || poseLower.includes('laugh')) {
            customModel.rotation.x = 0.12;
            customModel.rotation.z = -0.04;
            if (bones.spine) bones.spine.rotation.x = -0.15;
            if (bones.head) bones.head.rotation.x = -0.22;
          } else if (
            poseLower.includes('modelo') ||
            poseLower.includes('noir') ||
            poseLower.includes('gala') ||
            poseLower.includes('pose 1') ||
            poseLower.includes('pose_1') ||
            poseLower.includes('avatar pose 1') ||
            poseLower.includes('avatar1')
          ) {
            customModel.rotation.y = 0.26;
            customModel.rotation.z = 0.04;
            if (bones.spine) bones.spine.rotation.y = 0.12;
            if (bones.head) { bones.head.rotation.y = 0.18; bones.head.rotation.z = 0.06; }
            if (bones.leftArm) bones.leftArm.rotation.z = 0.28;
            if (bones.rightArm) { bones.rightArm.rotation.z = -0.38; bones.rightArm.rotation.x = -0.15; }
          } else if (poseLower.includes('pose 2') || poseLower.includes('pose_2') || poseLower.includes('avatar2')) {
            customModel.rotation.y = -0.28;
            customModel.rotation.z = -0.03;
            if (bones.head) bones.head.rotation.y = -0.18;
            if (bones.rightArm) bones.rightArm.rotation.z = -0.3;
            if (bones.leftArm) bones.leftArm.rotation.z = 0.45;
          } else if (poseLower.includes('cruz') || poseLower.includes('braço') || poseLower.includes('cross')) {
            customModel.rotation.y = 0.1;
            if (bones.leftArm) { bones.leftArm.rotation.y = 0.7; bones.leftArm.rotation.z = 0.4; }
            if (bones.rightArm) { bones.rightArm.rotation.y = -0.7; bones.rightArm.rotation.z = -0.4; }
          } else if (poseLower && !poseLower.includes('em pé') && !poseLower.includes('padrao') && !poseLower.includes('default')) {
            // Stylized stance variation for custom poses so every pose shows visible change
            let hash = 0;
            for (let i = 0; i < poseLower.length; i++) {
              hash = (hash * 31 + poseLower.charCodeAt(i)) & 0xffffff;
            }
            const stanceRotY = ((hash % 100) / 100) * 0.45 - 0.22;
            const stanceTiltZ = (((hash >> 8) % 100) / 100) * 0.08 - 0.04;
            const stanceTiltX = (((hash >> 16) % 100) / 100) * 0.06 - 0.03;
            customModel.rotation.y += stanceRotY;
            customModel.rotation.z += stanceTiltZ;
            customModel.rotation.x += stanceTiltX;
            if (bones.head) bones.head.rotation.y = -stanceRotY * 0.6;
            if (bones.leftArm) bones.leftArm.rotation.z = 0.22 + stanceRotY * 0.3;
            if (bones.rightArm) bones.rightArm.rotation.z = -0.22 - stanceRotY * 0.3;
          }

          alignObjectBottomToY(customModel, 0);

          customModel.traverse((node: any) => {
            if ((node as THREE.Mesh).isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
              node.frustumCulled = false; // Prevent mesh disappearing!
            }
          });

          avatarGroup.add(customModel);
          attachAccessories(avatarGroup);
        },
        () => {
          if (cancelled) return;
          console.warn(`Não foi possível carregar o asset do avatar "${avatarName}".`);
        },
        effectiveAvatarAssetId || undefined
      );
      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
    };
  }, [
    currentPose,
    equippedItems,
    avatarModelUrl,
    avatarAssetId,
    isAvatarMissingAsset,
    avatarName,
    posePreviewUrl,
    posePreviewAssetId,
    posePreviewName,
    selectedItemToInspect,
    selectedAccessoryId,
    selectedAccessoryItem,
    isPositionLocked,
    gizmoMode,
  ]);

  // Synchronize TransformControls attachment whenever selection or gizmo mode changes
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;

    if (isPositionLocked) {
      tc.detach();
      if (tc.getHelper()) tc.getHelper().visible = false;
      return;
    }

    if (selectedAccessoryId) {
      const accGroup = accessoryGroupsRef.current.get(selectedAccessoryId);
      if (accGroup) {
        accGroup.updateMatrixWorld(true);
        if (tc.object !== accGroup) {
          tc.attach(accGroup);
        }
        tc.enabled = true;
        const mode = gizmoMode === 'rodar' ? 'rotate' : gizmoMode === 'escalar' ? 'scale' : 'translate';
        tc.setMode(mode);
        tc.size = 0.95;
        if (tc.getHelper()) tc.getHelper().visible = true;
        return;
      }
    } else if (selectedItemToInspect && isolatedGroupRef.current && isolatedGroupRef.current.children.length > 0) {
      const target = isolatedGroupRef.current.children[0];
      if (target) {
        target.updateMatrixWorld(true);
        if (tc.object !== target) {
          tc.attach(target);
        }
        tc.enabled = true;
        const mode = gizmoMode === 'rodar' ? 'rotate' : gizmoMode === 'escalar' ? 'scale' : 'translate';
        tc.setMode(mode);
        tc.size = 0.95;
        if (tc.getHelper()) tc.getHelper().visible = true;
        return;
      }
    }

    tc.detach();
    if (tc.getHelper()) tc.getHelper().visible = false;
  }, [selectedAccessoryId, selectedAccessoryItem, selectedItemToInspect, isPositionLocked, gizmoMode, equippedItems]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[460px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none overflow-hidden"
    >
      {/* 3D Drag Hint */}
      <div className="absolute top-4 right-4 pointer-events-none text-[11px] text-zinc-400 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10 flex items-center gap-1.5">
        <span>Girar 360°</span>
        {selectedAccessoryId && !isPositionLocked && (
          <span className="text-[#ffd700] font-bold">| Gizmo Acessório Ativo</span>
        )}
        {isPositionLocked && (
          <span className="text-emerald-400 font-bold">| Posição Travada 🔒</span>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// HELPER PROCEDURAL 3D MESH GENERATORS
// ============================================================================

function getDefaultAttachmentOffset(attachment?: string): [number, number, number] {
  switch (attachment) {
    case 'head':
      return [0, 1.72, 0];
    case 'chest':
      return [0, 1.35, 0.12];
    case 'left_hand':
      return [-0.26, 0.88, 0];
    case 'right_hand':
      return [0.26, 0.88, 0];
    case 'back':
      return [0, 1.35, -0.16];
    case 'companion_float':
    default:
      // Orbiting / floating companion drone next to avatar shoulder
      return [0.52, 1.48, 0.25];
  }
}
