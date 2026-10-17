import React, { useState } from 'react';
import { X, Lock, Mail, UserCheck, ShieldAlert, Sparkles, LogOut, User, CheckCircle2 } from 'lucide-react';
import { supabase, activeSupabaseRef } from '../lib/supabase';
import { CreatorUser } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CreatorUser | null;
  onAuthSuccess: (user: CreatorUser) => void;
  onLogout?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
  onLogout,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showSwitchForm, setShowSwitchForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isUserAuthenticated = currentUser && !currentUser.isGuest;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        if (data.user) {
          onAuthSuccess({
            id: data.user.id,
            email: data.user.email || email,
            displayName: data.user.email?.split('@')[0] || 'Criador',
            isGuest: false,
          });
          setShowSwitchForm(false);
          onClose();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;
        if (data.user) {
          onAuthSuccess({
            id: data.user.id,
            email: data.user.email || email,
            displayName: data.user.email?.split('@')[0] || 'Criador',
            isGuest: false,
          });
          setShowSwitchForm(false);
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Supabase auth error:', err);
      const raw = (err?.message || '').toLowerCase();
      if (raw.includes('invalid api key') || raw.includes('apikey')) {
        setErrorMsg(
          'Chave de API do Supabase inválida ("Invalid API key"). Verifique se a variável VITE_SUPABASE_ANON_KEY no painel da Vercel foi copiada corretamente (use a chave "anon public", sem aspas). Para testar agora, utilize o botão "Continuar como Visitante" abaixo.'
        );
      } else if (raw.includes('invalid login credentials')) {
        setErrorMsg('E-mail ou senha incorretos. Caso ainda não tenha uma conta, alterne para a aba "CADASTRAR".');
      } else if (raw.includes('user already registered')) {
        setErrorMsg('Este e-mail já está cadastrado. Alterne para a aba "ENTRAR" e faça o login com sua senha.');
      } else {
        setErrorMsg(err.message || 'Erro na autenticação. Verifique os dados ou use o modo Visitante.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLocalAccountLogin = () => {
    const userEmail = email.trim() || 'criador@3dsocial.local';
    const localUser: CreatorUser = {
      id: `local-${userEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
      email: userEmail,
      displayName: userEmail.split('@')[0] || 'Criador',
      isGuest: false,
    };
    onAuthSuccess(localUser);
    setShowSwitchForm(false);
    onClose();
  };

  const handleGuestLogin = () => {
    const guestUser: CreatorUser = {
      id: `guest-${Date.now()}`,
      email: 'visitante@3dsocial.local',
      displayName: 'Visitante (Luzenne)',
      isGuest: true,
    };
    onAuthSuccess(guestUser);
    setShowSwitchForm(false);
    onClose();
  };

  const handleUserLogout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out error:', err);
    } finally {
      setLoading(false);
      if (onLogout) {
        onLogout();
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in font-sans">
      <div className="relative w-full max-w-md bg-[#121317] border border-[#d4af37]/60 rounded-xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.9)] text-[#e8d5b5]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#d4af37]/20">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#d4af37]" />
            <h2 className="text-sm font-semibold tracking-wider text-[#e8d5b5]">
              {isUserAuthenticated && !showSwitchForm ? 'Perfil do Usuário' : 'Autenticação Supabase'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#d4af37]/60 hover:text-[#d4af37] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* If user is already authenticated and not choosing to switch account, show Profile & Logout */}
        {isUserAuthenticated && !showSwitchForm ? (
          <div className="py-4 space-y-4 animate-fade-in">
            {/* User Profile Card */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-black/50 border border-[#d4af37]/40 shadow-inner">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-[#181920] border-2 border-[#ffd700] overflow-hidden flex items-center justify-center shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                  <User className="w-7 h-7 text-[#ffd700]" />
                </div>
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-black" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white truncate">
                    {currentUser.displayName}
                  </h3>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                </div>
                <p className="text-xs text-zinc-400 truncate font-mono mt-0.5">
                  {currentUser.email}
                </p>
                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-[10px] text-emerald-300 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Conectado via Supabase</span>
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleUserLogout}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-500/60 text-red-200 hover:text-white text-xs font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md hover:shadow-red-950/50"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              <span>{loading ? 'Saindo...' : 'Sair da Conta (Logout)'}</span>
            </button>

            {/* Switch Account */}
            <div className="pt-2 border-t border-[#d4af37]/20 flex items-center justify-between text-xs">
              <span className="text-zinc-500">Deseja alternar usuário?</span>
              <button
                type="button"
                onClick={() => setShowSwitchForm(true)}
                className="text-[#ffd700] hover:underline font-semibold cursor-pointer"
              >
                Trocar de Conta
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode switcher tabs */}
            <div className="flex border-b border-[#d4af37]/20 my-4">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 py-2 text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer border-b-2 ${
                  mode === 'login'
                    ? 'border-[#d4af37] text-[#ffd700]'
                    : 'border-transparent text-[#d4af37]/50 hover:text-[#d4af37]'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`flex-1 py-2 text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer border-b-2 ${
                  mode === 'signup'
                    ? 'border-[#d4af37] text-[#ffd700]'
                    : 'border-transparent text-[#d4af37]/50 hover:text-[#d4af37]'
                }`}
              >
                Cadastrar
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#d4af37] mb-1">
                  E-mail
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 w-4 h-4 text-[#d4af37]/50" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu-email@dominio.com"
                    className="w-full bg-[#16181e] border border-[#d4af37]/40 rounded-lg pl-9 pr-3 py-2 text-xs text-[#e8d5b5] placeholder:text-[#e8d5b5]/30 outline-none focus:border-[#d4af37]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#d4af37] mb-1">
                  Senha
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3 w-4 h-4 text-[#d4af37]/50" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#16181e] border border-[#d4af37]/40 rounded-lg pl-9 pr-3 py-2 text-xs text-[#e8d5b5] placeholder:text-[#e8d5b5]/30 outline-none focus:border-[#d4af37]"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                    <span>{errorMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLocalAccountLogin}
                    className="mt-1 w-full py-1.5 px-3 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Entrar em Modo Local ({email.trim() ? email.split('@')[0] : 'Criador'})</span>
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-[#d4af37] hover:bg-[#e2bd44] text-black text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4 text-xs text-[#d4af37]/40">
              <div className="flex-1 h-[1px] bg-[#d4af37]/20" />
              <span>ou</span>
              <div className="flex-1 h-[1px] bg-[#d4af37]/20" />
            </div>

            {/* Quick Guest mode */}
            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full py-2 rounded-lg border border-[#d4af37]/50 hover:border-[#d4af37] bg-black/40 hover:bg-[#d4af37]/10 text-xs font-semibold text-[#e8d5b5] hover:text-[#ffd700] transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Continuar como Visitante (Luzenne)</span>
            </button>

            {isUserAuthenticated && showSwitchForm && (
              <button
                type="button"
                onClick={() => setShowSwitchForm(false)}
                className="mt-3 w-full text-center text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                ← Voltar ao perfil atual
              </button>
            )}
          </>
        )}

        <p className="mt-4 text-[10px] text-center text-[#d4af37]/60 leading-relaxed">
          Conectado ao Supabase (`{activeSupabaseRef}`).
        </p>
      </div>
    </div>
  );
};
