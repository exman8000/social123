import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Activity, LoaderCircle, Plus, Upload, X } from 'lucide-react';
import type { InventoryItem } from '../types';
import { resolveAssetDownloadUrl, uploadGlbDirect } from '../lib/assetSyncClient';
import { supabase } from '../lib/supabase';

interface TransferBonesModalProps {
  onClose: () => void;
  onComplete: (item: InventoryItem) => void;
}

interface RigAnchor {
  id: string;
  bone: string;
  point: [number, number, number];
}

interface BoneSegment {
  boneIndex: number;
  start: [number, number, number];
  end: [number, number, number];
}

const MAX_BONES = 128;
const MAX_VERTICES = 80000;
const MAX_ANCHORS = 32;

const disposeScene = (scene: THREE.Object3D) => {
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => material.dispose());
  });
};

const fileToGltf = async (file: File) => {
  if (/\.fbx$/i.test(file.name)) {
    const fbx = new FBXLoader().parse(await file.arrayBuffer(), '');
    fbx.updateMatrixWorld(true);
    const exported = await new GLTFExporter().parseAsync(fbx, {
      binary: true,
      animations: fbx.animations,
      onlyVisible: true,
    });
    disposeScene(fbx);
    if (!(exported instanceof ArrayBuffer)) {
      throw new Error(`Não foi possível converter "${file.name}" para GLB.`);
    }
    return exported;
  }
  if (!/\.glb$/i.test(file.name)) {
    throw new Error('Use arquivos GLB ou FBX. Arquivos GLTF com dependências externas não são aceitos.');
  }
  return file.arrayBuffer();
};

const parseModelFile = async (file: File) =>
  new GLTFLoader().parseAsync(await fileToGltf(file), '');

const getWorldPositionTuple = (object: THREE.Object3D): [number, number, number] => {
  const position = object.getWorldPosition(new THREE.Vector3());
  return [position.x, position.y, position.z];
};

const getBoneSegments = (bones: THREE.Bone[]): BoneSegment[] => {
  const indexByBone = new Map(bones.map((bone, index) => [bone, index]));
  const segments: BoneSegment[] = [];
  bones.forEach((bone, boneIndex) => {
    const start = getWorldPositionTuple(bone);
    const children = bone.children.filter(
      (child): child is THREE.Bone => child instanceof THREE.Bone && indexByBone.has(child)
    );
    if (children.length) {
      children.forEach((child) =>
        segments.push({ boneIndex, start, end: getWorldPositionTuple(child) })
      );
    } else if (bone.parent instanceof THREE.Bone && indexByBone.has(bone.parent)) {
      segments.push({
        boneIndex,
        start: getWorldPositionTuple(bone.parent),
        end: start,
      });
    } else {
      segments.push({ boneIndex, start, end: start });
    }
  });
  return segments;
};

