import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle2, Box, Sparkles } from 'lucide-react';
import { ProductType, UploadedProduct } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (product: UploadedProduct) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [thumbUrl, setThumbUrl] = useState('');
  const [productType, setProductType] = useState<ProductType>('sala');
  const [itemCategory, setItemCategory] = useState<'head' | 'chest' | 'eyes'>('head');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!displayName) {
        setDisplayName(selected.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('Por favor, informe o nome do arquivo / exibição.');
      return;
    }

    // Default high-quality thumbs based on type if not provided
    let finalThumb = thumbUrl.trim();
    if (!finalThumb) {
      if (productType === 'sala') {
        finalThumb = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80';
      } else if (productType === 'avatar') {
        finalThumb = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80';
      } else {
        finalThumb = 'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?auto=format&fit=crop&w=300&q=80';
      }
    }

    const newProduct: UploadedProduct = {
      id: `up-${Date.now()}`,
      fileName: file ? file.name : `${displayName.toLowerCase().replace(/\s+/g, '_')}.glb`,
      displayName: displayName.trim(),
      thumbUrl: finalThumb,
      productType,
      uploadedAt: new Date().toLocaleDateString(),
      author: 'Luzenne',
      itemCategory: productType === 'acessorio' ? itemCategory : undefined,
    };

    setIsSuccess(true);
    setTimeout(() => {
      onUploadSuccess(newProduct);
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#141519] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-zinc-100 overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2 text-amber-400">
            <UploadCloud className="w-5 h-5" />
            <h2 className="text-lg font-bold tracking-wide text-white">
              Upload de Arquivo 3D (GLB / GLTF)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-bounce" />
            <h3 className="text-xl font-bold text-white">Upload Concluído com Sucesso!</h3>
            <p className="text-sm text-zinc-400 max-w-sm">
              {productType === 'sala' && 'A nova sala foi adicionada à Vitrine de Portais do Lobby.'}
              {productType === 'avatar' && 'O modelo de avatar foi integrado para controle na sala.'}
              {productType === 'acessorio' && 'O acessório foi publicado na Loja e pronto para vestir.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* File Drop Area */}
            <div className="relative border-2 border-dashed border-zinc-700 hover:border-amber-500/60 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-[#191a20]/60">
              <input
                id="glb-file-input"
                type="file"
                accept=".glb,.gltf"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Box className="w-8 h-8 text-amber-400 mb-2" />
              <p className="text-xs font-semibold text-zinc-200">
                {file ? file.name : 'Clique ou arraste o arquivo .glb / .gltf aqui'}
              </p>
              <p className="text-[10px] text-zinc-500 mt-1">
                Suporta modelos binários GLB ou GLTF com texturas embutidas
              </p>
            </div>

            {/* Field 1: Nome do arquivo / nome de exibição */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Nome do Arquivo / Nome de Exibição <span className="text-amber-400">*</span>
              </label>
              <input
                id="product-name-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Sala Jardim Zen, Cyber Avatar, Chapéu Cowboy"
                className="w-full bg-[#1c1d24] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/80 transition-colors"
                required
              />
            </div>

            {/* Field 2: Imagem de capa (thumb) */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Imagem de Capa (URL da miniatura / thumb)
              </label>
              <input
                id="product-thumb-input"
                type="url"
                value={thumbUrl}
                onChange={(e) => setThumbUrl(e.target.value)}
                placeholder="https://... (ou deixe vazio para usar thumb padrão)"
                className="w-full bg-[#1c1d24] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/80 transition-colors"
              />
            </div>

            {/* Field 3: TIPO do produto (obrigatório, exatamente UM)
                "Não misturar tipos. Um upload = um tipo." */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                TIPO do Produto <span className="text-amber-400">* (Obrigatório, selecione um)</span>
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                {/* TIPO: sala */}
                <button
                  id="type-sala-btn"
                  type="button"
                  onClick={() => setProductType('sala')}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    productType === 'sala'
                      ? 'bg-amber-500/20 border-[#ffd700] ring-1 ring-[#ffd700]'
                      : 'bg-[#1a1b22] border-white/10 hover:border-white/30 text-zinc-400'
                  }`}
                >
                  <span className="text-lg">🏛️</span>
                  <div className="mt-2">
                    <p className={`text-xs font-bold ${productType === 'sala' ? 'text-amber-300' : 'text-zinc-200'}`}>
                      Sala
                    </p>
                    <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Aparece na Vitrine de Portais do Lobby
                    </p>
                  </div>
                </button>

                {/* TIPO: avatar */}
                <button
                  id="type-avatar-btn"
                  type="button"
                  onClick={() => setProductType('avatar')}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    productType === 'avatar'
                      ? 'bg-amber-500/20 border-[#ffd700] ring-1 ring-[#ffd700]'
                      : 'bg-[#1a1b22] border-white/10 hover:border-white/30 text-zinc-400'
                  }`}
                >
                  <span className="text-lg">🧍</span>
                  <div className="mt-2">
                    <p className={`text-xs font-bold ${productType === 'avatar' ? 'text-amber-300' : 'text-zinc-200'}`}>
                      Avatar
                    </p>
                    <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Controlável na room (spots + gizmo)
                    </p>
                  </div>
                </button>

                {/* TIPO: acessorio | item */}
                <button
                  id="type-acessorio-btn"
                  type="button"
                  onClick={() => setProductType('acessorio')}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    productType === 'acessorio'
                      ? 'bg-amber-500/20 border-[#ffd700] ring-1 ring-[#ffd700]'
                      : 'bg-[#1a1b22] border-white/10 hover:border-white/30 text-zinc-400'
                  }`}
                >
                  <span className="text-lg">👑</span>
                  <div className="mt-2">
                    <p className={`text-xs font-bold ${productType === 'acessorio' ? 'text-amber-300' : 'text-zinc-200'}`}>
                      Item / Acessório
                    </p>
                    <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Vai para a Loja &gt; Adquirir e Equipar
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* If Acessório: select attachment slot */}
            {productType === 'acessorio' && (
              <div className="bg-[#1a1b22] p-3 rounded-xl border border-white/5 flex items-center justify-between">
                <span className="text-xs text-zinc-300">Ponto de encaixe (Empty):</span>
                <div className="flex gap-1.5">
                  {(['head', 'eyes', 'chest'] as const).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setItemCategory(slot)}
                      className={`px-2.5 py-1 rounded text-xs capitalize cursor-pointer ${
                        itemCategory === slot
                          ? 'bg-[#ffd700] text-black font-bold'
                          : 'bg-black/40 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {slot === 'head' ? 'Cabeça' : slot === 'eyes' ? 'Rosto/Olhos' : 'Peito/Colar'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-400 font-medium">{errorMsg}</p>
            )}

            {/* Action buttons */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="submit-3d-upload-btn"
                type="submit"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-[#ffd700] hover:from-amber-400 hover:to-amber-300 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition-transform transform active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Salvar e Publicar</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
