import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Ruler,
  Check,
  Maximize2,
  Minimize2,
  Minus,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  METRIC_PRESETS,
  METRIC_CATEGORIES,
  MetricCategory,
  MetricPresetItem,
  calculatePresetScale,
} from '../types/metricPresets';
import { PlayableBoundary } from '../types';

interface MetricSizeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  rawHeight: number; // Raw unscaled bounding box height in meters (e.g. 0.93)
  rawWidth?: number;
  rawDepth?: number;
  currentScale: number; // Current multiplier (e.g. 1.0 or 3.01)
  onApplyScale: (newScale: number, preset?: MetricPresetItem) => void;
  onApplyBoundary?: (boundary: PlayableBoundary) => void;
  currentBoundary?: PlayableBoundary;
}

export const MetricSizeSelectorModal: React.FC<MetricSizeSelectorModalProps> = ({
  isOpen,
  onClose,
  targetName,
  rawHeight,
  rawWidth = 1.0,
  rawDepth = 1.0,
  currentScale,
  onApplyScale,
  onApplyBoundary,
  currentBoundary,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [customTargetHeight, setCustomTargetHeight] = useState<string>('');
  const [syncBoundaryWithPreset, setSyncBoundaryWithPreset] = useState<boolean>(true);
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);

  // Safe raw height (avoid division by 0)
  const safeRawHeight = useMemo(() => {
    return Math.max(0.001, Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1.0);
  }, [rawHeight]);

  // Current real height (rawHeight * currentScale)
  const currentRealHeight = safeRawHeight * currentScale;

  // Filtered presets
  const filteredPresets = useMemo(() => {
    return METRIC_PRESETS.filter((preset) => {
      const matchesCategory =
        selectedCategory === 'all' || preset.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        preset.name.toLowerCase().includes(q) ||
        (preset.tip && preset.tip.toLowerCase().includes(q)) ||
        preset.targetHeight.toString().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  if (!isOpen) return null;

  // Minimized floating HUD Widget
  if (isMinimized) {
    return (
      <div className="fixed bottom-14 right-6 z-50 bg-[#121317]/95 border border-[#d4af37] rounded-xl px-4 py-2.5 shadow-[0_10px_35px_rgba(0,0,0,0.9)] backdrop-blur-md flex items-center gap-3 text-xs text-[#ffd700] animate-fade-in font-sans">
        <div className="w-7 h-7 rounded-lg bg-[#d4af37]/20 border border-[#d4af37]/60 flex items-center justify-center text-[#ffd700]">
          <Ruler className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-[#ffd700] max-w-[180px] truncate">
            {targetName || 'Seletor de Tamanho'}
          </span>
          <span className="text-[10px] text-[#e8d5b5]/70 font-mono">
            BBox: {safeRawHeight.toFixed(2)}m · Real: {currentRealHeight.toFixed(2)}m
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="px-2.5 py-1 bg-[#d4af37]/20 hover:bg-[#d4af37] hover:text-black rounded text-[11px] font-semibold text-[#ffd700] border border-[#d4af37]/50 transition-colors cursor-pointer flex items-center gap-1"
          title="Restaurar Seletor de Tamanho"
        >
          <Maximize2 className="w-3 h-3" />
          <span>Restaurar</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-[#d4af37]/60 hover:text-red-400 hover:bg-white/5 cursor-pointer transition-colors"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const handleSelectPreset = (preset: MetricPresetItem) => {
    const scale = calculatePresetScale(safeRawHeight, preset.targetHeight);
    setAppliedPresetId(preset.id);
    onApplyScale(scale, preset);

    if (syncBoundaryWithPreset && preset.boundary && onApplyBoundary) {
      onApplyBoundary({
        x: preset.boundary.x,
        y: preset.boundary.y,
        z: preset.boundary.z,
        isConfirmed: true,
      });
    }

    setTimeout(() => {
      onClose();
    }, 350);
  };

  const handleApplyCustomHeight = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(customTargetHeight.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      const scale = calculatePresetScale(safeRawHeight, parsed);
      onApplyScale(scale);
      setTimeout(() => {
        onClose();
      }, 250);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-6 animate-fade-in font-sans">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-[#121317] border border-[#d4af37]/60 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.95)] text-[#e8d5b5] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#d4af37]/30 bg-[#16181f]/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/70 flex items-center justify-center text-[#ffd700] shadow-inner">
              <Ruler className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base md:text-xl font-extrabold text-[#ffd700] tracking-wide flex items-center gap-2">
                <span>SELETOR DE TAMANHO & MÉTRICA 1:1</span>
              </h2>
              <p className="text-xs md:text-sm text-[#e8d5b5]/80">
                Ajuste automático de escala real pelo modelo 3D (alvo / altura do arquivo)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-2 rounded-lg text-[#d4af37]/70 hover:text-[#ffd700] hover:bg-[#d4af37]/15 transition-colors cursor-pointer"
              title="Minimizar janela"
            >
              <Minus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-[#d4af37]/70 hover:text-[#ffd700] hover:bg-[#d4af37]/15 transition-colors cursor-pointer"
              title="Fechar janela"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Live File Dimensions HUD Banner */}
        <div className="px-6 py-3.5 bg-black/50 border-b border-[#d4af37]/25 flex flex-wrap items-center justify-between gap-4 text-xs md:text-sm">
          <div className="flex items-center gap-2.5">
            <span className="text-[#ffd700] font-bold text-sm">Alvo Selecionado:</span>
            <span className="font-extrabold text-[#ffd700] bg-[#1a1c24] px-3 py-1 rounded-md border border-[#d4af37]/50 max-w-[280px] truncate text-sm">
              {targetName || 'Objeto 3D'}
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono text-xs md:text-sm">
            <div className="flex items-center gap-2 bg-[#14161d] px-3 py-1.5 rounded-lg border border-[#d4af37]/40 shadow-inner">
              <span className="text-[#e8d5b5]/70">Altura do Arquivo (BBox):</span>
              <span className="text-sky-300 font-extrabold">{safeRawHeight.toFixed(2)} m</span>
            </div>
            <div className="flex items-center gap-2 bg-[#14161d] px-3 py-1.5 rounded-lg border border-[#d4af37]/40 shadow-inner">
              <span className="text-[#e8d5b5]/70">Escala Atual:</span>
              <span className="text-amber-300 font-extrabold">{currentScale.toFixed(2)}x</span>
              <span className="text-[#e8d5b5]/60">({currentRealHeight.toFixed(2)} m)</span>
            </div>
          </div>
        </div>

        {/* Category Tabs & Search Bar */}
        <div className="p-4 border-b border-[#d4af37]/20 space-y-3 bg-[#14161d]/50">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#d4af37]/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar preset (ex: teto, casa, sofá, abajur, carro, prédio, estádio, avatar)..."
              className="w-full bg-[#181a22] border border-[#d4af37]/40 rounded-xl pl-9 pr-4 py-2 text-xs text-[#e8d5b5] placeholder:text-[#e8d5b5]/35 outline-none focus:border-[#ffd700]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#d4af37]/60 hover:text-[#ffd700]"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-[#d4af37] text-black font-bold shadow'
                  : 'bg-[#1a1c24] text-[#e8d5b5]/80 hover:bg-[#d4af37]/20 hover:text-[#ffd700]'
              }`}
            >
              🌟 Todos ({METRIC_PRESETS.length})
            </button>
            {METRIC_CATEGORIES.map((cat) => {
              const count = METRIC_PRESETS.filter((p) => p.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedCategory === cat.id
                      ? 'bg-[#d4af37] text-black font-bold shadow'
                      : 'bg-[#1a1c24] text-[#e8d5b5]/80 hover:bg-[#d4af37]/20 hover:text-[#ffd700]'
                  }`}
                  title={cat.description}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Presets Grid Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-h-[50vh]">
          {filteredPresets.length === 0 ? (
            <div className="text-center py-12 text-[#e8d5b5]/50 text-xs">
              Nenhum preset encontrado para "{searchQuery}".
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredPresets.map((preset) => {
                const multiplier = calculatePresetScale(safeRawHeight, preset.targetHeight);
                const isSelected = appliedPresetId === preset.id;
                const isRoomCategory = preset.category === 'rooms' || !!preset.boundary;

                return (
                  <div
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`group relative p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#d4af37]/25 border-[#ffd700] ring-2 ring-[#ffd700] shadow-xl'
                        : 'bg-[#161820] border-[#d4af37]/30 hover:border-[#ffd700] hover:bg-[#1d202c]'
                    }`}
                  >
                    <div>
                      {/* Header row: Icon, Name & Multiplier */}
                      <div className="flex items-start justify-between gap-2.5 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{preset.icon || '📐'}</span>
                          <span className="font-extrabold text-sm md:text-base text-[#e8d5b5] group-hover:text-[#ffd700] transition-colors leading-snug">
                            {preset.name}
                          </span>
                        </div>
                        <div className="font-mono text-xs md:text-sm font-extrabold px-2.5 py-0.5 rounded-md bg-black/70 text-[#ffd700] border border-[#d4af37]/50 whitespace-nowrap shadow-inner">
                          × {multiplier.toFixed(2)}
                        </div>
                      </div>

                      {/* Target height & Dimensions */}
                      <div className="space-y-1.5 text-xs md:text-sm">
                        <div className="flex items-center justify-between text-[#e8d5b5]/90 font-medium">
                          <span>Altura Alvo:</span>
                          <span className="font-mono font-bold text-emerald-400 text-sm">
                            {preset.targetHeight.toFixed(2)} m
                          </span>
                        </div>

                        {preset.baseDimensions && (
                          <div className="flex items-center justify-between text-[#e8d5b5]/70 text-xs">
                            <span>Base:</span>
                            <span className="font-mono font-medium">{preset.baseDimensions}</span>
                          </div>
                        )}

                        {preset.capacity && (
                          <div className="flex items-center justify-between text-sky-400 text-xs font-medium">
                            <span>Capacidade:</span>
                            <span>{preset.capacity}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Tip & Click Action */}
                    <div className="mt-3.5 pt-2.5 border-t border-[#d4af37]/20 flex items-center justify-between text-xs">
                      <span className="text-[#e8d5b5]/70 truncate max-w-[170px]" title={preset.tip}>
                        {preset.tip}
                      </span>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-[#d4af37]/20 text-[#ffd700] font-bold group-hover:bg-[#d4af37] group-hover:text-black transition-colors flex items-center gap-1.5 shadow-sm text-xs"
                      >
                        <span>Aplicar</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom Height Formula Box (Manual Input) */}
          <div className="mt-4 p-4 rounded-xl bg-black/50 border border-[#d4af37]/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#ffd700]" />
                <h3 className="text-xs font-bold uppercase text-[#ffd700] tracking-wider">
                  Altura Personalizada (Fórmula: escala = alvo / {safeRawHeight.toFixed(2)}m)
                </h3>
              </div>
              <span className="text-[10px] text-[#e8d5b5]/60">Digite qualquer altura em metros</span>
            </div>

            <form onSubmit={handleApplyCustomHeight} className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Ex: 2.80 ou 5.00 ou 20.0"
                  value={customTargetHeight}
                  onChange={(e) => setCustomTargetHeight(e.target.value)}
                  className="w-full bg-[#181a22] border border-[#d4af37]/40 rounded-lg px-3 py-2 text-xs text-[#e8d5b5] placeholder:text-[#e8d5b5]/30 outline-none focus:border-[#ffd700] font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#d4af37]/70">
                  metros
                </span>
              </div>

              {customTargetHeight && !isNaN(parseFloat(customTargetHeight.replace(',', '.'))) && (
                <div className="px-3 py-1.5 rounded bg-[#1c1f28] border border-[#d4af37]/30 text-xs font-mono text-[#ffd700]">
                  = ×{' '}
                  {calculatePresetScale(
                    safeRawHeight,
                    parseFloat(customTargetHeight.replace(',', '.'))
                  ).toFixed(2)}
                </div>
              )}

              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#ffd700] text-black font-extrabold text-xs hover:brightness-110 cursor-pointer shadow flex items-center gap-1.5 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aplicar Altura</span>
              </button>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#d4af37]/20 bg-[#16181f]/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          {onApplyBoundary && (
            <label className="flex items-center gap-2 cursor-pointer text-[#e8d5b5]/80 hover:text-[#ffd700]">
              <input
                type="checkbox"
                checked={syncBoundaryWithPreset}
                onChange={(e) => setSyncBoundaryWithPreset(e.target.checked)}
                className="accent-[#d4af37] w-3.5 h-3.5 rounded cursor-pointer"
              />
              <span className="text-[11px]">
                Ao escolher Room / Casa / Macro: atualizar também caixa limite jogável da sala (X × Z × Y)
              </span>
            </label>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-[#d4af37]/40 text-[#e8d5b5]/70 hover:text-[#ffd700] hover:border-[#ffd700] text-xs transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