const skinGeometryToRig = (
  geometry: THREE.BufferGeometry,
  meshWorldMatrix: THREE.Matrix4,
  segments: BoneSegment[],
  boneCount: number,
  anchors: RigAnchor[],
  manualRadius: number
) => {
  const output = geometry.clone();
  output.applyMatrix4(meshWorldMatrix);
  const positions = output.getAttribute('position');
  const skinIndices = new Uint16Array(positions.count * 4);
  const skinWeights = new Float32Array(positions.count * 4);
  const automaticByBone = new Float32Array(boneCount);
  const point = new THREE.Vector3();
  const nearestIndices = new Int32Array(4);
  const nearestDistances = new Float64Array(4);
  const manualInfluence = new Float32Array(boneCount);
  const selectedIndices = new Int32Array(4);
  const selectedWeights = new Float32Array(4);

  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    point.fromBufferAttribute(positions, vertex);
    nearestIndices.fill(-1);
    nearestDistances.fill(Number.POSITIVE_INFINITY);
    automaticByBone.fill(0);
    manualInfluence.fill(0);
    selectedIndices.fill(-1);
    selectedWeights.fill(0);

    for (const segment of segments) {
      const [sx, sy, sz] = segment.start;
      const dx = segment.end[0] - sx;
      const dy = segment.end[1] - sy;
      const dz = segment.end[2] - sz;
      const lengthSquared = dx * dx + dy * dy + dz * dz;
      const factor =
        lengthSquared > 1e-12
          ? THREE.MathUtils.clamp(
              ((point.x - sx) * dx + (point.y - sy) * dy + (point.z - sz) * dz) /
                lengthSquared,
              0,
              1
            )
          : 0;
      const ox = point.x - (sx + factor * dx);
      const oy = point.y - (sy + factor * dy);
      const oz = point.z - (sz + factor * dz);
      const distanceSquared = ox * ox + oy * oy + oz * oz;
      let slot = -1;
      let existingBone = false;
      for (let index = 0; index < 4; index += 1) {
        if (nearestIndices[index] === segment.boneIndex) {
          slot = index;
          existingBone = true;
          break;
        }
      }
      if (existingBone) {
        if (distanceSquared >= nearestDistances[slot]) continue;
        nearestDistances[slot] = distanceSquared;
        while (slot > 0 && nearestDistances[slot] < nearestDistances[slot - 1]) {
          const previousIndex = nearestIndices[slot - 1];
          const previousDistance = nearestDistances[slot - 1];
          nearestIndices[slot - 1] = nearestIndices[slot];
          nearestDistances[slot - 1] = nearestDistances[slot];
          nearestIndices[slot] = previousIndex;
          nearestDistances[slot] = previousDistance;
          slot -= 1;
        }
        continue;
      }
      for (let index = 0; index < 4; index += 1) {
        if (distanceSquared < nearestDistances[index]) {
          slot = index;
          break;
        }
      }
      if (slot >= 0) {
        for (let index = 3; index > slot; index -= 1) {
          nearestIndices[index] = nearestIndices[index - 1];
          nearestDistances[index] = nearestDistances[index - 1];
        }
        nearestIndices[slot] = segment.boneIndex;
        nearestDistances[slot] = distanceSquared;
      }
    }

    for (const anchor of anchors) {
      const boneIndex = boneCount > 0 ? Number(anchor.bone) : -1;
      if (!Number.isInteger(boneIndex) || boneIndex < 0 || boneIndex >= boneCount) continue;
      const dx = point.x - anchor.point[0];
      const dy = point.y - anchor.point[1];
      const dz = point.z - anchor.point[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const influence = THREE.MathUtils.clamp(1 - distance / manualRadius, 0, 1);
      manualInfluence[boneIndex] = Math.max(manualInfluence[boneIndex], influence);
    }

    let automaticTotal = 0;
    let manualTotal = 0;
    for (let index = 0; index < 4; index += 1) {
      if (nearestIndices[index] < 0) continue;
      const weight = 1 / Math.max(nearestDistances[index], 1e-8);
      automaticByBone[nearestIndices[index]] = weight;
      automaticTotal += weight;
    }
    for (let index = 0; index < boneCount; index += 1) {
      manualTotal += manualInfluence[index];
    }
    const manualBlend = manualTotal > 0 ? Math.min(0.9, manualTotal / (manualTotal + 0.1)) : 0;
    for (let boneIndex = 0; boneIndex < boneCount; boneIndex += 1) {
      const weight =
        (automaticTotal > 0
          ? ((1 - manualBlend) * automaticByBone[boneIndex]) / automaticTotal
          : 0) +
        (manualTotal > 0 ? (manualBlend * manualInfluence[boneIndex]) / manualTotal : 0);
      if (weight <= selectedWeights[3]) continue;
      let slot = 3;
      while (slot > 0 && weight > selectedWeights[slot - 1]) {
        selectedWeights[slot] = selectedWeights[slot - 1];
        selectedIndices[slot] = selectedIndices[slot - 1];
        slot -= 1;
      }
      selectedWeights[slot] = weight;
      selectedIndices[slot] = boneIndex;
    }
    for (let index = 0; index < 4; index += 1) {
      if (selectedIndices[index] >= 0) {
        skinIndices[vertex * 4 + index] = selectedIndices[index];
        skinWeights[vertex * 4 + index] = selectedWeights[index];
      }
    }
    const weightOffset = vertex * 4;
    const total =
      skinWeights[weightOffset] +
      skinWeights[weightOffset + 1] +
      skinWeights[weightOffset + 2] +
      skinWeights[weightOffset + 3];
    if (total > 0) {
      for (let index = 0; index < 4; index += 1) {
        skinWeights[weightOffset + index] /= total;
      }
    }
  }

  output.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  output.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  return output;
};

