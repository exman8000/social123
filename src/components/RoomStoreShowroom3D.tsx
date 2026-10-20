import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ArrowLeft, ArrowRight, Coins, LoaderCircle, RefreshCw, ShoppingBag } from 'lucide-react';
import { resolveAssetDownloadUrl } from '../lib/assetSyncClient';

export interface RoomStoreProduct {
  id: string;
  createdAt?: string;
  assetId?: string;
  name: string;
  kind: 'avatar' | 'pose' | 'accessory' | 'item';
  price: number;
  thumbUrl?: string;
  owned: boolean;
}

interface RoomStoreShowroom3DProps {
  products: RoomStoreProduct[];
  coins: number | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  assetAccessKey?: string | null;
  purchasingProductId: string | null;
  onPurchase: (productId: string) => Promise<void>;
  onBackToRoom: () => void;
  onOpenInventory: () => void;
  backLabel?: string;
}

const PAGE_SIZE = 3;

const disposeModel = (root: THREE.Object3D) => {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
};

export const RoomStoreShowroom3D: React.FC<RoomStoreShowroom3DProps> = ({
  products,
  coins,
  isLoading,
  error,
  isAuthenticated,
  assetAccessKey,
  purchasingProductId,
  onPurchase,
  onBackToRoom,
  onOpenInventory,
  backLabel = 'Voltar à sala',
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const modelSlotsRef = useRef<THREE.Group[]>([]);
  const [page, setPage] = useState(0);
  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [retryCount, setRetryCount] = useState(0);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const visibleProducts = useMemo(
    () => products.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [page, products]
  );
  const pageCount = Math.ceil(products.length / PAGE_SIZE);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c0d12');
    scene.fog = new THREE.Fog('#0c0d12', 10, 24);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 3.8, 9.4);
    camera.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe6edff, 0x28202a, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffdf9e, 3);
    keyLight.position.set(-3, 7, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x4e8cff, 28, 14);
    fillLight.position.set(4, 3, -2);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: '#161820', roughness: 0.48, metalness: 0.35 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const podiumMaterial = new THREE.MeshStandardMaterial({ color: '#28272b', metalness: 0.72, roughness: 0.28 });
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: '#d3a849',
      metalness: 0.82,
      roughness: 0.24,
      emissive: '#4f3510',
      emissiveIntensity: 0.25,
    });

    modelSlotsRef.current = [];
    [-2.25, 0, 2.25].forEach((x) => {
      const podium = new THREE.Group();
      podium.position.x = x;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.84, 0.28, 48), podiumMaterial);
      base.position.y = 0.14;
      base.castShadow = true;
      base.receiveShadow = true;
      podium.add(base);
      const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.77, 0.055, 48), goldMaterial);
      trim.position.y = 0.29;
      podium.add(trim);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.1, 48), podiumMaterial);
      top.position.y = 0.36;
      top.castShadow = true;
      podium.add(top);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.018, 8, 64),
        new THREE.MeshBasicMaterial({ color: '#f3c866' })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.42;
      podium.add(halo);

      const modelSlot = new THREE.Group();
      modelSlot.position.y = 0.42;
      podium.add(modelSlot);
      modelSlotsRef.current.push(modelSlot);
      scene.add(podium);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    camera.aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    camera.updateProjectionMatrix();

    let frame = 0;
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      modelSlotsRef.current.forEach((group, index) => {
        group.rotation.y += 0.003 + index * 0.0004;
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.forceContextLoss();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.domElement.remove();
      modelSlotsRef.current = [];
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    const loaded = new Set<string>();
    const failed = new Set<string>();

    setLoadedIds(new Set());
    setFailedIds(new Set());

    const loadProducts = async () => {
      await Promise.all(
        modelSlotsRef.current.map(async (slot, index) => {
          while (slot.children.length) {
            const child = slot.children[0];
            slot.remove(child);
            disposeModel(child);
          }
          const product = visibleProducts[index];
          if (!product) return;
          if (!product.assetId) {
            failed.add(product.id);
            return;
          }

          const url = await resolveAssetDownloadUrl(product.assetId);
          if (cancelled) return;
          if (!url) {
            failed.add(product.id);
            return;
          }

          await new Promise<void>((resolve) => {
            loader.load(
              url,
              (gltf) => {
                if (cancelled) {
                  disposeModel(gltf.scene);
                  resolve();
                  return;
                }
                const model = gltf.scene;
                model.updateMatrixWorld(true);
                const bounds = new THREE.Box3().setFromObject(model);
                const size = bounds.getSize(new THREE.Vector3());
                const center = bounds.getCenter(new THREE.Vector3());
                const maxDimension = Math.max(size.x, size.y, size.z);
                if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
                  failed.add(product.id);
                  resolve();
                  return;
                }

                const scale = 1.25 / maxDimension;
                model.scale.setScalar(scale);
                model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
                model.traverse((object) => {
                  if (object instanceof THREE.Mesh) {
                    object.castShadow = true;
                    object.receiveShadow = true;
                  }
                });
                slot.add(model);
                loaded.add(product.id);
                resolve();
              },
              undefined,
              () => {
                failed.add(product.id);
                resolve();
              }
            );
          });
        })
      );
      if (!cancelled) {
        setLoadedIds(loaded);
        if (failed.size > 0) {
          setFailedIds((current) => new Set([...current, ...failed]));
        }
      }
    };

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, [assetAccessKey, retryCount, visibleProducts]);

  const handlePurchase = async (productId: string) => {
    setPurchaseError(null);
    try {
      await onPurchase(productId);
    } catch (cause) {
      setPurchaseError(cause instanceof Error ? cause.message : 'Não foi possível adquirir o item.');
    }
  };

  const productTypeLabel = (kind: RoomStoreProduct['kind']) =>
    ({ avatar: 'AVATAR', pose: 'POSE', accessory: 'ACESSÓRIO', item: 'ITEM' })[kind];

  return (
    <div className="absolute inset-0 z-[60] overflow-hidden bg-[#0c0d12] text-white">
      <div ref={canvasRef} className="absolute inset-0" aria-label="Vitrine 3D com três pedestais de itens publicados" />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/75 to-transparent px-4 py-4 sm:px-8">
        <button
          type="button"
          onClick={onBackToRoom}
          className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/55 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:border-[#f3c866]/60"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
        <div className="flex items-center gap-2 sm:gap-3">
          {coins !== null && (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-black/55 px-3 py-2 text-xs font-bold text-amber-200 sm:text-sm">
              <Coins className="h-4 w-4" />
              {coins}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenInventory}
            className="flex items-center gap-2 rounded-xl border border-[#f3c866]/40 bg-[#f3c866]/15 px-3 py-2 text-xs font-semibold text-[#ffe2a0] backdrop-blur hover:bg-[#f3c866]/25 sm:px-4 sm:text-sm"
          >
            <ShoppingBag className="h-4 w-4" />
            Inventário
          </button>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 top-[12%] z-10 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.42em] text-[#f3c866]">Novidades da loja</p>
        <h2 className="mt-2 text-2xl font-black tracking-wide text-white drop-shadow-lg sm:text-4xl">VITRINE 3D</h2>
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/80 px-4 py-3 text-sm text-zinc-100">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Carregando itens publicados…
          </span>
        </div>
      )}
      {!isLoading && error && (
        <div className="absolute left-1/2 top-1/2 z-20 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-rose-300/30 bg-black/90 p-5 text-center text-sm text-rose-100">
          {error}
        </div>
      )}
      {!isLoading && !error && products.length === 0 && (
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-black/60 px-5 py-3 text-sm text-zinc-300">
          Nenhum item publicado com modelo 3D disponível.
        </div>
      )}

      <div className="absolute inset-x-0 bottom-[7%] z-10 flex items-end justify-center gap-2 px-2 sm:gap-6 sm:px-8">
        {visibleProducts.map((product) => {
          const isPurchasing = purchasingProductId === product.id;
          const modelLoading = !loadedIds.has(product.id);
          const modelFailed = failedIds.has(product.id);
          const cannotAfford = coins !== null && product.price > coins;
          return (
            <article
              key={product.id}
              className="flex min-w-0 max-w-[22rem] flex-1 flex-col items-center rounded-2xl border border-[#f3c866]/25 bg-[#101116]/90 p-3 text-center shadow-[0_16px_55px_rgba(0,0,0,.6)] backdrop-blur-md sm:p-5"
            >
              <span className="rounded-full border border-[#f3c866]/30 bg-[#f3c866]/10 px-2.5 py-1 text-[9px] font-extrabold tracking-[0.18em] text-[#f3c866] sm:text-[10px]">
                {productTypeLabel(product.kind)}
              </span>
              <h3 className="mt-2 w-full truncate text-xs font-bold text-white sm:text-base" title={product.name}>
                {product.name}
              </h3>
              {product.thumbUrl && (
                <img
                  src={product.thumbUrl}
                  alt=""
                  className="mt-2 h-10 w-10 rounded-lg object-cover"
                  loading="lazy"
                />
              )}
              {modelLoading && !modelFailed && !isLoading && (
                <span className="mt-1 flex items-center gap-1 text-[9px] text-zinc-300 sm:text-[10px]">
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                  Carregando modelo 3D
                </span>
              )}
              {modelFailed && (
                <button
                  type="button"
                  onClick={() => setRetryCount((count) => count + 1)}
                  className="mt-1 flex items-center gap-1 text-[9px] text-amber-200 hover:text-white sm:text-[10px]"
                >
                  <RefreshCw className="h-3 w-3" />
                  Prévia indisponível · tentar novamente
                </button>
              )}
              <button
                type="button"
                disabled={product.owned || !isAuthenticated || (product.price > 0 && (coins === null || cannotAfford)) || isPurchasing || isLoading || Boolean(error)}
                onClick={() => void handlePurchase(product.id)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#f3c866]/40 bg-gradient-to-b from-[#d9b55e] to-[#9c7425] px-2 py-2 text-[10px] font-black text-[#17130b] shadow-lg transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-zinc-700 disabled:text-zinc-300 sm:mt-4 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-xs"
                title={
                  product.owned ? 'Este item já está no seu inventário' :
                    !isAuthenticated ? 'Entre na sua conta para adquirir' :
                      product.price > 0 && coins === null ? 'Saldo indisponível' :
                        cannotAfford ? 'Saldo insuficiente' : 'Adquirir item'
                }
              >
                {isPurchasing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
                {product.owned ? 'Adquirido' : isPurchasing ? 'Adquirindo…' : product.price === 0 ? 'Adquirir grátis' : `${product.price} créditos`}
              </button>
            </article>
          );
        })}
      </div>

      {(purchaseError || !isAuthenticated) && (
        <div className={`absolute bottom-[1%] left-1/2 z-20 -translate-x-1/2 rounded-lg px-3 py-1.5 text-center text-[10px] sm:text-xs ${purchaseError ? 'bg-rose-950/90 text-rose-100' : 'bg-black/70 text-zinc-200'}`}>
          {purchaseError || 'Entre na sua conta para adquirir itens.'}
        </div>
      )}

      {pageCount > 1 && (
        <div className="absolute inset-x-0 bottom-2 z-20 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="rounded-full border border-white/15 bg-black/60 p-2.5 text-white backdrop-blur hover:border-[#f3c866]/50 disabled:opacity-35"
            aria-label="Itens anteriores"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="rounded-full bg-black/60 px-3 py-1 text-[10px] font-semibold text-zinc-300 backdrop-blur">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            className="rounded-full border border-white/15 bg-black/60 p-2.5 text-white backdrop-blur hover:border-[#f3c866]/50 disabled:opacity-35"
            aria-label="Próximos itens"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
