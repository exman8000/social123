import React, { useState } from 'react';
import { LoaderCircle, Music2, Upload, X } from 'lucide-react';
import { CreatorUser, InventoryItem } from '../types';
import { supabase } from '../lib/supabase';
import { createUserAudioAsset } from '../lib/database';

interface AudioUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: CreatorUser | null;
  onUploadSuccess: (item: InventoryItem) => void;
  onPublish: (item: InventoryItem) => void;
}

const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
];

export const AudioUploadModal: React.FC<AudioUploadModalProps> = ({
  isOpen,
  onClose,
  user,
  onUploadSuccess,
  onPublish,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [radioUrl, setRadioUrl] = useState('');
  const [name, setName] = useState('');
  const [uploadedItem, setUploadedItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setUploadedItem(null);
    setError(null);
    if (selected && !name) setName(selected.name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || user.isGuest || user.id.startsWith('local-')) {
      setError('Entre com uma conta Supabase para adicionar áudios ao inventário.');
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Informe um nome para o áudio.');
      return;
    }

    let finalUrl = radioUrl.trim();
    let storagePath: string | null = null;
    if (file) {
      if (!AUDIO_MIME_TYPES.includes(file.type)) {
        setError('Formato não compatível. Use MP3, WAV, OGG, M4A ou AAC.');
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        setError('O arquivo de áudio deve ter no máximo 25 MB.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'mp3';
        storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('store-audios')
          .upload(storagePath, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        finalUrl = supabase.storage.from('store-audios').getPublicUrl(storagePath).data.publicUrl;
      } catch (cause) {
        console.error('Audio upload failed:', cause);
        setError('Não foi possível enviar o áudio. Confira se a migração do armazenamento de áudios foi aplicada.');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    try {
      const parsedUrl = new URL(finalUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') throw new Error('Unsupported URL scheme');
    } catch {
      setError('Selecione um arquivo de áudio ou informe um link http(s) válido.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const audioAsset = await createUserAudioAsset(user, {
        name: cleanName,
        audioUrl: finalUrl,
        isRadio: !file,
      });
      const item: InventoryItem = {
        id: audioAsset.id,
        audioAssetId: audioAsset.id,
        fileName: file?.name || cleanName,
        displayName: cleanName,
        name: cleanName,
        thumbUrl: '',
        type: 'Audio',
        isAudio: true,
        audioUrl: finalUrl,
        audioIsRadio: !file,
      };
      onUploadSuccess(item);
      setUploadedItem(item);
    } catch (cause) {
      console.error('Failed to save audio in user inventory:', cause);
      if (storagePath) {
        const { error: removeError } = await supabase.storage.from('store-audios').remove([storagePath]);
        if (removeError) console.error('Failed to clean up unregistered audio upload:', removeError);
      }
      setError('O áudio não foi salvo na sua biblioteca. Confira a migração de áudio do banco e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setRadioUrl('');
    setName('');
    setUploadedItem(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-[#d4af37]/60 bg-[#121317] p-6 text-[#e8d5b5] shadow-2xl">
        <header className="mb-5 flex items-center justify-between border-b border-[#d4af37]/20 pb-3">
          <div className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-[#ffd700]" />
            <div>
              <h2 className="text-sm font-bold">Adicionar áudio</h2>
              <p className="mt-1 text-[11px] text-zinc-400">MP3 ou link de rádio para usar temporariamente nas salas.</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fechar" className="p-1 text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        {uploadedItem ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-100">
              “{uploadedItem.displayName}” foi adicionado à sua biblioteca de áudios.
            </p>
            <button
              type="button"
              onClick={() => {
                onPublish(uploadedItem);
                handleClose();
              }}
              className="w-full rounded-lg bg-gradient-to-r from-[#d4af37] to-[#ffd700] py-2.5 text-xs font-bold uppercase text-black"
            >
              Publicar como acessório de áudio
            </button>
            <button type="button" onClick={handleClose} className="w-full rounded-lg border border-white/15 py-2.5 text-xs text-zinc-200 hover:bg-white/5">
              Guardar apenas no inventário
            </button>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="space-y-4">
            <label className="block text-xs text-zinc-300">
              Nome do áudio
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-amber-400/40 bg-black/30 p-4 hover:bg-amber-400/5">
              <Upload className="h-5 w-5 text-amber-300" />
              <span className="min-w-0 flex-1 text-xs text-zinc-200">
                {file ? file.name : 'Selecionar arquivo MP3, WAV, OGG, M4A ou AAC (máx. 25 MB)'}
              </span>
              <input type="file" accept="audio/*" onChange={handleFileChange} className="sr-only" />
            </label>
            <div className="text-center text-[10px] font-bold uppercase text-zinc-500">ou use um link de rádio</div>
            <input
              type="url"
              value={radioUrl}
              onChange={(event) => setRadioUrl(event.target.value)}
              placeholder="https://exemplo.com/radio.mp3"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-xs text-white outline-none focus:border-amber-400"
            />
            {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/40 p-2 text-xs text-red-200">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#d4af37] py-2.5 text-xs font-bold uppercase text-black disabled:opacity-60"
            >
              {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {loading ? 'Enviando áudio…' : 'Adicionar ao inventário'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
