// Çevrimiçi hesap (Supabase Auth): e-posta ile giriş, kayıt ve çıkış.
// Sunucu adresi .env.web dosyasındaki VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY değerlerinden gelir;
// boşsa hesap özelliği "bağlı değil" durumunda kalır ve uygulama yalnızca cihazdaki veriyle çalışır.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** Hesap özelliği bu derlemede var mı (yalnızca tarayıcı/telefon sürümü) */
export const ACCOUNTS_ENABLED = import.meta.env.MODE === 'web';
/** Sunucu adresi ve anahtarı girilmiş mi */
export const SERVER_CONFIGURED = ACCOUNTS_ENABLED && URL !== '' && KEY !== '';

let clientPromise: Promise<SupabaseClient> | null = null;
/** Supabase istemcisi yalnızca gerektiğinde yüklenir. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!SERVER_CONFIGURED) return Promise.reject(new Error('Sunucu bağlantısı henüz kurulmadı.'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
  return clientPromise;
}

export interface Account { id: string; email: string; fullName: string }

interface AuthValue {
  /** Giriş yapan kullanıcı; yoksa null */
  account: Account | null;
  /** İlk oturum kontrolü sürüyor */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** true dönerse hesap açıldı ama e-posta onayı bekleniyor */
  signUp: (fullName: string, email: string, password: string) => Promise<{ needsConfirm: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Şifre yenileme bağlantısıyla gelindi: yeni şifre istenmeli */
  recovering: boolean;
  updatePassword: (password: string) => Promise<void>;
  endRecovery: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider eksik');
  return v;
}

// Supabase'in İngilizce hata mesajlarının Türkçe karşılıkları
const ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-posta veya şifre hatalı.'],
  [/email not confirmed/i, 'E-posta adresiniz henüz onaylanmamış. Gelen kutunuzdaki onay bağlantısına tıklayın.'],
  [/already registered|already been registered|user already exists/i, 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.'],
  [/should be different from the old password/i, 'Yeni şifre eskisiyle aynı olamaz.'],
  [/password should be at least|weak password/i, 'Şifre çok kısa veya zayıf. En az 8 karakter kullanın.'],
  [/signups? (are )?(not allowed|disabled)/i, 'Yeni kayıt şu an kapalı. Yöneticinizden davet isteyin.'],
  [/rate limit|too many requests|security purposes/i, 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.'],
  [/unable to validate email|invalid email|invalid format/i, 'Geçerli bir e-posta adresi girin.'],
  [/failed to fetch|networkerror|load failed/i, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'],
];

export function authErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return ERRORS.find(([re]) => re.test(msg))?.[1] ?? msg;
}

type RawUser = { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined;
const toAccount = (u: RawUser): Account | null =>
  u ? { id: u.id, email: u.email ?? '', fullName: String(u.user_metadata?.full_name ?? '') } : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(SERVER_CONFIGURED);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!SERVER_CONFIGURED) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    void getSupabase()
      .then(async (sb) => {
        const { data } = await sb.auth.getSession();
        if (cancelled) return;
        setAccount(toAccount(data.session?.user));
        const sub = sb.auth.onAuthStateChange((event, session) => {
          setAccount(toAccount(session?.user));
          if (event === 'PASSWORD_RECOVERY') setRecovering(true);
        });
        off = () => sub.data.subscription.unsubscribe();
      })
      .catch((e) => console.error('[EroMec] oturum kontrolü:', e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = await getSupabase();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin + window.location.pathname } });
    if (error) throw error;
    // Aynı e-posta zaten kayıtlıysa Supabase hata vermez, kimliksiz bir kullanıcı döndürür.
    if (data.user && data.user.identities?.length === 0) throw new Error('user already exists');
    return { needsConfirm: !data.session };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const sb = await getSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const sb = await getSupabase();
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const sb = await getSupabase();
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    setRecovering(false);
  }, []);
  const endRecovery = useCallback(() => setRecovering(false), []);

  const value = useMemo(() => ({ account, loading, signIn, signUp, resetPassword, signOut, recovering, updatePassword, endRecovery }),
    [account, loading, signIn, signUp, resetPassword, signOut, recovering, updatePassword, endRecovery]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
