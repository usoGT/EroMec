import { useState } from 'react';
import { LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { authErrorMessage, SERVER_CONFIGURED, useAuth } from '../lib/auth';
import { useApp } from '../lib/context';
import { useSession } from '../lib/session';
import Modal from './Modal';
import { Field, FormError } from './Fields';

type Tab = 'login' | 'register';

/** Hesap penceresi: giriş yap / kayıt ol; giriş yapılmışsa hesap bilgisi ve çıkış. */
export default function AccountModal({ onClose, initialTab = 'login' }: { onClose: () => void; initialTab?: Tab }) {
  const { account, signIn, signUp, resetPassword, signOut } = useAuth();
  const { toast } = useApp();
  const { me, refresh, refreshing } = useSession();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const mail = email.trim().toLowerCase();
  const validMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);

  const submit = () => {
    if (!validMail) return setError('Geçerli bir e-posta adresi girin.');
    if (tab === 'login') {
      if (!password) return setError('Şifrenizi girin.');
      return void run(async () => {
        await signIn(mail, password);
        toast('Giriş yapıldı.');
        onClose();
      });
    }
    if (fullName.trim().length < 3) return setError('Adınızı ve soyadınızı girin.');
    if (password.length < 8) return setError('Şifre en az 8 karakter olmalı.');
    if (password !== password2) return setError('Şifreler birbiriyle aynı değil.');
    void run(async () => {
      const { needsConfirm } = await signUp(fullName.trim(), mail, password);
      if (needsConfirm) {
        setInfo(`Hesabınız oluşturuldu. ${mail} adresine bir onay bağlantısı gönderdik; bağlantıya tıkladıktan sonra giriş yapabilirsiniz.`);
        setTab('login');
        setPassword('');
        setPassword2('');
      } else {
        toast('Hesabınız oluşturuldu.');
        onClose();
      }
    });
  };

  const forgot = () => {
    if (!validMail) return setError('Önce e-posta adresinizi yazın, sonra “Şifremi unuttum”a basın.');
    void run(async () => {
      await resetPassword(mail);
      setInfo(`${mail} adresine şifre yenileme bağlantısı gönderildi.`);
    });
  };

  if (account) {
    return (
      <Modal title="Hesabım" onClose={onClose} width="w-[440px]"
        footer={<><button className="btn-secondary" onClick={onClose}>Kapat</button><button className="btn-danger" disabled={busy} onClick={() => void run(async () => { await signOut(); toast('Çıkış yapıldı.', 'info'); onClose(); })}><LogOut size={16} /> Çıkış yap</button></>}>
        <FormError message={error} />
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">{(account.fullName || account.email).charAt(0).toLocaleUpperCase('tr-TR')}</span>
          <div className="min-w-0">
            <div className="truncate font-semibold" data-testid="account-name">{account.fullName || '—'}</div>
            <div className="truncate text-sm text-slate-500" data-testid="account-email">{account.email}</div>
            {me && <div className="text-xs text-slate-500" data-testid="account-role">{me.role === 'admin' ? 'Yönetici (ana firma)' : `Şantiye şefi · ${me.siteIds.length} şantiye`}</div>}
          </div>
        </div>
        {me && (
          <button className="btn-secondary mt-4" disabled={refreshing} onClick={() => void refresh().then(() => toast('Veriler güncellendi.'))}>
            <RefreshCw size={16} /> {refreshing ? 'Yenileniyor…' : 'Verileri yenile'}
          </button>
        )}
      </Modal>
    );
  }

  const tabCls = (t: Tab) => `flex-1 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t ? 'border-red-600 text-red-700' : 'border-transparent text-slate-500'}`;
  return (
    <Modal title={tab === 'login' ? 'Giriş yap' : 'Kayıt ol'} onClose={onClose} width="w-[440px]"
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" data-testid="account-submit" onClick={submit} disabled={busy || !SERVER_CONFIGURED}>{tab === 'login' ? <><LogIn size={16} /> Giriş yap</> : <><UserPlus size={16} /> Kayıt ol</>}</button></>}>
      <div className="mb-4 flex border-b border-slate-200" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'login'} className={tabCls('login')} onClick={() => { setTab('login'); setError(null); }}>Giriş yap</button>
        <button type="button" role="tab" aria-selected={tab === 'register'} className={tabCls('register')} onClick={() => { setTab('register'); setError(null); }}>Kayıt ol</button>
      </div>
      {!SERVER_CONFIGURED && (
        <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="account-offline">
          Sunucu bağlantısı henüz kurulmadı; giriş ve kayıt şu an çalışmaz. Veriler yalnızca bu cihazda saklanıyor.
        </p>
      )}
      <FormError message={error} />
      {info && <p className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{info}</p>}
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        {tab === 'register' && (
          <Field label="Ad soyad" required>
            <input name="fullName" className="input" autoComplete="name" value={fullName} maxLength={100} onChange={(e) => setFullName(e.target.value)} />
          </Field>
        )}
        <Field label="E-posta" required>
          <input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@firma.com" />
        </Field>
        <Field label="Şifre" required hint={tab === 'register' ? 'En az 8 karakter.' : undefined}>
          <input name="password" type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {tab === 'register' && (
          <Field label="Şifre (tekrar)" required>
            <input name="password2" type="password" autoComplete="new-password" className="input" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </Field>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
      {tab === 'login' ? (
        <button type="button" className="btn-link mt-3" onClick={forgot} disabled={busy || !SERVER_CONFIGURED}>Şifremi unuttum</button>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Kayıt olduktan sonra yöneticiniz sizi bir şantiyeye atayana kadar kayıtları göremezsiniz.</p>
      )}
    </Modal>
  );
}
