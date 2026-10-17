import React, { useState, useEffect } from 'react';
import { CheckCircle2, RotateCcw, X, Sliders, Move3d, Maximize2, Sparkles, Compass } from 'lucide-react';
import { PlayableBoundary } from '../types';

interface BoundaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  boundary: PlayableBoundary;
  onSaveBoundary: (boundary: PlayableBoundary) => void;
  roomName: string;
}

export const BoundaryModal: React.FC<BoundaryModalProps> = ({
  isOpen,
  onClose,
  boundary,
  onSaveBoundary,
  roomName,
}) => {
  const [x, setX] = useState<number>(boundary.x || 6.0);
  const [y, setY] = useState<number>(boundary.y || 2.8);
  const [z, setZ] = useState<number>(boundary.z || 8.0);
  const [posX, setPosX] = useState<number>(boundary.position?.[0] || 0.0);
  const [posY, setPosY] = useState<number>(boundary.position?.[1] || 0.0);
  const [posZ, setPosZ] = useState<number>(boundary.position?.[2] || 0.0);
  const [activeTab, setActiveTab] = useState<'dimensoes' | 'posicao'>('dimensoes');

  // Sync state if boundary prop changes
  useEffect(() => {
    setX(boundary.x || 6.0);
    setY(boundary.y || 2.8);
    setZ(boundary.z || 8.0);
    setPosX(boundary.position?.[0] || 0.0);
    setPosY(boundary.position?.[1] || 0.0);
    setPosZ(boundary.position?.[2] || 0.0);
  }, [boundary]);

  if (!isOpen) return null;

  const emitLiveUpdate = (
    newX: number,
    newY: number,
    newZ: number,
    newPosX: number,
    newPosY: number,
    newPosZ: number
  ) => {
    onSaveBoundary({
      x: newX,
      y: newY,
      z: newZ,
      position: [newPosX, newPosY, newPosZ],
      isConfirmed: false,
    });
  };

  const handleDimensionChange = (axis: 'x' | 'y' | 'z', val: number) => {
    let nx = x, ny = y, nz = z;
    if (axis === 'x') { nx = val; setX(val); }
    if (axis === 'y') { ny = val; setY(val); }
    if (axis === 'z') { nz = val; setZ(val); }
    emitLiveUpdate(nx, ny, nz, posX, posY, posZ);
  };

  const handlePositionChange = (axis: 'posX' | 'posY' | 'posZ', val: number) => {
    let nx = posX, ny = posY, nz = posZ;
    if (axis === 'posX') { nx = val; setPosX(val); }
    if (axis === 'posY') { ny = val; setPosY(val); }
    if (axis === 'posZ') { nz = val; setPosZ(val); }
    emitLiveUpdate(x, y, z, nx, ny, nz);
  };

  const handleReset = () => {
    setX(6.0);
    setY(2.8);
    setZ(8.0);
    setPosX(0.0);
    setPosY(0.0);
    setPosZ(0.0);
    emitLiveUpdate(6.0, 2.8, 8.0, 0.0, 0.0, 0.0);
  };

  const handleCenter = () => {
    setPosX(0.0);
    setPosY(0.0);
    setPosZ(0.0);
    emitLiveUpdate(x, y, z, 0.0, 0.0, 0.0);
  };

  const handleConfirm = () => {
    onSaveBoundary({
      x,
      y,
      z,
      position: [posX, posY, posZ],
      isConfirmed: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex justify-end items-start p-3 md:p-5 font-sans">
      {/* Non-blocking Live Adjuster Floating Window */}
      <div className="pointer-events-auto relative w-full max-w-sm md:max-w-md bg-[#121317]/95 backdrop-blur-xl border border-[#ffd700]/70 rounded-2xl p-5 shadow-[0_12px_45px_rgba(0,0,0,0.85)] text-[#e8d5b5] flex flex-col gap-4 max-h-[94vh] overflow-y-auto animate-fade-in border-t-2 border-t-[#ffd700]">
        {/* HEADER */}
        <header className="flex items-center justify-between pb-3 border-b border-[#d4af37]/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#ffd700]/15 border border-[#ffd700]/60 flex items-center justify-center text-[#ffd700]">
              <Move3d className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs md:text-sm font-extrabold tracking-wider text-[#ffd700] uppercase">
                Ajustar Delimitador 3D
              </h1>
              <span className="text-[10px] text-[#e8d5b5]/60 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-[#ffd700]" />
                Visualização ao vivo na cena 3D
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg bg-[#ffd700] hover:bg-amber-300 text-black text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-md active:scale-95"
            >
              <span>Confirmar</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-[#d4af37]/70 hover:text-[#ffd700] hover:bg-[#d4af37]/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Real-time Indicator Hint */}
        <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-[#ffd700]/30 text-[11px] text-[#e8d5b5] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#ffd700] animate-ping flex-shrink-0" />
          <span>
            Arraste os controles abaixo e observe a <strong>caixa amarela</strong> se mover e redimensionar diretamente no ambiente 3D ao lado!
          </span>
        </div>

        {/* Tab switch: [ Dimensões (Tamanho) ] [ Posição (Mover na Cena) ] */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/60 rounded-xl border border-[#d4af37]/30 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('dimensoes')}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'dimensoes'
                ? 'bg-[#d4af37] text-black shadow'
                : 'text-[#e8d5b5]/70 hover:text-white'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Dimensões</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('posicao')}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'posicao'
                ? 'bg-[#d4af37] text-black shadow'
                : 'text-[#e8d5b5]/70 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Mover Lugar</span>
          </button>
        </div>

        {/* TAB 1: DIMENSÕES (X, Y, Z) */}
        {activeTab === 'dimensoes' && (
          <div className="space-y-3.5 bg-black/40 border border-[#d4af37]/20 rounded-xl p-3.5">
            {/* Slider X */}
            <div>
              <div className="flex justify-between text-xs text-[#e8d5b5] mb-1">
                <span className="font-semibold">Largura (X)</span>
                <span className="font-mono text-[#ffd700] font-bold">{x.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="25.0"
                step="0.1"
                value={x}
                onChange={(e) => handleDimensionChange('x', parseFloat(e.target.value))}
                className="w-full accent-[#ffd700] cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>

            {/* Slider Y */}
            <div>
              <div className="flex justify-between text-xs text-[#e8d5b5] mb-1">
                <span className="font-semibold">Altura (Y - Teto)</span>
                <span className="font-mono text-[#ffd700] font-bold">{y.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="15.0"
                step="0.1"
                value={y}
                onChange={(e) => handleDimensionChange('y', parseFloat(e.target.value))}
                className="w-full accent-[#ffd700] cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>

            {/* Slider Z */}
            <div>
              <div className="flex justify-between text-xs text-[#e8d5b5] mb-1">
                <span className="font-semibold">Profundidade (Z)</span>
                <span className="font-mono text-[#ffd700] font-bold">{z.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="25.0"
                step="0.1"
                value={z}
                onChange={(e) => handleDimensionChange('z', parseFloat(e.target.value))}
                className="w-full accent-[#ffd700] cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>

            <div className="pt-2 border-t border-[#d4af37]/20 flex items-center justify-between text-[11px] text-[#e8d5b5]/70">
              <span>Volume útil:</span>
              <strong className="text-[#ffd700]">{(x * y * z).toFixed(1)} m³</strong>
            </div>
          </div>
        )}

        {/* TAB 2: MOVER LUGAR (POSIÇÃO X, Y, Z) */}
        {activeTab === 'posicao' && (
          <div className="space-y-3.5 bg-black/40 border border-[#d4af37]/20 rounded-xl p-3.5">
            {/* Slider Pos X */}
            <div>
              <div className="flex justify-between text-xs text-[#e8d5b5] mb-1">
                <span className="font-semibold">Posição X (Esquerda / Direita)</span>
                <span className="font-mono text-[#ffd700] font-bold">{posX > 0 ? `+${posX.toFixed(1)}` : posX.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="-20.0"
                max="20.0"
                step="0.2"
                value={posX}
                onChange={(e) => handlePositionChange('posX', parseFloat(e.target.value))}
                className="w-full accent-[#ffd700] cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>

            {/* Slider Pos Y */}
            <div>
              <div className="flex justify-between text-xs text-[#e8d5b5] mb-1">
                <span className="font-semibold">Posição Y (Elevação do Solo)</span>
                <span className="font-mono text-[#ffd700] font-bold">{posY > 0 ? `+${posY.toFixed(1)}` : posY.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="-5.0"
                max="15.0"
                step="0.1"
                value={posY}
                onChange={(e) => handlePositionChange('posY', parseFloat(e.target.value))}
                className="w-full accent-[#ffd700] cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>

            {/* Slider Pos Z */}
            <div>
              <div className="flex justify-between text-xs text-[#e8d5b5] mb-1">
                <span className="font-semibold">Posição Z (Frente / Fundo)</span>
                <span className="font-mono text-[#ffd700] font-bold">{posZ > 0 ? `+${posZ.toFixed(1)}` : posZ.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="-20.0"
                max="20.0"
                step="0.2"
                value={posZ}
                onChange={(e) => handlePositionChange('posZ', parseFloat(e.target.value))}
                className="w-full accent-[#ffd700] cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>

            <div className="pt-2 border-t border-[#d4af37]/20 flex gap-2">
              <button
                type="button"
                onClick={handleCenter}
                className="flex-1 py-1 px-2 rounded-lg border border-[#d4af37]/40 hover:border-[#ffd700] text-[11px] font-semibold text-[#ffd700] hover:bg-[#d4af37]/10 transition-colors cursor-pointer text-center"
              >
                Centralizar (0, 0, 0)
              </button>
              <button
                type="button"
                onClick={() => handlePositionChange('posY', 0.0)}
                className="flex-1 py-1 px-2 rounded-lg border border-[#d4af37]/40 hover:border-[#ffd700] text-[11px] font-semibold text-[#ffd700] hover:bg-[#d4af37]/10 transition-colors cursor-pointer text-center"
              >
                Alinhar Solo (Y=0)
              </button>
            </div>
          </div>
        )}

        {/* FOOTER ACTIONS */}
        <div className="flex items-center justify-between pt-1 gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="py-2 px-3 rounded-xl border border-[#d4af37]/30 hover:border-[#d4af37] text-xs font-semibold text-[#d4af37] hover:bg-[#d4af37]/10 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resetar Padrão</span>
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-2 px-4 rounded-xl bg-[#ffd700] hover:bg-amber-300 text-black text-xs font-extrabold tracking-wider uppercase transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:scale-98"
          >
            <span>Concluir & Fixar Limite</span>
          </button>
        </div>
      </div>
    </div>
  );
};
