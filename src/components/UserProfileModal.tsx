import React, { useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, UserRound, X } from 'lucide-react';
import { CreatorUser } from '../types';
import { supabase } from '../lib/supabase';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: CreatorUser | null;
  onProfileUpdated: (user: CreatorUser) => void;
  onOpenAuth: () => void;
}

const DEFAULT_PROFILE_PHOTO =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onProfileUpdated,
  onOpenAuth,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    setDisplayName(user.displayName);
    setUsername(user.username || '');
    setAvatarFile(null);
    setAvatarPreview(user.avatarUrl || '');
    setErrorMessage(null);
  }, [isOpen, user]);

  useEffect(() => {
    if (!avatarFile) return;
    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

  if (!isOpen) return null;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || user.isGuest) return;

    const trimmedName = displayName.trim();
    const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase();
    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setErrorMessage('O nome deve ter entre 2 e 40 caracteres.');
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
      setErrorMessage('O @username deve ter de 3 a 20 caracteres: letras, números ou _.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      let avatarUrl = user.avatarUrl || null;
      if (avatarFile) {
        const extension = avatarFile.type === 'image/png'
          ? 'png'
          : avatarFile.type === 'image/webp'
          ? 'webp'
          : 'jpg';
        const path = `${user.id}/avatar.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('profile-avatars')
          .upload(path, avatarFile, {
            cacheControl: '3600',
            contentType: avatarFile.type,
            upsert: true,
          });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
        avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: trimmedName,
          username: normalizedUsername,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('id')
        .single();
      if (profileError) throw profileError;

      const updatedUser = {
        ...user,
        displayName: trimmedName,
        username: normalizedUsername,
        avatarUrl: avatarUrl || undefined,
      };
      onProfileUpdated(updatedUser);
      onClose();
    } catch (error) {
      console.error('Profile update failed:', error);
      const errorDetails = error as { message?: string; code?: string };
      const message = (errorDetails.message || '').toLowerCase();
      if (errorDetails.code === '23505' || message.includes('idx_profiles_username_lower') || message.includes('duplicate key')) {
        setErrorMessage('Esse @username já está sendo usado. Escolha outro.');
      } else if (message.includes('profile-avatars') || message.includes('bucket')) {
        setErrorMessage('O armazenamento de fotos ainda não está configurado. Execute a migração de perfis no Supabase.');
      } else {
        setErrorMessage(
          'Não foi possível salvar o perfil. Confira se a migração de perfis foi executada no Supabase e tente novamente.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMessage('Escolha uma imagem JPG, PNG ou WebP.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('A foto deve ter no máximo 5 MB.');
      event.target.value = '';
      return;
    }
    setErrorMessage(null);
    setAvatarFile(file);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-xl border border-[#d4af37]/60 bg-[#121317] p-6 text-[#e8d5b5] shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-[#d4af37]/20 pb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wider">Seu perfil público</h2>
            <p className="mt-1 text-[11px] text-zinc-400">Nome, foto e @username exibidos no chat e nas salas.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-white" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!user || user.isGuest || user.id.startsWith('local-') ? (
          <div className="space-y-4 text-center">
            <UserRound className="mx-auto h-9 w-9 text-amber-300" />
            <p className="text-sm">Entre ou crie uma conta para configurar seu perfil público.</p>
            <button type="button" onClick={onOpenAuth} className="w-full rounded-lg bg-[#d4af37] py-2.5 text-xs font-bold uppercase text-black">
              Login / Cadastro
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center gap-4">
              <img
                src={avatarPreview || DEFAULT_PROFILE_PHOTO}
                alt="Foto de perfil"
                className="h-16 w-16 rounded-full border-2 border-[#ffd700] object-cover"
              />
              <label className="cursor-pointer rounded-lg border border-amber-400/50 px-3 py-2 text-xs text-amber-200 hover:bg-amber-400/10">
                <span className="flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Alterar foto</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} className="sr-only" />
              </label>
            </div>

            <label className="block text-xs text-zinc-300">
              Nome exibido
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={40}
                required
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
              />
            </label>

            <label className="block text-xs text-zinc-300">
              @username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value.replace(/^@/, '').toLowerCase())}
                minLength={3}
                maxLength={20}
                pattern="[a-z0-9_]{3,20}"
                required
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
              />
            </label>

            <p className="text-[11px] text-zinc-500">{user.email}</p>
            {errorMessage && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/40 p-2 text-xs text-red-200">{errorMessage}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#d4af37] py-2.5 text-xs font-bold uppercase text-black disabled:opacity-60"
            >
              {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {loading ? 'Salvando...' : 'Salvar perfil'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