const createRiggedModel = async (
  targetFile: File,
  rigFile: File,
  scaleAdjustment: number,
  offsets: [number, number, number],
  orientationY: number,
  anchors: RigAnchor[],
  manualRadius: number
) => {
  const [targetGltf, rigGltf] = await Promise.all([
    parseModelFile(targetFile),
    parseModelFile(rigFile),
  ]);
  const targetScene = targetGltf.scene;
  const rigScene = rigGltf.scene;
  const targetMeshes: THREE.Mesh[] = [];
  const rigMeshes: THREE.Mesh[] = [];
  targetScene.traverse((node) => {
    if (node instanceof THREE.Mesh) targetMeshes.push(node);
  });
  rigScene.traverse((node) => {
    if (node instanceof THREE.Mesh) rigMeshes.push(node);
  });

  try {
    const riggedMesh = rigMeshes.find(
      (mesh): mesh is THREE.SkinnedMesh => mesh instanceof THREE.SkinnedMesh
    );
    if (!riggedMesh) throw new Error('O primeiro arquivo precisa conter uma malha vinculada a bones.');
    if (targetMeshes.some((mesh) => mesh instanceof THREE.SkinnedMesh)) {
      throw new Error('O arquivo de destino já contém bones.');
    }
    if (!targetMeshes.length) throw new Error('O arquivo sem bones não contém malhas 3D.');
    const bones = riggedMesh.skeleton.bones;
    if (!bones.length || bones.length > MAX_BONES) {
      throw new Error(`O rig precisa ter entre 1 e ${MAX_BONES} bones.`);
    }
    targetScene.updateMatrixWorld(true);
    rigScene.updateMatrixWorld(true);
    const targetBounds = new THREE.Box3().setFromObject(targetScene);
    const rigBounds = new THREE.Box3().setFromObject(rigScene);
    const targetSize = targetBounds.getSize(new THREE.Vector3());
    const rigSize = rigBounds.getSize(new THREE.Vector3());
    if (targetSize.y < 1e-5 || rigSize.y < 1e-5) {
      throw new Error('Não foi possível medir a altura de um dos modelos.');
    }
    const scale = (rigSize.y / targetSize.y) * scaleAdjustment;
    const targetCenter = targetBounds.getCenter(new THREE.Vector3());
    const rigCenter = rigBounds.getCenter(new THREE.Vector3());
    targetScene.scale.multiplyScalar(scale);
    targetScene.position.x += rigCenter.x - targetCenter.x * scale + offsets[0];
    targetScene.position.y += rigBounds.min.y - targetBounds.min.y * scale + offsets[1];
    targetScene.position.z += rigCenter.z - targetCenter.z * scale + offsets[2];
    targetScene.updateMatrixWorld(true);
    rigScene.updateMatrixWorld(true);
    const alignedCenter = new THREE.Box3()
      .setFromObject(targetScene)
      .getCenter(new THREE.Vector3());
    const rotation = new THREE.Matrix4()
      .makeTranslation(alignedCenter.x, alignedCenter.y, alignedCenter.z)
      .multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(orientationY)))
      .multiply(new THREE.Matrix4().makeTranslation(-alignedCenter.x, -alignedCenter.y, -alignedCenter.z));
    const alignedBounds = new THREE.Box3()
      .setFromObject(targetScene)
      .applyMatrix4(rotation);
    const alignedSize = alignedBounds.getSize(new THREE.Vector3());
    const worldAnchors = anchors.map((anchor) => ({
      ...anchor,
      point: [
        alignedBounds.min.x + anchor.point[0] * alignedSize.x,
        alignedBounds.min.y + anchor.point[1] * alignedSize.y,
        alignedBounds.min.z + anchor.point[2] * alignedSize.z,
      ] as [number, number, number],
    }));

    const totalVertices = targetMeshes.reduce(
      (total, mesh) => total + (mesh.geometry.getAttribute('position')?.count || 0),
      0
    );
    if (totalVertices > MAX_VERTICES) {
      throw new Error(
        `O destino tem ${totalVertices.toLocaleString()} vértices; o limite é ${MAX_VERTICES.toLocaleString()}.`
      );
    }
    const segments = getBoneSegments(bones);
    if (!segments.length) throw new Error('O rig não tem segmentos de bones utilizáveis.');

    const output = new THREE.Group();
    output.name = 'modelo-com-bones';
    output.add(rigScene);
    rigMeshes.forEach((mesh) => mesh.parent?.remove(mesh));
    output.updateMatrixWorld(true);
    riggedMesh.skeleton.calculateInverses();
    targetMeshes.forEach((mesh) => {
      mesh.updateWorldMatrix(true, false);
      const alignedMeshMatrix = new THREE.Matrix4().multiplyMatrices(rotation, mesh.matrixWorld);
      const geometry = skinGeometryToRig(
        mesh.geometry,
        alignedMeshMatrix,
        segments,
        bones.length,
        worldAnchors,
        manualRadius
      );
      const skinned = new THREE.SkinnedMesh(geometry, mesh.material);
      skinned.name = mesh.name || targetFile.name;
      output.add(skinned);
      skinned.bind(riggedMesh.skeleton);
    });
    output.updateMatrixWorld(true);
    return {
      output,
      cleanup: () => {
        disposeScene(output);
        disposeScene(targetScene);
        rigMeshes.forEach((mesh) => {
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => material.dispose());
        });
      },
    };
  } catch (error) {
    disposeScene(targetScene);
    disposeScene(rigScene);
    throw error;
  }
};

