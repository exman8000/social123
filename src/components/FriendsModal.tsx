import React, { useMemo, useState } from 'react';
import { Check, Clock3, MessageCircle, Plus, Users, X } from 'lucide-react';
import { CreatorUser } from '../types';
import { FriendConnection } from '../lib/friends';

export interface OnlineLobbyUser {
  sessionId: string;
  userId?: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  roomId?: string;
  roomName?: string;
}

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: CreatorUser | null;
  onlineUsers: OnlineLobbyUser[];
  friends: FriendConnection[];
  isLoadingFriends: boolean;
  currentRoomName?: string;
  onAddFriend: (userId: string) => Promise<void>;
  onInviteToRoom: (onlineUser: OnlineLobbyUser) => void;
}

const fallbackAvatar =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  user,
  onlineUsers,
  friends,
  isLoadingFriends,
  currentRoomName,
  onAddFriend,
  onInviteToRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'online' | 'friends'>('online');
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const friendsById = useMemo(() => new Map(friends.map((friend) => [friend.userId, friend])), [friends]);

  if (!isOpen) return null;
  const visibleUsers = activeTab === 'friends'
    ? onlineUsers.filter((onlineUser) => onlineUser.userId && friendsById.get(onlineUser.userId)?.status === 'accepted')
    : onlineUsers;

  const handleAddFriend = async (userId: string) => {
    setWorkingUserId(userId);
    setError(null);
    try {
      await onAddFriend(userId);
    } catch (cause) {
      console.error('Could not update friend connection:', cause);
      setError('Não foi possível atualizar a amizade. Tente novamente.');
    } finally {
      setWorkingUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="friends-modal-title"
        className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-amber-500/40 bg-[#141519] p-5 text-zinc-100 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-amber-400">
            <Users className="h-5 w-5" />
            <h2 id="friends-modal-title" className="text-base font-bold text-white">Pessoas online</h2>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
              {onlineUsers.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar amigos"
            className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('online')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === 'online' ? 'bg-amber-400 text-black' : 'bg-white/5 text-zinc-300'}`}
          >
            Todos online
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === 'friends' ? 'bg-amber-400 text-black' : 'bg-white/5 text-zinc-300'}`}
          >
            Amigos online
          </button>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-200">{error}</p>}
        {isLoadingFriends && <p className="py-5 text-center text-xs text-zinc-400">Carregando amizades…</p>}
        <div className="mt-2 min-h-0 divide-y divide-white/5 overflow-y-auto">
          {!isLoadingFriends && visibleUsers.length === 0 && (
            <p className="py-8 text-center text-xs text-zinc-400">
              {activeTab === 'friends' ? 'Nenhum amigo está online agora.' : 'Ninguém online no momento.'}
            </p>
          )}
          {visibleUsers.map((onlineUser) => {
            const connection = onlineUser.userId ? friendsById.get(onlineUser.userId) : undefined;
            const isFriend = connection?.status === 'accepted';
            const incomingRequest = connection?.status === 'pending' && connection.requestedBy !== user?.id;
            const outgoingRequest = connection?.status === 'pending' && connection.requestedBy === user?.id;
            const isSelf = Boolean(user && onlineUser.userId === user.id);
            return (
              <article key={onlineUser.sessionId} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={onlineUser.avatarUrl || fallbackAvatar}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover ring-1 ring-amber-400/50"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#141519]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-bold text-white">{onlineUser.displayName}</h3>
                    <p className="truncate text-[11px] text-zinc-400">
                      {onlineUser.username ? `@${onlineUser.username} · ` : ''}
                      {onlineUser.roomName || 'No saguão'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {onlineUser.userId && !isSelf && (
                    <button
                      type="button"
                      disabled={workingUserId === onlineUser.userId || isFriend || outgoingRequest}
                      onClick={() => void handleAddFriend(onlineUser.userId!)}
                      title={isFriend ? 'Já é seu amigo' : outgoingRequest ? 'Solicitação enviada' : incomingRequest ? 'Aceitar solicitação' : 'Adicionar amigo'}
                      aria-label={isFriend ? `Amigo: ${onlineUser.displayName}` : outgoingRequest ? `Solicitação enviada para ${onlineUser.displayName}` : incomingRequest ? `Aceitar solicitação de ${onlineUser.displayName}` : `Adicionar ${onlineUser.displayName}`}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                        isFriend
                          ? 'border-emerald-500/30 text-emerald-300'
                          : 'border-amber-400/40 text-amber-300 hover:bg-amber-400/15 disabled:opacity-40'
                      }`}
                    >
                      {isFriend ? <Check className="h-4 w-4" /> : outgoingRequest ? <Clock3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </button>
                  )}
                  {currentRoomName && !isSelf && (
                    <button
                      type="button"
                      onClick={() => onInviteToRoom(onlineUser)}
                      title={`Convidar para ${currentRoomName}`}
                      className="flex h-8 items-center gap-1 rounded-lg bg-amber-500/20 px-2 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/30"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Convidar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
