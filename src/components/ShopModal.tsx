import React from 'react';
import { X, ShoppingBag, Check, Sparkles } from 'lucide-react';
import { ShopItem } from '../types';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopItems: ShopItem[];
  onToggleEquip: (itemId: string) => void;
  onAcquire: (itemId: string) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  isOpen,
  onClose,
  shopItems,
  onToggleEquip,
  onAcquire,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#141519] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-zinc-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 text-amber-400">
            <ShoppingBag className="w-5 h-5" />
            <h2 className="text-lg font-bold tracking-wide text-white">
              Loja 3D &middot; Itens e Acessórios
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subtitle / Empty Attachment rule notice */}
        <p className="text-xs text-zinc-400 mt-3">
          Itens 3D adquiridos são encaixados nos empties do modelo do avatar (cabeça, peito e olhos).
        </p>

        {/* Grid of Items */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4 max-h-[440px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
          {shopItems.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                item.equipped
                  ? 'bg-amber-500/15 border-[#ffd700] ring-1 ring-[#ffd700]/60'
                  : 'bg-[#1a1b22] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <img
                  src={item.thumb}
                  alt={item.name}
                  className="w-16 h-16 rounded-lg object-cover border border-white/10 flex-shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="text-sm font-bold text-zinc-100 truncate">
                      {item.name}
                    </h3>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/50 text-amber-300">
                      {item.category === 'head' ? 'Cabeça' : item.category === 'eyes' ? 'Olhos' : 'Peito'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Adquirir ou Equipar */}
              <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">
                  {item.owned ? (
                    <span className="text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Adquirido
                    </span>
                  ) : (
                    'Grátis (Preview)'
                  )}
                </span>

                {item.owned ? (
                  <button
                    type="button"
                    onClick={() => onToggleEquip(item.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      item.equipped
                        ? 'bg-[#ffd700] text-black hover:bg-amber-300'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                    }`}
                  >
                    {item.equipped ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Equipado</span>
                      </>
                    ) : (
                      <span>Equipar no Avatar</span>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAcquire(item.id)}
                    className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-[#ffd700] hover:from-amber-400 hover:to-amber-300 text-black text-xs font-bold shadow-md transition-transform active:scale-95 cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ADQUIRIR</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
