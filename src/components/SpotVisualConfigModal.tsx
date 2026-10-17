import React from 'react';
import {
  X,
  Sliders,
  Check,
  Sparkles,
  ArrowDown,
  Eye,
  Radio,
  Maximize2,
  CircleDot,
} from 'lucide-react';
import { SpotVisualConfig, SpotVisualIndicatorStyle } from '../types';

interface SpotVisualConfigModalProps {
  isOpen?: boolean;
  onClose: () => void;
  config: SpotVisualConfig;
  onChangeConfig: (newConfig: SpotVisualConfig) => void;
}

export const SpotVisualConfigModal: React.FC<SpotVisualConfigModalProps> = ({
  isOpen = true,
  onClose,
  config,
  onChangeConfig,
}) => {
  if (!isOpen) return null;

  const styleOptions: {
    id: SpotVisualIndicatorStyle;
    title: string;
    desc: string;
    badgeColor: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'white_pulse',
      title: 'Sinalização Branca Piscando + Ponto',
      desc: 'Anel branco com pulsação suave e ponto luminoso no centro do spot.',
      badgeColor: 'text-white bg-white/10 border-white/30',
      icon: <CircleDot className="w-4 h-4 text-white animate-pulse" />,
    },
    {
      id: 'yellow_gold',
      title: 'Sinalização Amarela / Ouro',
      desc: 'Disco e anel dourado clássico com halo suave no chão.',
      badgeColor: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
      icon: <span className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-md" />,
    },
    {
      id: 'arrow_only',
      title: 'Apenas Seta Indicadora',
      desc: 'Mostra apenas a seta suspensa que aponta para baixo e indica a orientação do avatar.',
      badgeColor: 'text-cyan-300 bg-cyan-500/10 border-cyan-400/30',
      icon: <ArrowDown className="w-4 h-4 text-cyan-400 animate-bounce" />,
    },
    {
      id: 'pillar',
      title: 'Pilar de Luz Pulsante',
      desc: 'Coluna de luz translúcida que pulsa sobre o spot, em vez da seta. Só estética.',
      badgeColor: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-400/30',
      icon: <span className="w-1.5 h-4 rounded-sm bg-gradient-to-t from-amber-400 to-transparent animate-pulse" />,
    },
    {
      id: 'full',
      title: 'Completo (Sinalização + Seta)',
      desc: 'Exibe tanto a sinalização no chão quanto a seta indicadora suspensa.',
      badgeColor: 'text-[#ffd700] bg-[#d4af37]/15 border-[#ffd700]/40',
      icon: <Sparkles className="w-4 h-4 text-[#ffd700]" />,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#121318] border-2 border-[#d4af37]/60 rounded-2xl p-5 shadow-[0_15px_50px_rgba(0,0,0,0.9)] text-[#e8d5b5] font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#d4af37]/25 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/50 flex items-center justify-center text-[#ffd700]">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Configuração de Visualização dos Spots
              </h2>
              <p className="text-xs text-[#d4af37]/75">
                Escolha o estilo e tamanho dos marcadores 3D
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Style Selection Cards */}
        <div className="space-y-2 mb-4">
          <label className="text-xs font-semibold text-[#ffd700] block mb-1">
            Estilo de Sinalização do Spot:
          </label>
          {styleOptions.map((opt) => {
            const isSelected = config.indicatorStyle === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() =>
                  onChangeConfig({
                    ...config,
                    indicatorStyle: opt.id,
                  })
                }
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#d4af37]/15 border-[#ffd700] shadow-[0_0_15px_rgba(212,175,55,0.2)] ring-1 ring-[#ffd700]'
                    : 'bg-black/40 border-white/10 hover:border-[#d4af37]/40 hover:bg-white/5'
                }`}
              >
                <div className="pt-0.5">{opt.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${
                        isSelected ? 'text-[#ffd700]' : 'text-zinc-200'
                      }`}
                    >
                      {opt.title}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-[#ffd700]" />}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{opt.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sliders for Sizing */}
        <div className="bg-black/50 border border-white/10 rounded-xl p-3.5 space-y-3.5 mb-5">
          {/* Arrow Size Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <ArrowDown className="w-3.5 h-3.5 text-cyan-400" />
                Tamanho da Seta Indicadora:
              </span>
              <span className="font-mono text-cyan-300 font-bold bg-black/60 px-2 py-0.5 rounded border border-cyan-500/30">
                {Math.round(config.arrowScale * 100)}% ({config.arrowScale.toFixed(2)}x)
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={config.arrowScale}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  arrowScale: parseFloat(e.target.value),
                })
              }
              className="w-full h-2 bg-[#20222a] rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
              <span>Pequena (50%)</span>
              <span>Padrão (100%)</span>
              <span>Grande (250%)</span>
            </div>
          </div>

          {/* Floor Signal Size Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5 text-amber-400" />
                Tamanho da Sinalização no Chão:
              </span>
              <span className="font-mono text-amber-300 font-bold bg-black/60 px-2 py-0.5 rounded border border-amber-500/30">
                {Math.round(config.signalScale * 100)}% ({config.signalScale.toFixed(2)}x)
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={config.signalScale}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  signalScale: parseFloat(e.target.value),
                })
              }
              className="w-full h-2 bg-[#20222a] rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
              <span>Discreta (50%)</span>
              <span>Padrão (100%)</span>
              <span>Ampla (250%)</span>
            </div>
          </div>
          {/* Hide spot names toggle */}
          <label className="flex items-center justify-between gap-3 cursor-pointer text-xs">
            <span className="font-semibold text-zinc-300">
              Ocultar nomes dos spots (mostra só ao passar o mouse)
            </span>
            <input
              type="checkbox"
              checked={!!config.hideSpotNames}
              onChange={(e) => onChangeConfig({ ...config, hideSpotNames: e.target.checked })}
              className="w-4 h-4 accent-cyan-400 cursor-pointer"
            />
          </label>
          {/* Relative Surface Spot Radius Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                Raio do Spot Relativo / Cursor na Superfície:
              </span>
              <span className="font-mono text-purple-300 font-bold bg-black/60 px-2 py-0.5 rounded border border-purple-500/30">
                {(config.relativeSpotRadius || 0.12).toFixed(2)}m ({Math.round(((config.relativeSpotRadius || 0.12) * 100))}cm)
              </span>
            </div>
            <input
              type="range"
              min="0.04"
              max="0.45"
              step="0.01"
              value={config.relativeSpotRadius || 0.12}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  relativeSpotRadius: parseFloat(e.target.value),
                })
              }
              className="w-full h-2 bg-[#20222a] rounded-lg appearance-none cursor-pointer accent-purple-400"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
              <span>Super Fino / Preciso (0.04m)</span>
              <span>Médio (0.15m)</span>
              <span>Amplo (0.45m)</span>
            </div>
          </div>
        </div>

        {/* Footer Apply Button */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              onChangeConfig({
                indicatorStyle: 'full',
                arrowScale: 1.0,
                signalScale: 1.0,
                relativeSpotRadius: 0.12,
                hideSpotNames: false,
              })
            }
            className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
          >
            Restaurar Padrão
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#ffd700] to-[#e2bd44] text-black font-bold text-xs shadow-md hover:brightness-110 cursor-pointer transition-all"
          >
            Concluir & Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};