const RiggedPreview: React.FC<{
  url: string;
  anchors: RigAnchor[];
  boneNames: string[];
  showSkeleton: boolean;
  onPick: (point: [number, number, number]) => void;
}> = ({ url, anchors, boneNames, showSkeleton, onPick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pickHandlerRef = useRef(onPick);
  const markersRef = useRef<THREE.Group | null>(null);
  const skeletonRef = useRef<THREE.Group | null>(null);
  const previewBoundsRef = useRef(new THREE.Box3());
  pickHandlerRef.current = onPick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let frame = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101116');
    scene.add(new THREE.HemisphereLight(0xe7edff, 0x302b36, 2));
    const light = new THREE.DirectionalLight(0xffe0a0, 3);
    light.position.set(-3, 6, 4);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.2, 4);
    const controls = new OrbitControls(camera, container);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 400);
    container.appendChild(renderer.domElement);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let previewModel: THREE.Object3D | null = null;
    let pointerStart: [number, number] | null = null;
    const markerGroup = new THREE.Group();
    const skeletonGroup = new THREE.Group();
    markersRef.current = markerGroup;
    skeletonRef.current = skeletonGroup;
    scene.add(markerGroup, skeletonGroup);
    renderer.domElement.addEventListener('pointerdown', (event) => {
      pointerStart = [event.clientX, event.clientY];
    });
    const onClick = (event: MouseEvent) => {
      if (
        !pointerStart ||
        Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5
      ) {
        pointerStart = null;
        return;
      }
      pointerStart = null;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find(
        (entry) => entry.object instanceof THREE.SkinnedMesh
      );
      if (hit) {
        const bounds = new THREE.Box3();
        scene.traverse((node) => {
          if (node instanceof THREE.SkinnedMesh) bounds.expandByObject(node);
        });
        const size = bounds.getSize(new THREE.Vector3());
        if (size.x > 1e-5 && size.y > 1e-5 && size.z > 1e-5) {
          pickHandlerRef.current([
            THREE.MathUtils.clamp((hit.point.x - bounds.min.x) / size.x, 0, 1),
            THREE.MathUtils.clamp((hit.point.y - bounds.min.y) / size.y, 0, 1),
            THREE.MathUtils.clamp((hit.point.z - bounds.min.z) / size.z, 0, 1),
          ]);
        }
      }
    };
    renderer.domElement.addEventListener('click', onClick);
    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    void new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => {
        if (disposed) {
          disposeScene(gltf.scene);
          return;
        }
        previewModel = gltf.scene;
        scene.add(gltf.scene);
        previewModel.updateMatrixWorld(true);
        const bounds = new THREE.Box3();
        const bones: THREE.Bone[] = [];
        previewModel.traverse((node) => {
          if (node instanceof THREE.SkinnedMesh) bounds.expandByObject(node);
          if (node instanceof THREE.Bone) bones.push(node);
        });
        previewBoundsRef.current.copy(bounds);
        const size = bounds.getSize(new THREE.Vector3());
        const jointRadius = Math.max(size.y * 0.008, 0.008);
        const jointGeometry = new THREE.SphereGeometry(jointRadius, 8, 6);
        const jointMaterial = new THREE.MeshBasicMaterial({
          color: '#67e8f9',
          depthTest: false,
        });
        const positions: number[] = [];
        bones.forEach((bone) => {
          const bonePosition = bone.getWorldPosition(new THREE.Vector3());
          const joint = new THREE.Mesh(jointGeometry, jointMaterial);
          joint.position.copy(bonePosition);
          joint.renderOrder = 10;
          skeletonGroup.add(joint);
          if (bone.parent instanceof THREE.Bone) {
            const parentPosition = bone.parent.getWorldPosition(new THREE.Vector3());
            positions.push(
              parentPosition.x,
              parentPosition.y,
              parentPosition.z,
              bonePosition.x,
              bonePosition.y,
              bonePosition.z
            );
          }
        });
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3)
        );
        const lines = new THREE.LineSegments(
          lineGeometry,
          new THREE.LineBasicMaterial({ color: '#22d3ee', depthTest: false })
        );
        lines.renderOrder = 9;
        skeletonGroup.add(lines);
        skeletonGroup.visible = showSkeleton;
      })
      .catch((error: unknown) => {
        console.error('Falha ao abrir a prévia do modelo rigado:', error);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      if (previewModel) disposeScene(previewModel);
      skeletonGroup.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
          node.geometry.dispose();
          const material = node.material;
          (Array.isArray(material) ? material : [material]).forEach((entry) => entry.dispose());
        }
      });
      markerGroup.traverse((node) => {
        if (!(node instanceof THREE.Sprite)) return;
        node.material.map?.dispose();
        node.material.dispose();
      });
      markersRef.current = null;
      skeletonRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    while (group.children.length) {
      const marker = group.children[0];
      group.remove(marker);
      if (marker instanceof THREE.Sprite) {
        marker.material.map?.dispose();
        marker.material.dispose();
      }
    }
    const bounds = previewBoundsRef.current;
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    const palette = ['#f472b6', '#facc15', '#a78bfa', '#fb923c', '#4ade80', '#60a5fa'];
    anchors.forEach((anchor, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const context = canvas.getContext('2d');
      if (!context) return;
      const color = palette[Number(anchor.bone) % palette.length];
      context.fillStyle = color;
      context.beginPath();
      context.arc(48, 48, 44, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 6;
      context.stroke();
      context.fillStyle = '#111827';
      context.font = 'bold 54px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(index + 1), 48, 50);
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const marker = new THREE.Sprite(material);
      marker.position.set(
        bounds.min.x + anchor.point[0] * size.x,
        bounds.min.y + anchor.point[1] * size.y,
        bounds.min.z + anchor.point[2] * size.z
      );
      const markerSize = Math.max(size.y * 0.07, 0.06);
      marker.scale.set(markerSize, markerSize, 1);
      marker.renderOrder = 20;
      marker.userData.boneName = boneNames[Number(anchor.bone)] || `Bone ${Number(anchor.bone) + 1}`;
      group.add(marker);
    });
  }, [anchors, boneNames]);

  useEffect(() => {
    if (skeletonRef.current) skeletonRef.current.visible = showSkeleton;
  }, [showSkeleton]);

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-xl border border-white/10" />;
};

