import React, { useState } from 'react';
import { Coins, Gift, Heart, LoaderCircle, X } from 'lucide-react';
import type { FriendConnection } from '../lib/friends';
import type { RoomStoreProduct } from './RoomStoreShowroom3D';

export type StoreSocialModalState =
  | { type: 'wishlist' }
  | { type: 'friend-gift'; product: RoomStoreProduct }
  | { type: 'user-wishlist'; userId: string; displayName: string };

interface StoreSocialModalProps {
  state: StoreSocialModalState;
  products: RoomStoreProduct[];
  wishlistItemIds: string[];
  friends: FriendConnection[];
  loadingWishlist?: boolean;
  onClose: () => void;
  onPurchase: (productId: string) => Promise<void>;
  onGift: (productId: string, recipientUserId: string, requireWishlist: boolean) => Promise<void>;
  onRemoveWishlistItem: (productId: string) => Promise<void>;
}

export const StoreSocialModal: React.FC<StoreSocialModalProps> = ({
  state,
  products,
  wishlistItemIds,
  friends,
  loadingWishlist = false,
  onClose,
  onPurchase,
  onGift,
  onRemoveWishlistItem,
}) => {
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wishlistProducts = wishlistItemIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is RoomStoreProduct => Boolean(product));

  const runAction = async (key: string, action: () => Promise<void>) => {
    setWorkingId(key);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.');
    } finally {
      setWorkingId(null);
    }
  };

  const title = state.type === 'wishlist'
    ? 'Minha wishlist'
    : state.type === 'friend-gift'
      ? 'Presentear amigo'
      : `Wishlist de ${state.displayName}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-social-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#f3c866]/35 bg-[#141519] text-zinc-100 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="store-social-title" className="flex items-center gap-2 text-base font-bold">
            {state.type === 'wishlist' ? <Heart className="h-4 w-4 text-pink-400" /> : <Gift className="h-4 w-4 text-amber-300" />}
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        {state.type === 'friend-gift' ? (
          <div className="min-h-0 overflow-y-auto p-4">
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
              {state.product.thumbUrl && <img src={state.product.thumbUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{state.product.name}</p>
                <p className="flex items-center gap-1 text-xs text-amber-200">
                  <Coins className="h-3 w-3" />{state.product.price === 0 ? 'Grátis' : `${state.product.price} créditos`}
                </p>
              </div>
            </div>
            <p className="mb-2 text-xs text-zinc-400">Escolha um amigo para receber o item no inventário.</p>
            {friends.length === 0 ? (
              <p className="rounded-lg bg-white/5 p-4 text-center text-sm text-zinc-400">Você ainda não tem amigos com amizade aceita.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {friends.map((friend) => (
                  <div key={friend.userId} className="flex items-center gap-3 py-2">
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold">{friend.displayName.charAt(0)}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{friend.displayName}</p>
                      {friend.username && <p className="truncate text-[10px] text-zinc-400">@{friend.username}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(workingId)}
                      onClick={() => void runAction(friend.userId, () => onGift(state.product.id, friend.userId, false))}
                      className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
                    >
                      {workingId === friend.userId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : 'Presentear'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto p-4">
            {loadingWishlist ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Carregando wishlist…
              </p>
            ) : wishlistProducts.length === 0 ? (
              <p className="rounded-xl bg-white/5 p-5 text-center text-sm text-zinc-400">
                {state.type === 'wishlist' ? 'Você ainda não salvou itens.' : 'Esta pessoa ainda não adicionou presentes à wishlist.'}
              </p>
            ) : (
              <div className="space-y-2">
                {wishlistProducts.map((product) => (
                  <article key={product.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    {product.thumbUrl && <img src={product.thumbUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{product.name}</p>
                      <p className="flex items-center gap-1 text-xs text-amber-200">
                        <Coins className="h-3 w-3" />{product.price === 0 ? 'Grátis' : `${product.price} créditos`}
                      </p>
                    </div>
                    {state.type === 'wishlist' ? (
                      <>
                        <button
                          type="button"
                          disabled={Boolean(workingId) || product.owned}
                          onClick={() => void runAction(product.id, () => onPurchase(product.id))}
                          className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
                        >
                          {workingId === product.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : product.owned ? 'Adquirido' : 'Comprar'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(workingId)}
                          onClick={() => void runAction(`remove-${product.id}`, () => onRemoveWishlistItem(product.id))}
                          aria-label={`Remover ${product.name} da wishlist`}
                          className="rounded-lg p-2 text-pink-300 hover:bg-white/10 disabled:opacity-50"
                        >
                          <Heart className="h-4 w-4 fill-current" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(workingId) || product.owned}
                        onClick={() => void runAction(product.id, () => onGift(product.id, state.userId, true))}
                        className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
                      >
                        {workingId === product.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : product.owned ? 'Já possui' : 'Comprar presente'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="border-t border-rose-400/20 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{error}</p>}
      </section>
    </div>
  );
};
