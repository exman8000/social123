import React from 'react';
import { DoorOpen, LogIn, Send, Users, X } from 'lucide-react';

export interface OnlineFriend {
  userId: string;
  displayName: string;
  roomId: string | null;
  roomName: string | null;
  isGuest: boolean;
}

export interface RoomInvite {
  senderName: string;
  roomId: string;
  roomName: string;
}

interface FriendsModalProps {
  isOpen: boolean;
  friends: OnlineFriend[];
  connectionError: string | null;
  invite: RoomInvite | null;
  onClose: () => void;
  onInviteFriend: (friend: OnlineFriend) => void;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  friends,
  connectionError,
  invite,
  onClose,
  onInviteFriend,
  onAcceptInvite,
  onDeclineInvite,
}) => {
  if (!isOpen && !invite) return null;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="friends-modal-title"
            className="relative w-full max-w-md rounded-2xl border border-amber-500/40 bg-[#141519] p-6 text-zinc-100 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Users className="h-5 w-5" />
                <h2 id="friends-modal-title" className="text-base font-bold text-white">
                  Pessoas online ({friends.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Fechar lista de pessoas online"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {connectionError ? (
              <p role="alert" className="py-8 text-center text-sm text-rose-300">
                {connectionError}
              </p>
            ) : friends.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">
                Ninguém mais está online no momento.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-white/5">
                {friends.map((friend) => (
                  <div key={friend.userId} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 font-bold text-amber-200 ring-1 ring-amber-400/50">
                        {friend.displayName.slice(0, 1).toLocaleUpperCase()}
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#141519]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-xs font-bold text-white">
                          {friend.displayName}{friend.isGuest ? ' (visitante)' : ''}
                        </h3>
                        <p className="truncate text-[11px] text-zinc-400">
                          {friend.roomName ? `Em ${friend.roomName}` : 'No lobby'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onInviteFriend(friend)}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/30"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Convidar</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {invite && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-invite-title"
            className="w-full max-w-sm rounded-2xl border border-amber-400/50 bg-[#141519] p-6 text-zinc-100 shadow-2xl"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                <DoorOpen className="h-5 w-5" />
              </div>
              <div>
                <h2 id="room-invite-title" className="font-bold text-white">
                  Convite para uma sala
                </h2>
                <p className="text-xs text-zinc-400">{invite.senderName} convidou você</p>
              </div>
            </div>
            <p className="mb-5 text-sm text-zinc-300">{invite.roomName}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onDeclineInvite}
                className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5"
              >
                Agora não
              </button>
              <button
                type="button"
                onClick={onAcceptInvite}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black hover:bg-amber-400"
              >
                <LogIn className="h-3.5 w-3.5" />
                Entrar na sala
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
