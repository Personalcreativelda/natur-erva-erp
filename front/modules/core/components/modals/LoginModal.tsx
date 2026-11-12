import React, { useState, useEffect } from 'react';
import { ModalPortal } from '../ui/ModalPortal';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { User } from '../../../core/types/types';
import { authService } from '../../../auth/services/authService';
import { Logo } from '../ui/Logo';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { SignUpModal } from './SignUpModal';
import { GoogleLogin } from '@react-oauth/google';

interface LoginModalProps {
 onLogin: (identifier: string, password: string) => void;
 onClose: () => void;
 onUserLogin?: (user: User) => void;
 message?: string | null;
}

const inputClass = 'w-full h-12 px-3.5 text-base sm:text-sm border border-border-default rounded-xl bg-surface-base text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition';

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin, onClose, onUserLogin, message }) => {
 const [identifier, setIdentifier] = useState('');
 const [password, setPassword] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [rememberMe, setRememberMe] = useState(false);
 const [googleLoading, setGoogleLoading] = useState(false);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
 const [showSignUpModal, setShowSignUpModal] = useState(false);

 useEffect(() => {
 // Check for saved email in localStorage
 const savedEmail = localStorage.getItem('app_saved_email');
 if (savedEmail) {
 setIdentifier(savedEmail);
 setRememberMe(true);
 }
 }, []);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setLoading(true);
 setError('');

 try {
 if (rememberMe) {
 localStorage.setItem('app_saved_email', identifier);
 } else {
 localStorage.removeItem('app_saved_email');
 }

 const { user, error: loginError } = await authService.login(identifier, password);
 if (loginError) {
 setError(loginError);
 } else if (user) {
 if (onUserLogin) onUserLogin(user);
 onClose();
 }
 } catch (e: any) {
 setError(e.message || 'Erro ao fazer login.');
 } finally {
 setLoading(false);
 }
 };

 const handleGoogleSuccess = async (credentialResponse: any) => {
 setGoogleLoading(true);
 setError('');
 try {
 const { user, error: googleError } = await authService.signInWithGoogleCredential(credentialResponse.credential);
 if (user) {
 if (onUserLogin) onUserLogin(user);
 onClose();
 } else {
 setError(googleError || 'Erro ao autenticar com Google.');
 }
 } catch (e: any) {
 setError(e.message || 'Erro ao iniciar login com Google.');
 } finally {
 setGoogleLoading(false);
 }
 };

 return (
 <>
 <ModalPortal open onClose={onClose} zIndex={10000} className="p-4">
 <div className="relative bg-surface-raised rounded-3xl px-5 sm:px-7 pt-6 pb-5 max-w-sm w-full mx-auto shadow-2xl border border-border-default animate-scaleIn max-h-[92dvh] overflow-y-auto">
 <button
 type="button"
 onClick={onClose}
 className="tap-target absolute top-3 right-3 w-10 h-10 !min-h-0 flex items-center justify-center rounded-full text-content-muted hover:bg-surface-base transition-colors"
 aria-label="Fechar"
 >
 <X className="w-5 h-5" />
 </button>

 <div className="text-center mb-5">
 <div className="flex justify-center mb-4">
 <Logo width={120} height={40} className="w-auto" isDarkMode={document.documentElement.classList.contains('dark')} />
 </div>
 <h2 className="text-xl font-bold text-content-primary">Entrar</h2>
 <p className="text-content-muted text-sm mt-1">Aceda à sua conta para continuar</p>
 </div>

 {/* Mensagem explicativa quando login é forçado */}
 {message && (
 <div className="mb-4 px-3.5 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
 <p className="text-sm text-green-800 dark:text-green-300 text-center leading-snug">{message}</p>
 </div>
 )}

 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label htmlFor="login-identifier" className="block text-sm font-medium text-content-primary mb-1.5">
 Email ou telefone
 </label>
 <input
 id="login-identifier"
 type="text"
 inputMode="email"
 autoComplete="username"
 value={identifier}
 onChange={(e) => setIdentifier(e.target.value)}
 className={inputClass}
 placeholder="seu@email.com ou +258..."
 required
 />
 </div>
 <div>
 <label htmlFor="login-password" className="block text-sm font-medium text-content-primary mb-1.5">
 Palavra-passe
 </label>
 <div className="relative">
 <input
 id="login-password"
 type={showPassword ? 'text' : 'password'}
 autoComplete="current-password"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 className={`${inputClass} pr-12`}
 placeholder="••••••••"
 required
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 !min-h-0 flex items-center justify-center rounded-lg text-content-muted hover:text-content-secondary transition-colors"
 aria-label={showPassword ? 'Esconder palavra-passe' : 'Mostrar palavra-passe'}
 >
 {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
 </button>
 </div>
 </div>

 <div className="flex items-center justify-between">
 <label htmlFor="remember-me-login" className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer">
 <input
 id="remember-me-login"
 name="remember-me-login"
 type="checkbox"
 checked={rememberMe}
 onChange={(e) => setRememberMe(e.target.checked)}
 className="h-4 w-4 text-green-600 focus:ring-green-500 border-border-default rounded cursor-pointer"
 />
 Lembrar-me
 </label>
 <button
 type="button"
 onClick={() => setShowForgotPasswordModal(true)}
 className="text-sm font-medium text-green-600 dark:text-green-400 hover:underline"
 >
 Esqueceu-se?
 </button>
 </div>

 {error && (
 <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2.5 rounded-xl text-center" role="alert">
 {error}
 </div>
 )}

 <button
 type="submit"
 disabled={googleLoading || loading}
 className="w-full h-12 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-xl font-semibold text-[15px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
 style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 20px -10px rgb(22 163 74)' }}
 >
 {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> A entrar...</>) : 'Entrar'}
 </button>

 {/* Google — só aparece se estiver configurado (antes mostrava um botão desactivado) */}
 {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
 <>
 <div className="flex items-center gap-3 text-xs text-content-muted">
 <span className="h-px flex-1 bg-border-default" />
 ou
 <span className="h-px flex-1 bg-border-default" />
 </div>
 <div className="flex justify-center min-h-[44px]">
 {googleLoading
 ? <div className="flex items-center gap-2 text-content-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> A autenticar...</div>
 : <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError('Erro ao autenticar com Google.')} useOneTap={false} text="continue_with" shape="pill" width="300" />
 }
 </div>
 </>
 )}

 <p className="text-center text-sm text-content-secondary pt-1">
 Não tem conta?{' '}
 <button
 type="button"
 onClick={() => setShowSignUpModal(true)}
 className="text-green-600 dark:text-green-400 hover:underline font-semibold"
 >
 Criar conta
 </button>
 </p>
 </form>
 </div>
 </ModalPortal>

 {showForgotPasswordModal && (
 <ForgotPasswordModal
 onClose={() => setShowForgotPasswordModal(false)}
 onSuccess={() => {
 setError('');
 setShowForgotPasswordModal(false);
 }}
 />
 )}

 {showSignUpModal && (
 <SignUpModal
 onClose={() => setShowSignUpModal(false)}
 onSuccess={(user) => {
 // Usuário já está logado após criar conta
 if (onUserLogin) {
 onUserLogin(user);
 }
 setShowSignUpModal(false);
 onClose();
 }}
 />
 )}
 </>
 );
};
