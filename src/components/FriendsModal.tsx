import React from 'react';
import { X, Users, MessageCircle } from 'lucide-react';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinRoomByName: (roomName: string) => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  onJoinRoomByName,
}) => {
  if (!isOpen) return null;

  const friends = [
    {
      id: 'f1',
      name: 'Maya',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      status: 'No Lounge (Spot 1)',
      room: 'Salão Escarlate',
      online: true,
    },
    {
      id: 'f2',
      name: 'Zack',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
      status: 'No Lounge (Spot 3)',
      room: 'Salão Escarlate',
      online: true,
    },
    {
      id: 'f3',
      name: 'Kenji',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      status: 'Na Sala Serena',
      room: 'Sala Serena',
      online: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-md bg-[#141519] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-zinc-100">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-amber-400">
            <Users className="w-5 h-5" />
            <h2 className="text-base font-bold text-white">Amigos Online (3)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="divide-y divide-white/5 mt-3">
          {friends.map((friend) => (
            <div key={friend.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={friend.avatar}
                    alt={friend.name}
                    className="w-10 h-10 rounded-full object-cover ring-1 ring-[#ffd700]/50"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-black" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">{friend.name}</h3>
                  <p className="text-[11px] text-zinc-400">{friend.status}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onJoinRoomByName(friend.room);
                  onClose();
                }}
                className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Entrar</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