export const TransferBonesModal: React.FC<TransferBonesModalProps> = ({ onClose, onComplete }) => {
  const rigInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const [rigFile, setRigFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [boneNames, setBoneNames] = useState<string[]>([]);
  const [selectedBone, setSelectedBone] = useState('');
  const [anchors, setAnchors] = useState<RigAnchor[]>([]);
  const [manualRadius, setManualRadius] = useState(0.2);
  const [scaleAdjustment, setScaleAdjustment] = useState(1);
  const [offsets, setOffsets] = useState<[number, number, number]>([0, 0, 0]);
  const [orientationY, setOrientationY] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewDirty, setPreviewDirty] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasFiles = Boolean(rigFile && targetFile);
  const anchorSummary = useMemo(
    () =>
      anchors.reduce<Record<string, number>>((summary, anchor) => {
        summary[anchor.bone] = (summary[anchor.bone] || 0) + 1;
        return summary;
      }, {}),
    [anchors]
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const chooseRigFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setSuccess('');
    setPreviewUrl('');
    setPreviewDirty(true);
    setAnchors([]);
    try {
      const gltf = await parseModelFile(file);
      const skinnedMeshes: THREE.SkinnedMesh[] = [];
      gltf.scene.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh) skinnedMeshes.push(node);
      });
      const skinned = skinnedMeshes[0];
      if (!skinned) throw new Error('Esse arquivo não contém uma malha vinculada a bones.');
      const names = skinned.skeleton.bones.map((bone) => bone.name);
      if (!names.length || names.length > MAX_BONES) {
        throw new Error(`O rig precisa ter entre 1 e ${MAX_BONES} bones.`);
      }
      setBoneNames(names);
      setSelectedBone('0');
      setRigFile(file);
      disposeScene(gltf.scene);
    } catch (caught) {
      setRigFile(null);
      setBoneNames([]);
      setSelectedBone('');
      setError(caught instanceof Error ? caught.message : 'Não foi possível ler o modelo rigado.');
    }
  };

  const chooseTargetFile = (file?: File) => {
    if (!file) return;
    setError('');
    setSuccess('');
    setPreviewUrl('');
    setPreviewDirty(true);
    setAnchors([]);
    setTargetFile(file);
  };

  const generatePreview = async () => {
    if (!rigFile || !targetFile || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    let cleanupModel: (() => void) | null = null;
    try {
      const { output, cleanup } = await createRiggedModel(
        targetFile,
        rigFile,
        scaleAdjustment,
        offsets,
        orientationY,
        anchors,
        manualRadius
      );
      cleanupModel = cleanup;
      const exported = await new GLTFExporter().parseAsync(output, {
        binary: true,
        onlyVisible: true,
      });
      if (!(exported instanceof ArrayBuffer)) {
        throw new Error('Não foi possível gerar o arquivo GLB para a prévia.');
      }
      const nextUrl = URL.createObjectURL(
        new Blob([exported], { type: 'model/gltf-binary' })
      );
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
      setPreviewDirty(false);
    } catch (caught) {
      console.error('Falha ao gerar prévia de transferência de bones:', caught);
      setError(caught instanceof Error ? caught.message : 'Não foi possível gerar a prévia.');
    } finally {
      cleanupModel?.();
      setBusy(false);
    }
  };

  const saveRiggedModel = async () => {
    if (!rigFile || !targetFile || !previewUrl || previewDirty || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    let cleanupModel: (() => void) | null = null;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('Entre na sua conta para salvar o modelo com bones.');
      }
      const { output, cleanup } = await createRiggedModel(
        targetFile,
        rigFile,
        scaleAdjustment,
        offsets,
        orientationY,
        anchors,
        manualRadius
      );
      cleanupModel = cleanup;
      const exported = await new GLTFExporter().parseAsync(output, {
        binary: true,
        onlyVisible: true,
      });
      if (!(exported instanceof ArrayBuffer)) {
        throw new Error('Não foi possível exportar o modelo com bones.');
      }
      const cleanBaseName = targetFile.name.replace(/\.(glb|fbx)$/i, '');
      const file = new File([exported], `${cleanBaseName}-rigged.glb`, {
        type: 'model/gltf-binary',
      });
      const userId = sessionData.session.user.id;
      const uploaded = await uploadGlbDirect(
        file,
        'avatar',
        userId,
        sessionData.session.access_token,
        setProgress
      );
      const downloadUrl = await resolveAssetDownloadUrl(uploaded.asset_id);
      if (!downloadUrl) {
        throw new Error(
          'O arquivo foi enviado, mas não foi possível resolver a URL para pré-visualizá-lo. Tente atualizar o inventário.'
        );
      }
      const item: InventoryItem = {
        id: uploaded.asset_id,
        assetId: uploaded.asset_id,
        ownerUserId: userId,
        fileName: file.name,
        displayName: `${cleanBaseName} (com bones)`,
        thumbUrl: '',
        type: 'Avatar',
        modelType: 'avatar',
        fileBlobUrl: downloadUrl,
        createdAt: new Date().toISOString(),
      };
      onComplete(item);
      setSuccess('Modelo rigado salvo no inventário.');
      setPreviewUrl('');
      setPreviewDirty(true);
      setRigFile(null);
      setTargetFile(null);
      setBoneNames([]);
      setAnchors([]);
    } catch (caught) {
      console.error('Falha ao salvar o modelo com bones:', caught);
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o modelo.');
    } finally {
      cleanupModel?.();
      setBusy(false);
      setProgress(0);
    }
  };

  const addAnchor = (point: [number, number, number]) => {
    if (!selectedBone || anchors.length >= MAX_ANCHORS) return;
    setAnchors((current) => [
      ...current,
      { id: crypto.randomUUID(), bone: selectedBone, point },
    ]);
    setPreviewDirty(true);
  };

  const updateOffset = (axis: 0 | 1 | 2, value: number) => {
    setOffsets((current) => {
      const next = [...current] as [number, number, number];
      next[axis] = value;
      return next;
    });
    setPreviewDirty(true);
  };

  const uploadCard = (
    title: string,
    description: string,
    file: File | null,
    inputRef: React.RefObject<HTMLInputElement | null>,
    onChange: (file?: File) => void
  ) => (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-300/40 bg-black/25 p-4 text-center hover:bg-cyan-300/5"
    >
      <Upload className="h-5 w-5 text-cyan-200" />
      <span className="text-sm font-semibold text-white">{title}</span>
      <span className="text-[10px] text-zinc-400">{file?.name || description}</span>
      <input
        ref={inputRef}
        type="file"
        accept=".glb,.fbx,model/gltf-binary"
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          void onChange(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-cyan-300/30 bg-[#15161c] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-white">Transferir bones para outro avatar</h2>
            <p className="mt-1 text-[10px] text-zinc-400">
              Use um rig como base, confira a transferência e salve o resultado como um novo item.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar">
            <X className="h-4 w-4 text-zinc-400 hover:text-white" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {uploadCard(
                '1. Arquivo com bones',
                'Escolha o avatar que fornece o rig',
                rigFile,
                rigInputRef,
                chooseRigFile
              )}
              {uploadCard(
                '2. Arquivo sem bones',
                'Escolha o modelo que receberá o rig',
                targetFile,
                targetInputRef,
                chooseTargetFile
              )}
            </div>

            {previewUrl ? (
              <>
                <div className="relative">
                  <RiggedPreview
                    url={previewUrl}
                    anchors={anchors}
                    boneNames={boneNames}
                    showSkeleton={showSkeleton}
                    onPick={addAnchor}
                  />
                  {previewDirty && (
                    <div className="absolute left-2 right-2 top-2 rounded-md border border-amber-300/40 bg-black/75 px-2 py-1 text-[10px] text-amber-100">
                      Prévia anterior — parâmetros alterados. Gere novamente para conferir.
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-md bg-black/70 px-2 py-1 text-[9px] text-zinc-200">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-cyan-300" /> Esqueleto
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="flex h-3 w-3 items-center justify-center rounded-full bg-pink-400 text-[8px] font-bold text-black">1</span>
                      Ponto manual
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={showSkeleton}
                    onChange={(event) => setShowSkeleton(event.target.checked)}
                    className="accent-cyan-300"
                  />
                  Mostrar linhas e articulações do rig
                </label>
                <p className="text-[10px] text-zinc-400">
                  Selecione um bone à direita e clique na malha para adicionar um marcador numerado.
                  Arraste para orbitar e use o scroll para zoom.
                </p>
              </>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-xl border border-white/10 bg-[#101116] px-8 text-center text-xs text-zinc-500">
                Gere uma prévia para conferir o modelo e, se necessário, adicionar pontos manuais.
              </div>
            )}

            <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-[10px] leading-relaxed text-amber-100/80">
              A transferência automática calcula pesos por proximidade dos segmentos do esqueleto,
              com limite de quatro bones por vértice. Funciona melhor em modelos humanoides
              semelhantes. Pontos manuais reforçam o bone escolhido perto da região clicada.
              Arquivos acima de {MAX_VERTICES.toLocaleString()} vértices ou rigs acima de {MAX_BONES}{' '}
              bones não são processados neste protótipo.
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <h3 className="mb-3 text-xs font-semibold text-zinc-200">Ajustar alinhamento</h3>
              <label className="mb-3 block text-[10px] text-zinc-400">
                Escala relativa
                <input
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.01"
                  value={scaleAdjustment}
                  onChange={(event) => {
                    setScaleAdjustment(Number(event.target.value));
                    setPreviewDirty(true);
                  }}
                  className="mt-2 block w-full accent-cyan-300"
                />
                <span className="float-right text-zinc-200">{scaleAdjustment.toFixed(2)}×</span>
              </label>
              {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                <label key={axis} className="mb-2 block text-[10px] text-zinc-400">
                  Deslocamento {axis}
                  <input
                    type="range"
                    min="-0.75"
                    max="0.75"
                    step="0.01"
                    value={offsets[index]}
                    onChange={(event) => updateOffset(index as 0 | 1 | 2, Number(event.target.value))}
                    className="mt-1 block w-full accent-cyan-300"
                  />
                  <span className="float-right text-zinc-200">{offsets[index].toFixed(2)}</span>
                </label>
              ))}
              <label className="block text-[10px] text-zinc-400">
                Orientação frontal (Y): {orientationY}°
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={orientationY}
                  onChange={(event) => {
                    setOrientationY(Number(event.target.value));
                    setPreviewDirty(true);
                  }}
                  className="mt-1 block w-full accent-cyan-300"
                />
              </label>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <h3 className="mb-2 text-xs font-semibold text-zinc-200">Mapeamento manual opcional</h3>
              <label className="block text-[10px] text-zinc-400">
                Bone para o próximo ponto
                <select
                  value={selectedBone}
                  onChange={(event) => setSelectedBone(event.target.value)}
                  disabled={!boneNames.length}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#0d0e12] px-2 py-2 text-xs text-white"
                >
                  {boneNames.map((name, index) => (
                    <option key={`${index}-${name}`} value={String(index)}>
                      {name || `Bone ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-[10px] text-zinc-400">
                Raio de influência do ponto: {manualRadius.toFixed(2)}
                <input
                  type="range"
                  min="0.05"
                  max="0.6"
                  step="0.01"
                  value={manualRadius}
                  onChange={(event) => {
                    setManualRadius(Number(event.target.value));
                    setPreviewDirty(true);
                  }}
                  className="mt-1 block w-full accent-violet-300"
                />
              </label>
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                {anchors.map((anchor, index) => (
                  <div
                    key={anchor.id}
                    className="flex items-center justify-between gap-2 text-[10px] text-zinc-400"
                  >
                    <span className="truncate">
                      <strong className="text-white">{index + 1}.</strong>{' '}
                      {boneNames[Number(anchor.bone)] || 'Bone'} · região (
                      {anchor.point.map((coordinate) => coordinate.toFixed(2)).join(', ')})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAnchors((current) => current.filter((item) => item.id !== anchor.id));
                        setPreviewDirty(true);
                      }}
                      className="px-1 text-red-300"
                      aria-label="Remover ponto manual"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {!anchors.length && (
                  <span className="text-[10px] text-zinc-500">
                    Nenhum ponto manual. Eles são opcionais.
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500">
                <Plus className="h-3 w-3" />
                Até {MAX_ANCHORS} pontos; clique no modelo depois de gerar a prévia.
              </div>
            </div>

            {error && <div className="text-xs text-red-300">{error}</div>}
            {success && <div className="text-xs text-emerald-300">{success}</div>}
            {previewUrl && previewDirty && (
              <p className="text-[10px] text-amber-200">
                Há ajustes manuais pendentes; gere a prévia novamente antes de salvar.
              </p>
            )}
            {busy && (
              <div className="text-xs text-cyan-200">
                {progress > 0 ? `Enviando modelo: ${progress}%` : 'Calculando pesos e exportando...'}
              </div>
            )}
            {Object.keys(anchorSummary).length > 0 && (
              <p className="text-[10px] text-zinc-400">
                Bones com pontos: {Object.entries(anchorSummary).length}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => void generatePreview()}
                disabled={!hasFiles || busy}
                className="flex items-center gap-2 rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-40"
              >
                {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                Gerar prévia
              </button>
              <button
                type="button"
                onClick={() => void saveRiggedModel()}
                disabled={!previewUrl || previewDirty || busy}
                className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
              >
                Aplicar e salvar cópia
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
