// İlk giriş: kullanıcı firma sahibi mi (firmasını oluşturur) yoksa şef/çalışan mı (firma koduyla katılır)?
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, HardHat, LogIn, LogOut } from 'lucide-react';
import { errorMessage } from '../lib/api';

type Step = 'choose' | 'create' | 'join';

export default function WorkspaceSetup({ email, onReady, onSignOut }: { email: string; onReady: () => Promise<void>; onSignOut: () => void }) {
  const [step, setStep] = useState<Step>('choose');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sahip bu kişiyi e-postasıyla eklerse kendiliğinden devam edilir.
  useEffect(() => {
    const t = setInterval(() => void onReady().catch(() => undefined), 20_000);
    return () => clearInterval(t);
  }, [onReady]);

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onReady();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (name.trim().length < 2) return setError('Firmanın adını yazın.');
    void run(() => window.eromecSync!.workspaceCreate(name.trim()));
  };
  const join = () => {
    const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (c.length !== 6) return setError('Firma kodu 6 karakterdir. İşletme sahibinden alın.');
    void run(async () => {
      await window.eromecSync!.workspaceJoin(c);
    });
  };

  const choice = 'flex w-full items-center gap-3 rounded-lg border border-white/20 bg-white/5 px-4 py-3.5 text-left hover:bg-white/10 disabled:opacity-50';
  const back = <button type="button" className="mb-3 flex items-center gap-1 text-sm text-white/60 hover:text-white" onClick={() => go('choose')}><ArrowLeft size={15} /> Geri</button>;

  return (
    <div className="w-full max-w-sm text-left" data-testid="workspace-setup">
      {error && <p className="mb-3 rounded border border-red-500/60 bg-red-900/30 px-3 py-2 text-sm" role="alert">{error}</p>}

      {step === 'choose' && (
        <>
          <h2 className="mb-1 text-center text-lg font-semibold">Hoş geldin! Sen kimsin?</h2>
          <p className="mb-4 text-center text-sm text-white/65">Başlamak için birini seç.</p>
          <div className="grid gap-2.5">
            <button className={choice} onClick={() => go('create')} data-testid="choose-owner">
              <Building2 size={26} className="shrink-0 text-red-500" />
              <span><b className="block">Firma sahibiyim</b><span className="text-sm text-white/65">Firmamı oluşturayım, şeflerimi ekleyeyim.</span></span>
            </button>
            <button className={choice} onClick={() => go('join')} data-testid="choose-member">
              <HardHat size={26} className="shrink-0 text-red-500" />
              <span><b className="block">Şef / çalışanım</b><span className="text-sm text-white/65">Çalıştığım firmaya firma koduyla katılayım.</span></span>
            </button>
          </div>
        </>
      )}

      {step === 'create' && (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); create(); }}>
          {back}
          <h2 className="text-lg font-semibold">Firmanı oluştur</h2>
          <p className="mb-2 text-sm text-white/65">Personel, puantaj ve giderler firmana ait olur; başka firmalar göremez. Sonra şeflerine firma kodunu verirsin.</p>
          <label className="text-sm font-medium" htmlFor="ws-name">Firmanın adı</label>
          <input id="ws-name" className="input !bg-white !text-black" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Örn. Yılmaz İnşaat" autoFocus />
          <button type="submit" className="btn-primary justify-center !py-2.5" disabled={busy} data-testid="workspace-create"><Building2 size={17} /> {busy ? 'Oluşturuluyor…' : 'Firmayı oluştur'}</button>
        </form>
      )}

      {step === 'join' && (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); join(); }}>
          {back}
          <h2 className="text-lg font-semibold">Firmana katıl</h2>
          <p className="mb-2 text-sm text-white/65">Firma kodunu işletme sahibinden iste (Ayarlar → İşletme ve üyeler'de yazar).</p>
          <label className="text-sm font-medium" htmlFor="ws-code">Firma kodu</label>
          <input id="ws-code" className="input !bg-white text-center font-mono text-lg uppercase tracking-[0.3em] !text-black" value={code} maxLength={8}
            autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} placeholder="K7M4QX" autoFocus data-testid="workspace-code" />
          <button type="submit" className="btn-primary justify-center !py-2.5" disabled={busy} data-testid="workspace-join"><LogIn size={17} /> {busy ? 'Katılınıyor…' : 'Katıl'}</button>
          <p className="mt-3 text-xs text-white/55">
            Kod yoksa: işletme sahibi seni e-postanla da ekleyebilir (<span className="break-all font-mono text-white/80">{email}</span>). Eklendiğinde bu ekran kendiliğinden açılır.
          </p>
        </form>
      )}

      <div className="mt-6 flex justify-center">
        <button className="btn border-white/30 text-white hover:bg-white/10" onClick={onSignOut}><LogOut size={15} /> Çıkış yap</button>
      </div>
    </div>
  );
}
