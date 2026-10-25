import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Activity, Download, FileUp, LoaderCircle, MessageCircle, RotateCcw, Save, Send, X } from 'lucide-react';
import type { StoreAvatar } from '../types';
import { resolveAssetDownloadUrl } from '../lib/assetSyncClient';
import { supabase } from '../lib/supabase';

export type BoneRotationMap = Record<string, [number, number, number]>;

interface PoseChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface BonePoseEditorProps {
  avatar: StoreAvatar;
  onClose: () => void;
  onSave: (name: string, boneRotations: BoneRotationMap) => void;
}

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => material.dispose());
  });
};

const inferAnatomicalRole = (name: string): string | null => {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const side = normalized.includes('left')
    ? 'left'
    : normalized.includes('right')
      ? 'right'
      : null;
  const role = normalized.includes('head')
    ? 'head'
    : normalized.includes('neck')
      ? 'neck'
      : normalized.includes('pelvis') || normalized.includes('hips')
        ? 'pelvis'
        : normalized.includes('upperchest') || normalized.includes('chest')
          ? 'chest'
          : normalized.includes('spine')
            ? 'spine'
            : normalized.includes('clavicle') || normalized.includes('shoulder')
              ? 'shoulder'
              : normalized.includes('forearm') || normalized.includes('lowerarm')
                ? 'forearm'
                : normalized.includes('upperarm') || normalized.endsWith('arm')
                  ? 'upper_arm'
                  : normalized.includes('hand')
                    ? 'hand'
                    : normalized.includes('upleg') || normalized.includes('thigh')
                      ? 'thigh'
                      : normalized.includes('calf') ||
                          normalized.includes('shin') ||
                          normalized.includes('lowerleg') ||
                          normalized.endsWith('leg')
                        ? 'lower_leg'
                        : normalized.includes('foot')
                          ? 'foot'
                          : normalized.includes('toe')
                            ? 'toe'
                            : null;
  return role ? (side ? `${side}_${role}` : role) : null;
};

const vectorObject = (vector: THREE.Vector3) => ({
  x: Number(vector.x.toFixed(6)),
  y: Number(vector.y.toFixed(6)),
  z: Number(vector.z.toFixed(6)),
});

const quaternionArray = (quaternion: THREE.Quaternion) => [
  Number(quaternion.x.toFixed(6)),
  Number(quaternion.y.toFixed(6)),
  Number(quaternion.z.toFixed(6)),
  Number(quaternion.w.toFixed(6)),
];

