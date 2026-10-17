import React, { useState, useRef } from 'react';
import { Upload, Link, Image as ImageIcon, X, Clipboard, Check } from 'lucide-react';

interface CoverImagePickerProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  required?: boolean;
  defaultFallback?: string;
  suggestedTag?: string;
}

export const CoverImagePicker: React.FC<CoverImagePickerProps> = ({
  value,
  onChange,
  label = 'Imagem de Capa (Capa / Miniatura)',
  required = false,
  defaultFallback,
}) => {
  const [urlInput, setUrlInput] = useState(value || '');
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronize when value changes externally
  React.useEffect(() => {
    setUrlInput(value || '');
  }, [value]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert file to Base64 Data URL so it is completely self-contained and renders anywhere
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setUrlInput(dataUrl);
        onChange(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrlInput(val);
    onChange(val);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http') || text.startsWith('data:image'))) {
        setUrlInput(text.trim());
        onChange(text.trim());
        setPasteSuccess(true);
        setTimeout(() => setPasteSuccess(false), 2000);
      }
    } catch {
      // Fallback: prompt or focus input
    }
  };

  const handleClearImage = () => {
    setUrlInput('');
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const activeImage = urlInput || defaultFallback;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs md:text-sm font-bold text-[#ffd700] flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4 text-[#ffd700]" />
          <span>{label}</span>
          {required && <span className="text-red-400 font-bold">*</span>}
        </label>
        {urlInput && (
          <button
            type="button"
            onClick={handleClearImage}
            className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Remover foto</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Preview Box & Upload trigger */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative aspect-video sm:aspect-square rounded-xl border-2 border-dashed border-[#ffd700]/70 hover:border-[#ffd700] bg-black/60 hover:bg-[#d4af37]/15 transition-all cursor-pointer overflow-hidden flex flex-col items-center justify-center p-2 group shadow-inner"
          title="Clique para escolher uma imagem do seu computador"
        >
          {activeImage ? (
            <>
              <img
                src={activeImage}
                alt="Prévia da capa"
                className="w-full h-full object-cover rounded-lg group-hover:opacity-80 transition-opacity"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80';
                }}
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-1 p-2 text-center">
                <Upload className="w-5 h-5 text-[#ffd700]" />
                <span>Trocar imagem do computador</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-2 gap-1.5">
              <div className="w-10 h-10 rounded-full bg-[#ffd700]/20 flex items-center justify-center text-[#ffd700] group-hover:scale-110 transition-transform">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#ffd700]">Subir do Computador</span>
              <span className="text-[10px] text-zinc-300">PNG, JPG, WEBP</span>
            </div>
          )}
        </div>

        {/* URL Input & Controls */}
        <div className="sm:col-span-2 flex flex-col justify-between gap-2.5">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-200 block">
              Ou cole o link direto da imagem / miniatura copiada:
            </span>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                  <Link className="w-4 h-4 text-[#ffd700]" />
                </div>
                <input
                  type="url"
                  value={urlInput}
                  onChange={handleUrlChange}
                  placeholder="https://... ou cole a imagem"
                  className="w-full bg-[#161822] border border-[#d4af37]/60 rounded-xl pl-9 pr-3 py-2 text-xs md:text-sm text-white placeholder:text-zinc-500 outline-none focus:border-[#ffd700] focus:ring-1 focus:ring-[#ffd700]"
                />
              </div>

              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="px-3 py-2 rounded-xl bg-[#282a36] hover:bg-[#343746] border border-[#d4af37]/50 text-xs font-bold text-[#ffd700] flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0 shadow-sm"
                title="Colar link da área de transferência"
              >
                {pasteSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Colado!</span>
                  </>
                ) : (
                  <>
                    <Clipboard className="w-4 h-4" />
                    <span>Colar URL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-300 bg-black/40 border border-white/10 rounded-lg p-2">
            <span className="font-medium">
              Dica: Você pode copiar o endereço de qualquer imagem da internet e colar acima, ou clicar no quadrado para enviar do seu PC.
            </span>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};
