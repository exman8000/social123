import React, { useState, useRef, useEffect } from 'react';
import {
  Smile,
  Send,
  GripVertical,
  Minus,
  MessageSquare,
  RotateCcw,
  X,
  Maximize2,
  Gift,
} from 'lucide-react';
import { ChatMessage } from '../types';

interface GlassChatProps {
  roomName: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  // Mobile dock mode: always expanded, closed by the parent dock
  embedded?: boolean;
  onClose?: () => void;
  currentUserId?: string;
  onViewUserWishlist?: (userId: string, displayName: string) => void;
}

export const GlassChat: React.FC<GlassChatProps> = ({
  roomName,
  messages,
  onSendMessage,
  embedded = false,
  onClose,
  currentUserId,
  onViewUserWishlist,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Minimization state: starts minimized on small mobile screens to keep the 3D room clean!
  const [isMinimizedState, setIsMinimized] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.innerWidth < 640;
  });
  const isMinimized = embedded ? false : isMinimizedState;

  // Free dragging position on screen
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  const chatCardRef = useRef<HTMLDivElement>(null);

  // iOS Safari doesn't resize the layout on keyboard open; track the visual viewport instead
  const [kbOffset, setKbOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const off = window.innerHeight - vv.height - vv.offsetTop;
      setKbOffset(off > 80 ? off : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  useEffect(() => {
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized]);

  // Mouse Drag handlers
  const handleMouseDownHeader = (e: React.MouseEvent) => {
    // Ignore clicks on buttons inside header
    if ((e.target as HTMLElement).closest('button')) return;

    const card = chatCardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: rect.left,
      startY: rect.top,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.mouseX;
      const dy = moveEvent.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(10, Math.min(window.innerWidth - rect.width - 10, dragStartRef.current.startX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - rect.height - 10, dragStartRef.current.startY + dy));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Touch Drag handlers for mobile
  const handleTouchStartHeader = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.touches.length !== 1) return;

    const card = chatCardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const touch = e.touches[0];
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: touch.clientX,
      mouseY: touch.clientY,
      startX: rect.left,
      startY: rect.top,
    };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (!isDraggingRef.current || moveEvent.touches.length !== 1) return;
      const t = moveEvent.touches[0];
      const dx = t.clientX - dragStartRef.current.mouseX;
      const dy = t.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(8, Math.min(window.innerWidth - rect.width - 8, dragStartRef.current.startX + dx));
      const newY = Math.max(8, Math.min(window.innerHeight - rect.height - 8, dragStartRef.current.startY + dy));

      setPosition({ x: newX, y: newY });
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
  };

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPosition(null);
  };

  // Minimized floating chat pill
  if (isMinimized) {
    return (
      <div
        ref={chatCardRef}
        style={position ? { left: `${position.x}px`, top: `${position.y}px`, position: 'fixed' } : undefined}
        className={
          position
            ? 'z-40 pointer-events-auto select-none'
            : 'fixed top-20 right-4 sm:right-6 z-40 pointer-events-auto select-none'
        }
      >
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#16171a]/95 hover:bg-[#202228] border border-white/20 text-white shadow-2xl backdrop-blur-xl cursor-pointer transition-all hover:scale-105 active:scale-95 group"
          title="Clique para abrir o Chat"
        >
          <div className="relative">
            <MessageSquare className="w-4 h-4 text-[#ffd700]" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <span className="text-xs font-semibold tracking-wide">
            Chat ({messages.length})
          </span>
          <span className="text-[10px] text-zinc-400 group-hover:text-white">
            Abrir
          </span>
        </button>
      </div>
    );
  }

  // Expanded chat box with draggable header
  return (
    <div
      ref={chatCardRef}
      id="glass-chat-panel"
      className={`${
        position ? 'z-40' : `fixed z-40 ${embedded ? 'bottom-16' : 'bottom-2'} inset-x-2 sm:inset-x-auto sm:bottom-auto sm:top-20 sm:right-6`
      } sm:w-80 bg-[#16171acc]/95 backdrop-blur-2xl rounded-2xl border border-white/15 p-2.5 sm:p-3.5 shadow-2xl flex flex-col justify-between text-white font-sans max-h-[42dvh] sm:max-h-[480px] pointer-events-auto select-none transition-shadow ${
        position ? 'w-[min(calc(100vw-24px),20rem)]' : ''
      }`}
      style={
        position
          ? { left: `${position.x}px`, top: `${position.y}px`, position: 'fixed' }
          : kbOffset > 0
          ? { bottom: kbOffset + 8 }
          : undefined
      }
    >
      {/* Draggable Chat Header */}
      <div
        onMouseDown={handleMouseDownHeader}
        onTouchStart={handleTouchStartHeader}
        className="pb-2.5 border-b border-white/10 flex items-center justify-between cursor-grab active:cursor-grabbing group select-none touch-none"
        title="Arraste para mover o chat livremente na tela"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="w-4 h-4 text-zinc-500 group-hover:text-[#ffd700] transition-colors flex-shrink-0" />
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100 truncate">
            Sala {roomName}
          </h2>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {position && (
            <button
              type="button"
              onClick={handleResetPosition}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Voltar chat à posição padrão"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => (embedded && onClose ? onClose() : setIsMinimized(true))}
            className="p-1 rounded text-zinc-400 hover:text-[#ffd700] hover:bg-white/10 transition-colors cursor-pointer"
            title="Minimizar chat (deixar tela limpa)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto py-2 space-y-3 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 min-h-[60px] sm:min-h-[120px]">
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2.5 group">
            {msg.avatarUrl ? (
              <img
                src={msg.avatarUrl}
                alt={msg.user}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover ring-1 ring-white/15 flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-700 ring-1 ring-white/15 flex items-center justify-center text-xs font-semibold text-zinc-200 flex-shrink-0"
              >
                {msg.user.trim().charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[11px] font-semibold text-[#facc15] tracking-wide truncate">
                  {msg.user}
                </span>
                {msg.senderUserId && msg.senderUserId !== currentUserId && onViewUserWishlist && (
                  <button
                    type="button"
                    onClick={() => onViewUserWishlist(msg.senderUserId!, msg.user)}
                    aria-label={`Ver wishlist de ${msg.user}`}
                    title={`Ver wishlist de ${msg.user}`}
                    className="rounded p-0.5 text-pink-300 transition-colors hover:bg-pink-400/10 hover:text-pink-200"
                  >
                    <Gift className="h-3.5 w-3.5" />
                  </button>
                )}
                {msg.username && (
                  <span className="ml-1 text-[9px] text-zinc-400 truncate">@{msg.username}</span>
                )}
                <span className="text-[9px] text-zinc-400 select-none">
                  {msg.time}
                </span>
              </div>
              <p className="text-xs text-zinc-200 leading-snug break-words">
                {msg.text}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="pt-2 border-t border-white/5">
        <div className="relative flex items-center bg-[#212328]/90 rounded-xl border border-white/10 px-2.5 py-1.5 focus-within:border-[#ffd700]/50 transition-colors">
          <input
            id="chat-message-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Digite uma mensagem..."
            className="w-full bg-transparent text-base sm:text-xs text-white placeholder:text-zinc-500 outline-none pr-12"
          />
          <div className="absolute right-1.5 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setInputText((prev) => prev + ' 😊')}
              className="p-1 text-zinc-400 hover:text-[#ffd700] transition-colors cursor-pointer"
              title="Inserir emoji"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="Enviar mensagem"
            >
              <Send className="w-3.5 h-3.5 text-[#ffd700]" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