export const BonePoseEditor: React.FC<BonePoseEditorProps> = ({ avatar, onClose, onSave }) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const poseFileInputRef = useRef<HTMLInputElement>(null);
  const previewCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const bonesRef = useRef<Map<string, THREE.Bone>>(new Map());
  const modelRef = useRef<THREE.Group | null>(null);
  const initialRotationsRef = useRef<Map<string, [number, number, number]>>(new Map());
  const [boneNames, setBoneNames] = useState<string[]>([]);
  const [selectedBone, setSelectedBone] = useState('');
  const [rotations, setRotations] = useState<BoneRotationMap>({});
  const [editedBones, setEditedBones] = useState<Set<string>>(new Set());
  const [poseName, setPoseName] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posePrompt, setPosePrompt] = useState('');
  const [poseChatMessages, setPoseChatMessages] = useState<PoseChatMessage[]>([]);
  const [isGeneratingPose, setIsGeneratingPose] = useState(false);
  const [poseAiError, setPoseAiError] = useState('');
  const [pendingImportedPose, setPendingImportedPose] = useState<BoneRotationMap | null>(null);
  const [pendingImportedPoseName, setPendingImportedPoseName] = useState('');
  const selectedRotation = rotations[selectedBone] || [0, 0, 0];

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    let cancelled = false;
    let frameId = 0;
    let model: THREE.Group | null = null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101116');
    scene.add(new THREE.HemisphereLight(0xe7edff, 0x302b36, 2));
    const keyLight = new THREE.DirectionalLight(0xffe0a0, 3);
    keyLight.position.set(-3, 6, 4);
    scene.add(keyLight);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const controls = new OrbitControls(camera, container);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 8;
    controls.minPolarAngle = 0.04;
    controls.maxPolarAngle = Math.PI - 0.04;
    camera.position.set(0, 1.1, 4.4);
    controls.update();
    previewCameraRef.current = camera;
    orbitControlsRef.current = controls;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 420);
    container.appendChild(renderer.domElement);
    const floor = new THREE.GridHelper(6, 24, '#4b4431', '#282a32');
    floor.position.y = -0.01;
    scene.add(floor);

    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const loadModel = async () => {
      try {
        const assetId = avatar.assetId || avatar.originalItemId;
        const modelUrl = avatar.fileBlobUrl && /^(https?:|blob:)/i.test(avatar.fileBlobUrl)
          ? avatar.fileBlobUrl
          : assetId
            ? await resolveAssetDownloadUrl(assetId)
            : null;
        if (!modelUrl) throw new Error('Este avatar não tem um modelo 3D disponível.');
        const gltf = await new GLTFLoader().loadAsync(modelUrl);
        if (cancelled) {
          disposeObject(gltf.scene);
          return;
        }
        model = gltf.scene;
        modelRef.current = model;
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = 1.8 / Math.max(size.y, 0.1);
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
        const foundBones = new Map<string, THREE.Bone>();
        const initialRotations: BoneRotationMap = {};
        model.traverse((node) => {
          if (!(node instanceof THREE.Bone)) return;
          foundBones.set(node.name, node);
          const initialRotation: [number, number, number] = [
            THREE.MathUtils.radToDeg(node.rotation.x),
            THREE.MathUtils.radToDeg(node.rotation.y),
            THREE.MathUtils.radToDeg(node.rotation.z),
          ];
          initialRotations[node.name] = initialRotation;
        });
        if (!foundBones.size) throw new Error('Este avatar não possui bones. Use um avatar rigado para criar poses.');
        bonesRef.current = foundBones;
        initialRotationsRef.current = new Map(Object.entries(initialRotations));
        setBoneNames([...foundBones.keys()].sort((left, right) => left.localeCompare(right)));
        setSelectedBone([...foundBones.keys()][0]);
        setRotations(initialRotations);
        scene.add(model);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error('Falha ao carregar o avatar no editor de poses:', error);
        setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar o avatar.');
        setLoading(false);
      }
    };
    void loadModel();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      orbitControlsRef.current = null;
      previewCameraRef.current = null;
      if (model) {
        scene.remove(model);
        disposeObject(model);
      }
      renderer.dispose();
      renderer.domElement.remove();
      bonesRef.current.clear();
      modelRef.current = null;
      initialRotationsRef.current.clear();
    };
  }, [avatar.assetId, avatar.fileBlobUrl, avatar.originalItemId]);

  useEffect(() => {
    bonesRef.current.forEach((bone, name) => {
      const rotation = rotations[name];
      if (!rotation) return;
      bone.rotation.set(
        THREE.MathUtils.degToRad(rotation[0]),
        THREE.MathUtils.degToRad(rotation[1]),
        THREE.MathUtils.degToRad(rotation[2])
      );
    });
  }, [rotations]);

  const editedBoneList = useMemo(
    () => [...editedBones].filter((name) => boneNames.includes(name)),
    [boneNames, editedBones]
  );

  const setPreviewView = (view: 'front' | 'back' | 'side' | 'top' | 'reset') => {
    const camera = previewCameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;
    const target = controls.target;
    const distance = 4.4;
    if (view === 'reset') {
      camera.position.set(0, 1.1, distance);
    } else if (view === 'front') {
      camera.position.set(target.x, target.y + 0.15, target.z + distance);
    } else if (view === 'back') {
      camera.position.set(target.x, target.y + 0.15, target.z - distance);
    } else if (view === 'side') {
      camera.position.set(target.x + distance, target.y + 0.15, target.z);
    } else {
      camera.position.set(target.x, target.y + distance, target.z + 0.01);
    }
    controls.update();
  };

  const updateRotation = (axis: 0 | 1 | 2, value: number) => {
    if (!selectedBone) return;
    setRotations((current) => {
      const next = [...(current[selectedBone] || [0, 0, 0])] as [number, number, number];
      next[axis] = value;
      return { ...current, [selectedBone]: next };
    });
    setEditedBones((current) => new Set(current).add(selectedBone));
  };

  const resetSelectedBone = () => {
    const bone = bonesRef.current.get(selectedBone);
    if (!bone) return;
    const initial = initialRotationsRef.current.get(selectedBone) || [0, 0, 0];
    setRotations((current) => ({ ...current, [selectedBone]: initial }));
    setEditedBones((current) => {
      const next = new Set(current);
      next.delete(selectedBone);
      return next;
    });
  };

  const handleDownloadRigData = () => {
    const bones = [...bonesRef.current.entries()];
    const currentQuaternions = new Map(
      bones.map(([name, bone]) => [name, bone.quaternion.clone()])
    );
    const restWorldTransforms = new Map<
      string,
      { position: THREE.Vector3; quaternion: THREE.Quaternion }
    >();
    try {
      bones.forEach(([name, bone]) => {
        const restRotation = initialRotationsRef.current.get(name) || [0, 0, 0];
        bone.rotation.set(
          THREE.MathUtils.degToRad(restRotation[0]),
          THREE.MathUtils.degToRad(restRotation[1]),
          THREE.MathUtils.degToRad(restRotation[2]),
          'XYZ'
        );
      });
      modelRef.current?.updateMatrixWorld(true);
      bones.forEach(([name, bone]) => {
        restWorldTransforms.set(name, {
          position: bone.getWorldPosition(new THREE.Vector3()),
          quaternion: bone.getWorldQuaternion(new THREE.Quaternion()),
        });
      });
    } finally {
      bones.forEach(([name, bone]) => {
        const quaternion = currentQuaternions.get(name);
        if (quaternion) bone.quaternion.copy(quaternion);
      });
      modelRef.current?.updateMatrixWorld(true);
    }

    const boneData = bones.map(([name, bone]) => {
      const restRotation = initialRotationsRef.current.get(name) || [0, 0, 0];
      const currentRotation = rotations[name] || restRotation;
      const restWorld = restWorldTransforms.get(name);
      const currentWorldPosition = bone.getWorldPosition(new THREE.Vector3());
      const currentWorldQuaternion = bone.getWorldQuaternion(new THREE.Quaternion());
      const restLocalQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(restRotation[0]),
          THREE.MathUtils.degToRad(restRotation[1]),
          THREE.MathUtils.degToRad(restRotation[2]),
          'XYZ'
        )
      );
      return {
        name,
        anatomicalRole: inferAnatomicalRole(name),
        parent: bone.parent instanceof THREE.Bone ? bone.parent.name : null,
        restPose: {
          localPositionAssetUnits: vectorObject(bone.position),
          localRotationDegreesXYZ: restRotation,
          localQuaternionXYZW: quaternionArray(restLocalQuaternion),
          worldPositionPreviewUnits: restWorld ? vectorObject(restWorld.position) : null,
          worldQuaternionXYZW: restWorld ? quaternionArray(restWorld.quaternion) : null,
        },
        currentPreview: {
          localRotationDegreesXYZ: currentRotation,
          localQuaternionXYZW: quaternionArray(bone.quaternion),
          worldPositionPreviewUnits: vectorObject(currentWorldPosition),
          worldQuaternionXYZW: quaternionArray(currentWorldQuaternion),
        },
      };
    });
    const rigData = {
      format: 'social123-bone-rig',
      version: 2,
      avatar: { name: avatar.name },
      coordinateSystem: {
        localBonePositionUnits: 'source asset units',
        worldPositionUnits: 'normalized preview units; avatar height is approximately 1.8',
        modelUpAxis: '+Y',
        previewFrontDirection: '+Z',
        rotationMode: 'absolute_local_from_rest',
        angleUnit: 'degrees',
        rotationOrder: 'XYZ',
        rotationAxes: 'local axes of each bone',
      },
      poseRequest:
        'EDITE AQUI: descreva a pose desejada com relações e condições verificáveis. Exemplo: "sentado em uma cadeira imaginária; tronco ereto; quadris e joelhos flexionados; pés apoiados no chão; braços relaxados; mãos sobre as coxas; pose simétrica".',
      bones: boneData,
      instructions:
        'INSTRUCOES PARA A IA: Leia poseRequest e use restPose como referência. anatomicalRole é uma sugestão heurística baseada no nome do bone; se for null ou parecer incorreta, use nome, parent e transforms sem inventar semântica. Gere rotations com valores FINAIS absolutos de rotação local em graus XYZ, não deltas: cada vetor substitui a rotação local de repouso daquele bone. Inclua somente bones a alterar; todos os demais permanecem exatamente em repouso. Use apenas nomes exatos existentes em bones e ângulos entre -180 e 180. Consulte modelUpAxis e previewFrontDirection para interpretar posições mundiais; não confunda unidades locais do asset com unidades normalizadas da prévia. Devolva este mesmo JSON completo, preservando format, version, avatar, coordinateSystem, bones e instructions, e acrescente poseName, rotationMode, rotationOrder, angleUnit e rotations no nível principal. Não invente bones nem devolva texto ou Markdown fora do JSON.',
      poseOutputExample: {
        rotationMode: 'absolute_local_from_rest',
        rotationOrder: 'XYZ',
        angleUnit: 'degrees',
        poseName: 'Nome da pose',
        rotations: {
          'nome-exato-de-um-bone-existente': [0, 0, 0],
        },
      },
    };

    const blob = new Blob([JSON.stringify(rigData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${avatar.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'avatar'}-rig.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPoseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('O arquivo precisa conter um objeto JSON de pose.');
      }
      const data = parsed as {
        format?: unknown;
        version?: unknown;
        poseName?: unknown;
        name?: unknown;
        rotations?: unknown;
        boneRotations?: unknown;
        pose?: unknown;
      };
      const source = data.rotations ?? data.boneRotations ?? data.pose;
      const entries: Array<[string, unknown]> = Array.isArray(source)
        ? source.flatMap((entry): Array<[string, unknown]> => {
            if (!entry || typeof entry !== 'object') return [];
            const value = entry as {
              bone?: unknown;
              name?: unknown;
              rotation?: unknown;
              x?: unknown;
              y?: unknown;
              z?: unknown;
            };
            const name = typeof value.bone === 'string' ? value.bone : value.name;
            if (typeof name !== 'string') return [];
            const rotation = value.rotation ?? [value.x, value.y, value.z];
            return [[name, rotation]];
          })
        : source && typeof source === 'object'
          ? Object.entries(source)
          : [];

      if (!entries.length) {
        throw new Error('Não encontrei rotações no arquivo. Use "rotations" ou "boneRotations" com os nomes dos bones.');
      }

      const validRotations: BoneRotationMap = {};
      const unknownBones: string[] = [];
      const invalidBones: string[] = [];
      entries.forEach(([name, value]) => {
        if (!bonesRef.current.has(name)) {
          unknownBones.push(name);
          return;
        }
        const angles = Array.isArray(value)
          ? value
          : value && typeof value === 'object'
            ? [(value as { x?: unknown }).x, (value as { y?: unknown }).y, (value as { z?: unknown }).z]
            : [];
        if (
          angles.length !== 3 ||
          !angles.every(
            (angle) => typeof angle === 'number' && Number.isFinite(angle) && angle >= -180 && angle <= 180
          )
        ) {
          invalidBones.push(name);
          return;
        }
        validRotations[name] = [angles[0], angles[1], angles[2]];
      });
      if (unknownBones.length) {
        throw new Error(`O arquivo cita bones que não existem neste rig: ${unknownBones.slice(0, 5).join(', ')}.`);
      }
      if (invalidBones.length || !Object.keys(validRotations).length) {
        throw new Error('As rotações precisam conter três ângulos numéricos entre -180° e 180°.');
      }

      setPendingImportedPose(validRotations);
      const importedName =
        typeof data.poseName === 'string' ? data.poseName : typeof data.name === 'string' ? data.name : '';
      setPendingImportedPoseName(importedName.trim().slice(0, 48));
      setPoseAiError('');
      setPoseChatMessages((messages) => [
        ...messages,
        { role: 'assistant', text: `Pose "${importedName.trim() || file.name}" carregada. Clique em "Aplicar pose importada" para ver na prévia.` },
      ]);
    } catch (error) {
      setPoseAiError(error instanceof Error ? error.message : 'Não foi possível importar o arquivo de pose.');
    }
  };

  const applyImportedPose = () => {
    if (!pendingImportedPose) return;
    const nextRotations = Object.fromEntries(initialRotationsRef.current) as BoneRotationMap;
    Object.assign(nextRotations, pendingImportedPose);
    setRotations(nextRotations);
    setEditedBones(
      new Set(
        Object.entries(pendingImportedPose)
          .filter(([name, angles]) => {
            const initial = initialRotationsRef.current.get(name);
            return !initial || angles.some((angle, index) => Math.abs(angle - initial[index]) > 0.01);
          })
          .map(([name]) => name)
      )
    );
    if (pendingImportedPoseName) setPoseName(pendingImportedPoseName);
    setPendingImportedPose(null);
  };

  const handleGeneratePose = async (promptOverride?: string) => {
    const prompt = (promptOverride || posePrompt).trim();
    if (!prompt || isGeneratingPose || loading || Boolean(loadError)) return;
    if (bonesRef.current.size > 250) {
      setPoseAiError('Este rig tem mais de 250 bones; o assistente ainda não consegue processá-lo.');
      return;
    }

    setPoseAiError('');
    setPoseChatMessages((messages) => [...messages, { role: 'user', text: prompt }]);
    setPosePrompt('');
    setIsGeneratingPose(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        throw new Error('Entre na sua conta para usar o assistente de poses.');
      }

      const bones = [...bonesRef.current.entries()].map(([name, bone]) => ({
        name,
        parent: bone.parent instanceof THREE.Bone ? bone.parent.name : null,
        current: rotations[name] || initialRotationsRef.current.get(name) || [0, 0, 0],
      }));
      const response = await fetch('/api/v1/poses/generate', {
        method: 'POST',
        signal: AbortSignal.timeout(35000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
          'x-user-id': data.session.user.id,
        },
        body: JSON.stringify({ prompt, bones }),
      });
      const result: {
        message?: unknown;
        poseName?: unknown;
        rotations?: unknown;
      } = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof result.message === 'string'
            ? result.message
            : 'Não foi possível gerar esta pose.'
        );
      }

      const allowedBones = bonesRef.current;
      const generatedRotations = Array.isArray(result.rotations)
        ? result.rotations.flatMap((entry: unknown) => {
            if (!entry || typeof entry !== 'object') return [];
            const value = entry as { bone?: unknown; rotation?: unknown };
            if (
              typeof value.bone !== 'string' ||
              !allowedBones.has(value.bone) ||
              !Array.isArray(value.rotation) ||
              value.rotation.length !== 3 ||
              !value.rotation.every((angle) => typeof angle === 'number' && Number.isFinite(angle))
            ) {
              return [];
            }
            return [[
              value.bone,
              value.rotation.map((angle) => Math.max(-180, Math.min(180, angle))),
            ] as const];
          })
        : [];
      if (!generatedRotations.length) {
        throw new Error('A resposta da IA não contém rotações válidas para este avatar.');
      }

      const nextRotations = Object.fromEntries(generatedRotations) as BoneRotationMap;
      setRotations((current) => ({ ...current, ...nextRotations }));
      setEditedBones((current) => new Set([...current, ...Object.keys(nextRotations)]));
      if (typeof result.poseName === 'string' && result.poseName.trim()) {
        setPoseName(result.poseName.trim().slice(0, 48));
      }
      setPoseChatMessages((messages) => [
        ...messages,
        {
          role: 'assistant',
          text: typeof result.message === 'string'
            ? result.message
            : 'Pose aplicada à prévia. Você pode pedir ajustes ou mexer nos bones manualmente.',
        },
      ]);
    } catch (error) {
      setPoseAiError(
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'A IA demorou demais para responder. Tente novamente.'
          : error instanceof Error
            ? error.message
            : 'Falha ao gerar a pose.'
      );
    } finally {
      setIsGeneratingPose(false);
    }
  };

  const handleSave = () => {
    const name = poseName.trim();
    if (!name || !editedBoneList.length || saving) return;
    setSaving(true);
    const boneRotations: BoneRotationMap = {};
    editedBoneList.forEach((boneName) => {
      boneRotations[boneName] = rotations[boneName];
    });
    onSave(name, boneRotations);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="bone-pose-editor-title"
        className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-cyan-300/30 bg-[#14151b] text-zinc-100 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
          <div>
            <h2 id="bone-pose-editor-title" className="flex items-center gap-2 text-sm font-bold text-white sm:text-base">
              <Activity className="h-4 w-4 text-cyan-300" />
              Editor de pose por bones
            </h2>
            <p className="mt-1 text-[10px] text-zinc-400">{avatar.name} · protótipo local para teste</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar editor" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1.3fr_1fr] md:p-6">
          <div className="relative min-h-[260px] overflow-hidden rounded-xl border border-white/10 bg-[#101116] md:min-h-[420px]">
            <div ref={canvasContainerRef} className="absolute inset-0" />
            {!loading && !loadError && (
              <div className="absolute left-2 right-2 top-2 z-10 flex flex-wrap items-center gap-1 rounded-lg bg-black/60 p-1 backdrop-blur-sm">
                {([
                  ['front', 'Frente'],
                  ['back', 'Trás'],
                  ['side', 'Lado'],
                  ['top', 'Cima'],
                  ['reset', 'Reset'],
                ] as const).map(([view, label]) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setPreviewView(view)}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-semibold text-zinc-200 hover:border-cyan-300/40 hover:bg-cyan-300/15 hover:text-white"
                    aria-label={`Ver avatar de ${label.toLowerCase()}`}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto px-1 text-[9px] text-zinc-400">Arraste para girar · scroll para zoom</span>
              </div>
            )}
            {(loading || loadError) && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#101116]/90 p-6 text-center">
                <p className={`max-w-sm text-xs ${loadError ? 'text-amber-200' : 'text-zinc-300'}`}>
                  {loading ? 'Carregando avatar e procurando bones…' : loadError}
                </p>
              </div>
            )}
            {!loading && !loadError && boneNames.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#101116]/90 p-6 text-center">
                <p className="text-xs text-amber-200">Nenhum bone encontrado neste modelo.</p>
              </div>
            )}
            <p className="absolute bottom-2 left-3 text-[9px] text-zinc-400">Pré-visualização · modelo rigado necessário</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="bone-select" className="mb-1 block text-[11px] font-semibold text-zinc-300">Bone</label>
              <select
                id="bone-select"
                value={selectedBone}
                onChange={(event) => setSelectedBone(event.target.value)}
                disabled={loading || Boolean(loadError) || boneNames.length === 0}
                className="w-full rounded-lg border border-white/10 bg-[#1b1c24] px-3 py-2 text-xs text-white"
              >
                {boneNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>

            <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
              {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                <label key={axis} className="block">
                  <span className="mb-1 flex justify-between text-[10px] text-zinc-300">
                    <span>Rotação {axis}</span><span>{Math.round(selectedRotation[index])}°</span>
                  </span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={selectedRotation[index]}
                    onChange={(event) => updateRotation(index as 0 | 1 | 2, Number(event.target.value))}
                    disabled={!selectedBone || Boolean(loadError)}
                    className="w-full accent-cyan-300"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={resetSelectedBone}
                disabled={!editedBones.has(selectedBone)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/5 disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" /> Restaurar bone
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-cyan-300/20 bg-cyan-950/10 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
                <MessageCircle className="h-3.5 w-3.5" />
                Assistente de poses
              </div>
              <div className="flex flex-wrap gap-1">
                {['Sentado em uma cadeira', 'Acenando com a mão', 'Braços cruzados'].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void handleGeneratePose(suggestion)}
                    disabled={loading || Boolean(loadError) || isGeneratingPose}
                    className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2 py-1 text-[9px] text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {poseChatMessages.length > 0 && (
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg bg-black/20 p-2">
                  {poseChatMessages.slice(-6).map((message, index) => (
                    <p
                      key={`${index}-${message.role}`}
                      className={`text-[10px] leading-relaxed ${
                        message.role === 'user' ? 'text-zinc-300' : 'text-cyan-100'
                      }`}
                    >
                      <strong>{message.role === 'user' ? 'Você:' : 'IA:'}</strong> {message.text}
                    </p>
                  ))}
                </div>
              )}
              {poseAiError && (
                <p role="alert" className="text-[10px] text-amber-200">{poseAiError}</p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleGeneratePose();
                }}
                className="flex gap-1.5"
              >
                <input
                  value={posePrompt}
                  onChange={(event) => setPosePrompt(event.target.value)}
                  maxLength={500}
                  placeholder="Ex.: deixe o avatar sentado e relaxado"
                  disabled={loading || Boolean(loadError) || isGeneratingPose}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#1b1c24] px-2.5 py-2 text-[10px] text-white placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  disabled={!posePrompt.trim() || isGeneratingPose || loading || Boolean(loadError)}
                  aria-label="Gerar pose com IA"
                  className="flex h-8 w-9 items-center justify-center rounded-lg bg-cyan-300 text-black hover:bg-cyan-200 disabled:opacity-40"
                >
                  {isGeneratingPose
                    ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                </button>
              </form>
              <p className="text-[9px] leading-relaxed text-zinc-500">
                A IA usa os bones deste rig e aplica a sugestão na prévia; você pode pedir ajustes antes de salvar.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] font-semibold text-zinc-200">Usar outra IA</div>
              <p className="text-[9px] leading-relaxed text-zinc-400">
                Baixe o rig, edite o campo <strong className="text-zinc-200">poseRequest</strong> no JSON com a pose desejada e envie o arquivo a outra IA. Importe aqui o JSON completo que ela devolver.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadRigData}
                  disabled={loading || Boolean(loadError)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-[10px] font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" /> Baixar dados do rig
                </button>
                <button
                  type="button"
                  onClick={() => poseFileInputRef.current?.click()}
                  disabled={loading || Boolean(loadError)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2 py-2 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-40"
                >
                  <FileUp className="h-3.5 w-3.5" /> Importar pose JSON
                </button>
              </div>
              {pendingImportedPose && (
                <button
                  type="button"
                  onClick={applyImportedPose}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-bold text-black hover:bg-cyan-200"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Aplicar pose importada ({Object.keys(pendingImportedPose).length} bones)
                </button>
              )}
              <input
                ref={poseFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(event) => void handleImportPoseFile(event)}
                className="hidden"
              />
            </div>

            <div>
              <label htmlFor="bone-pose-name" className="mb-1 block text-[11px] font-semibold text-zinc-300">Nome da pose</label>
              <input
                id="bone-pose-name"
                value={poseName}
                onChange={(event) => setPoseName(event.target.value)}
                placeholder="Ex.: Sentar na cadeira"
                maxLength={48}
                className="w-full rounded-lg border border-white/10 bg-[#1b1c24] px-3 py-2 text-xs text-white placeholder:text-zinc-500"
              />
            </div>

            <p className="text-[10px] leading-relaxed text-zinc-400">
              Ajuste os bones necessários e salve. A pose será vinculada a este avatar e ficará disponível localmente neste navegador.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || Boolean(loadError) || !poseName.trim() || !editedBoneList.length}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              Salvar pose de teste ({editedBoneList.length} bones)
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
