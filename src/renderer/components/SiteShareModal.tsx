// Şantiye paylaşma (çevrimiçi sürüm): şantiyeyi açan kişi kayıtlı başka üyeleri e-postasıyla ekler/çıkarır.
import { useCallback, useEffect, useState } from 'react';
import { LogOut, Trash2, UserPlus } from 'lucide-react';
import type { Site } from '../../shared/types';
import type { SiteMember } from '../../web/webApi';
import { errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import { useSession } from '../lib/session';
import Modal from './Modal';
import { Field, FormError } from './Fields';

export default function SiteShareModal({ site, onClose }: { site: Site; onClose: () => void }) {
  const { toast, confirm } = useApp();
  const { me, refresh } = useSession();
  const sync = window.eromecSync!;
  const [members, setMembers] = useState<SiteMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await sync.siteMembers(site.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [sync, site.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = members?.some((m) => m.isOwner && m.userId === me?.id) ?? false;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setError('Geçerli bir e-posta adresi girin.');
    void run(async () => {
      const m = await sync.siteShare(site.id, mail);
      setEmail('');
      toast(`${m.fullName || m.email} artık “${site.name}” şantiyesini görüyor.`);
      await load();
    });
  };

  const remove = (m: SiteMember) => void run(async () => {
    const self = m.userId === me?.id;
    const ok = await confirm({
      title: self ? 'Şantiyeden ayrıl' : 'Üyeyi çıkar',
      message: self
        ? <>“<b>{site.name}</b>” şantiyesinden ayrılırsanız bu şantiyenin kayıtlarını artık göremezsiniz. Emin misiniz?</>
        : <><b>{m.fullName || m.email}</b> bu şantiyeyi ve kayıtlarını artık göremeyecek. Emin misiniz?</>,
      confirmText: self ? 'Ayrıl' : 'Çıkar',
      danger: true,
    });
    if (!ok) return;
    await sync.siteUnshare(site.id, m.userId);
    if (self) {
      toast(`“${site.name}” şantiyesinden ayrıldınız.`, 'info');
      onClose();
      await refresh();
      return;
    }
    toast(`${m.fullName || m.email} şantiyeden çıkarıldı.`, 'info');
    await load();
  });

  return (
    <Modal title={`Paylaş — ${site.name}`} onClose={onClose} width="w-[520px]"
      footer={<button className="btn-primary" onClick={onClose}>Kapat</button>}>
      <p className="mb-3 text-sm text-slate-600">
        Eklediğiniz kişi bu şantiyeyi ve şantiyeye bağlı bütün kayıtları (çalışanlar, puantaj, mesai, gider, bordro; maaş, T.C. ve IBAN dahil) görür ve düzenleyebilir.
      </p>
      <FormError message={error} />
      {isOwner && (
        <form className="mb-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); add(); }} noValidate>
          <div className="flex-1">
            <Field label="Üyenin e-postası" hint="Kişi önce uygulamadan kayıt olmuş olmalı.">
              <input name="shareEmail" type="email" inputMode="email" autoCapitalize="none" className="input" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="ornek@firma.com" data-testid="share-email" />
            </Field>
          </div>
          <button type="submit" className="btn-primary mb-[22px]" disabled={busy || !email.trim()} data-testid="share-add"><UserPlus size={16} /> Ekle</button>
        </form>
      )}
      <h3 className="mb-1 font-semibold">Bu şantiyeyi görenler</h3>
      {!members ? <p className="text-sm text-slate-500">Yükleniyor…</p> : (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200" data-testid="share-members">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.fullName || '—'}{m.userId === me?.id && <span className="ml-1 text-xs text-slate-500">(siz)</span>}</div>
                <div className="truncate text-sm text-slate-500">{m.email}</div>
              </div>
              {m.isOwner ? <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Açan kişi</span>
                : m.userId === me?.id ? <button className="btn-link-danger" disabled={busy} onClick={() => remove(m)}><LogOut size={14} /> Ayrıl</button>
                : isOwner && <button className="btn-link-danger" disabled={busy} onClick={() => remove(m)}><Trash2 size={14} /> Çıkar</button>}
            </li>
          ))}
        </ul>
      )}
      {!isOwner && members && <p className="mt-3 text-xs text-slate-500">Üye ekleyip çıkarmayı yalnızca şantiyeyi açan kişi yapabilir.</p>}
    </Modal>
  );
}
