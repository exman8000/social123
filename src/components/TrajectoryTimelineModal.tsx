import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  X,
  Sliders,
  Repeat,
  Compass,
  ArrowRight,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SpotItem, SpotMotionConfig, MotionCurveTrajectory } from '../types';

interface TrajectoryTimelineModalProps {
  spot: SpotItem;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  timelineProgress?: number; // 0.0 to 1.0
  onScrubTimeline?: (progress: number) => void;
  onUpdateMotion: (motion: SpotMotionConfig) => void;
  onClose: () => void;
  isTesting?: boolean;
  onToggleTest?: () => void;
}

export const TrajectoryTimelineModal: React.FC<TrajectoryTimelineModalProps> = ({
  spot,
  isPlaying,
  onTogglePlay,
  timelineProgress,
  onScrubTimeline,
  onUpdateMotion,
  onClose,
  isTesting = true,
  onToggleTest,
}) => {
  const [internalPlaying, setInternalPlaying] = React.useState(true);
  const [internalProgress, setInternalProgress] = React.useState(0);

  const effectivePlaying = isPlaying !== undefined ? isPlaying : internalPlaying;
  const effectiveProgress = timelineProgress !== undefined ? timelineProgress : internalProgress;

  const motion = spot.motion || {
    enabled: true,
    deltaPosition: [0, 0, 3],
    deltaRotation: [0, 0, 0],
    speed: 1.0,
    loop: true,
    target: 'avatar',
  };

  React.useEffect(() => {
    if (!effectivePlaying) return;
    let animId: number;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) * 0.001;
      lastTime = now;
      const spd = motion.speed || 1.0;
      setInternalProgress((prev) => {
        let next = prev + dt * spd * 0.4;
        if (next > 1.0) {
          next = motion.loop ? 0 : 1.0;
        }
        return next;
      });
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [effectivePlaying, motion.speed, motion.loop]);

  const handleTogglePlay = () => {
    if (onTogglePlay) {
      onTogglePlay();
    } else {
      setInternalPlaying((p) => !p);
    }
  };

  const handleScrub = (p: number) => {
    if (onScrubTimeline) {
      onScrubTimeline(p);
    } else {
      setInternalProgress(p);
    }
  };

  const handleUpdate = (partial: Partial<SpotMotionConfig>) => {
    onUpdateMotion({
      ...motion,
      ...partial,
      enabled: true,
    });
  };

  const deltaX = motion.deltaPosition?.[0] || 0;
  const deltaY = motion.deltaPosition?.[1] || 0;
  const deltaZ = motion.deltaPosition?.[2] || 0;
  const turnAngle = motion.turnAngle !== undefined ? motion.turnAngle : (motion.deltaRotation?.[1] || 0);
  const trajectoryType = motion.curveTrajectory || 'linear';

  // Calculate current displacement distance from spot anchor at this progress percentage
  const currentDistMeters = (
    Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ) * effectiveProgress
  ).toFixed(2);
  const totalDistMeters = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ).toFixed(2);

  return (
    <div
      id="trajectory-timeline-modal"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-[800px] bg-[#121318]/95 border-2 border-cyan-400/80 rounded-2xl p-4 shadow-[0_12px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl text-[#e8d5b5] font-sans animate-fade-in select-none ring-2 ring-cyan-500/30"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header: Title, Spot Badge & Close/Stop */}
      <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2.5 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/60 flex items-center justify-center text-cyan-300 shadow-sm">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                <span>Edição de Trajetória & Simulação do Spot</span>
                <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-500/40">
                  {spot.name || 'Spot'}
                </span>
              </h3>
            </div>
            <span className="text-[11px] text-cyan-200/70 block">
              Ponto se desloca a partir do spot · Arraste a linha do tempo ou aperte Play
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/50 text-[11px] font-mono text-emerald-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Deslocamento: {currentDistMeters}m / {totalDistMeters}m</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-500/60 text-red-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Parar teste e ocultar simulação e linha"
          >
            <X className="w-3.5 h-3.5" />
            <span>Parar Teste</span>
          </button>
        </div>
      </div>

      {/* Main Video-Editing Timeline Scrubber Bar */}
      <div className="bg-black/60 border border-cyan-500/40 rounded-xl p-3 mb-3 shadow-inner">
        <div className="flex items-center justify-between text-xs font-mono mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-bold">Timeline da Trajetória:</span>
            <span className="text-white bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/50 font-semibold">
              {Math.round(effectiveProgress * 100)}% ({((effectiveProgress * 2.0) / (motion.speed || 1)).toFixed(2)}s)
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 flex items-center gap-2">
            <span>Início (Spot: 0.0m)</span>
            <ArrowRight className="w-3 h-3 text-cyan-400" />
            <span>Deslocamento Máximo</span>
            {motion.loop && (
              <>
                <ArrowRight className="w-3 h-3 text-cyan-400" />
                <span className="text-amber-300">Retorna ao Spot</span>
              </>
            )}
          </div>
        </div>

        {/* Video Scrubber Controls & Track */}
        <div className="flex items-center gap-3">
          {/* Play / Pause Button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-md flex-shrink-0 ${
              effectivePlaying
                ? 'bg-amber-400 text-black font-bold hover:bg-amber-300'
                : 'bg-cyan-500 text-black font-bold hover:bg-cyan-400'
            }`}
            title={effectivePlaying ? 'Pausar simulação' : 'Dar play na simulação'}
          >
            {effectivePlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
          </button>

          {/* Reset Scrubber to 0% */}
          <button
            type="button"
            onClick={() => handleScrub(0)}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-600 cursor-pointer flex-shrink-0"
            title="Voltar ao início do spot (0%)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Scrubber Range Slider */}
          <div className="relative flex-1 flex items-center">
            {/* Visual Tick Marks */}
            <div className="absolute inset-x-0 h-1 flex justify-between pointer-events-none px-1">
              {[0, 25, 50, 75, 100].map((pct) => (
                <div key={pct} className="w-[1px] h-3 bg-cyan-500/40 -translate-y-1" />
              ))}
            </div>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={effectiveProgress}
              onChange={(e) => handleScrub(parseFloat(e.target.value))}
              className="w-full h-3 bg-[#1e2029] rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-cyan-500/50"
            />
          </div>

          {/* Loop Mode Pill */}
          <button
            type="button"
            onClick={() => handleUpdate({ loop: !motion.loop })}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0 ${
              motion.loop
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm'
                : 'bg-black/50 border-zinc-700 text-zinc-400'
            }`}
            title={motion.loop ? 'Modo Vai e Volta (retorna ao spot)' : 'Executar uma vez'}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>{motion.loop ? 'Vai e Volta' : '1x Só'}</span>
          </button>
        </div>
      </div>

      {/* Trajectory Real-time Sliders & Controls Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        {/* 1. Frente / Trás (Delta Z) */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-semibold">Frente / Trás (Z):</span>
            <span className="font-mono text-cyan-300 font-bold bg-cyan-950/60 px-1.5 rounded border border-cyan-500/30">
              {deltaZ >= 0 ? `+${deltaZ.toFixed(1)}m` : `${deltaZ.toFixed(1)}m`}
            </span>
          </div>
          <input
            type="range"
            min="-10"
            max="10"
            step="0.5"
            value={deltaZ}
            onChange={(e) =>
              handleUpdate({
                deltaPosition: [deltaX, deltaY, parseFloat(e.target.value)],
              })
            }
            className="w-full h-2 bg-[#20222a] rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Trás (-10m)</span>
            <span>Frente (+10m)</span>
          </div>
        </div>

        {/* 2. Altura / Subida (Delta Y) */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-semibold">Altura / Subida (Y):</span>
            <span className="font-mono text-emerald-300 font-bold bg-emerald-950/60 px-1.5 rounded border border-emerald-500/30">
              {deltaY >= 0 ? `+${deltaY.toFixed(1)}m` : `${deltaY.toFixed(1)}m`}
            </span>
          </div>
          <input
            type="range"
            min="-3"
            max="8"
            step="0.25"
            value={deltaY}
            onChange={(e) =>
              handleUpdate({
                deltaPosition: [deltaX, parseFloat(e.target.value), deltaZ],
              })
            }
            className="w-full h-2 bg-[#20222a] rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Desce (-3m)</span>
            <span>Sobe (+8m)</span>
          </div>
        </div>

        {/* 3. Ângulo de Giro / Volta (Rot Y) */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-semibold">Ângulo / Volta:</span>
            <span className="font-mono text-purple-300 font-bold bg-purple-950/60 px-1.5 rounded border border-purple-500/30">
              {Math.round(turnAngle)}°
            </span>
          </div>
          <input
            type="range"
            min="-360"
            max="360"
            step="15"
            value={turnAngle}
            onChange={(e) =>
              handleUpdate({
                turnAngle: parseFloat(e.target.value),
                deltaRotation: [motion.deltaRotation?.[0] || 0, parseFloat(e.target.value), motion.deltaRotation?.[2] || 0],
              })
            }
            className="w-full h-2 bg-[#20222a] rounded-lg appearance-none cursor-pointer accent-purple-400"
          />
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>-360°</span>
            <span>0°</span>
            <span>+360°</span>
          </div>
        </div>

        {/* 4. Velocidade & Curva */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-semibold">Velocidade:</span>
            <span className="font-mono text-[#ffd700] font-bold bg-amber-950/60 px-1.5 rounded border border-amber-500/30">
              {(motion.speed || 1.0).toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="3.5"
            step="0.1"
            value={motion.speed || 1.0}
            onChange={(e) => handleUpdate({ speed: parseFloat(e.target.value) })}
            className="w-full h-2 bg-[#20222a] rounded-lg appearance-none cursor-pointer accent-[#ffd700]"
          />
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Lento (0.2x)</span>
            <span>Rápido (3.5x)</span>
          </div>
        </div>
      </div>

      {/* Trajectory Preset Curve Selector */}
      <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-400 text-[11px] font-semibold">Forma da Linha 3D:</span>
          {(
            [
              { key: 'linear', label: '📏 Reta Direta' },
              { key: 'circle_turn', label: '🔄 Fazer Volta' },
              { key: 'arc', label: '🎢 Curva em Arco' },
              { key: 'spiral', label: '🚀 Subir em Espiral' },
              { key: 'wave', label: '〰️ Ondulação' },
            ] as { key: MotionCurveTrajectory; label: string }[]
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => handleUpdate({ curveTrajectory: item.key })}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                trajectoryType === item.key
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'bg-black/50 text-zinc-400 hover:text-white border border-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
          <span>Origem:</span>
          <span className="text-white font-bold">
            [{spot.position[0]}, {spot.position[1]}, {spot.position[2]}]
          </span>
        </div>
      </div>
    </div>
  );
};
