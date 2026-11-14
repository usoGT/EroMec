import { useEffect, useState } from 'react';
import { DatabaseBackup, Plus, RotateCcw, Save, Upload } from 'lucide-react';
import type { Category } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import { useSession } from '../lib/session';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { Field, FormError, MoneyInput } from '../components/Fields';

const KIND_LABEL = { salary: 'Maaş gideri', overtime: 'Ek mesai ödemesi', other: 'Genel gider' } as const;
type Kind = keyof typeof KIND_LABEL;

export default function SettingsPage() {
  const { settings, reloadSettings, toast, showError, money } = useApp();
  const { me, refresh } = useSession();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dbInfo, setDbInfo] = useState<{ path: string; schemaVersion: number } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState('');
  const [newKind, setNewKind] = useState<Kind>('other');
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(settings), [settings]);
  useEffect(() => {
    api.dbInfo().then(setDbInfo).catch(showError);
    api.categoriesList().then(setCategories).catch(showError);
  }, [showError]);

  const save = async () => {
    if (saving) return;
    if (!form.companyName.trim()) return setError('Şirket adı boş bırakılamaz.');
    if (!form.appName.trim()) return setError('Uygulama adı boş bırakılamaz.');
    setSaving(true);
    setError(null);
    try {
      await api.settingsSave(form);
      await reloadSettings();
      toast('Ayarlar kaydedildi.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    try {
      await api.categoryCreate({ name: newCat, kind: newKind });
      setNewCat('');
      setCategories(await api.categoriesList());
      toast('Kategori eklendi.');
    } catch (e) {
      showError(e);
    }
  };

  const backup = async () => {
    setBusy(true);
    try {
      const r = await api.backupCreate();
      if (r.saved) toast(`Yedek kaydedildi: ${r.path}`);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      // Dosya seçimi ve "üzerine yazılacak" onayı ana süreçteki pencerelerle yapılır.
      const r = await api.backupRestore();
      if (r.imported) {
        toast(r.imported);
        await refresh();
      } else if (r.restored) {
        toast('Yedek geri yüklendi. Uygulama yenileniyor…');
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Ayarlar" />

      <section className="card mb-4 px-5 py-4">
        <h2 className="mb-3 font-semibold">Genel</h2>
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Şirket adı" required>
            <input name="companyName" className="input" value={form.companyName} maxLength={100} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </Field>
          <Field label="Uygulama adı" required>
            <input name="appName" className="input" value={form.appName} maxLength={50} onChange={(e) => setForm({ ...form, appName: e.target.value })} />
          </Field>
          <Field label="Varsayılan para birimi" hint="Yalnızca gösterilen simgeyi değiştirir; tutarlar dönüştürülmez.">
            <select name="currency" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="TRY">Türk lirası (₺)</option>
              <option value="USD">ABD doları ($)</option>
              <option value="EUR">Euro (€)</option>
            </select>
          </Field>
          <Field label="Günlük asgari ücret" hint={<>Puantaj ve bordroda <b>asgari (resmi / bankaya yatan)</b> kısım = günlük asgari × ücretli gün; kalanı <b>elden</b> gösterilir. Aylık (30 gün): {money((form.dailyMinWageKurus ?? 0) * 30)}</>}>
            <MoneyInput name="dailyMinWage" value={form.dailyMinWageKurus ?? 0} onChange={(k) => setForm({ ...form, dailyMinWageKurus: k ?? 0 })} />
          </Field>
          <Field label="Görünüm" hint="Gece modu ekranı koyu renklere çevirir.">
            <select name="theme" className="input" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value as typeof form.theme })}>
              <option value="light">Gündüz (açık)</option>
              <option value="dark">Gece modu (koyu)</option>
              <option value="system">Cihaz ayarına göre</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <button className="btn-primary" onClick={() => void save()} disabled={saving}><Save size={16} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </section>

      <section className="card mb-4 px-5 py-4">
        <h2 className="mb-1 font-semibold">Veritabanı yedekleme</h2>
        <p className="mb-3 text-sm text-slate-600">
          {me
            ? 'Veriler sunucuda saklanır. “Yedek al” gördüğünüz bütün verilerin bir kopyasını bu cihaza indirir.'
            : 'Bütün veriler bu bilgisayardaki tek bir dosyada saklanır. Düzenli olarak yedek alıp USB belleğe veya başka bir diske kopyalamanız önerilir.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void backup()} disabled={busy}><DatabaseBackup size={16} /> Yedek al</button>
          <button className="btn-secondary" data-testid="backup-restore" onClick={() => void restore()} disabled={busy}>
            {me ? <><Upload size={16} /> Masaüstü yedeğini aktar</> : <><RotateCcw size={16} /> Yedekten geri yükle</>}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {me
            ? 'Masaüstü uygulamasından aldığınız yedek dosyasındaki (.db) bütün kayıtlar hesabınıza eklenir; mevcut veriler silinmez. Aynı yedek iki kez aktarılamaz.'
            : 'Geri yükleme mevcut verilerin üzerine yazar; işlemden önce onay istenir ve mevcut verilerin otomatik bir kopyası “yedekler” klasörüne kaydedilir.'}
        </p>
        {dbInfo && (
          <p className="mt-2 break-all text-xs text-slate-500">
            Veritabanı dosyası: <span className="font-mono">{dbInfo.path}</span> · Şema sürümü: {dbInfo.schemaVersion}
          </p>
        )}
      </section>

      <section className="card px-5 py-4">
        <h2 className="mb-3 font-semibold">Gider kategorileri</h2>
        <p className="mb-2 text-xs text-slate-500">
          Tür, raporda giderin nereye sayılacağını belirler: <b>Maaş gideri</b> “Toplam maaş gideri”ne, <b>Genel gider</b> “Diğer giderler”e eklenir.
          <b> Ek mesai ödemesi</b> yalnızca takip içindir (mesai maliyeti mesai kayıtlarından gelir, iki kez sayılmaz).
          “Personel maaşı” ve “Ek mesai” bordro için gerekli olduğundan silinemez; diğer kategoriler düzenlenip silinebilir (giderleri başka kategoriye taşınır).
        </p>
        <table className="grid-table mb-3" aria-label="Gider kategorileri">
          <thead><tr><th>Kategori</th><th className="w-56">Tür</th><th className="w-20 text-right">Kayıt</th><th className="w-28" /></tr></thead>
          <tbody>
            {categories.map((c) => <CategoryRow key={`${c.id}-${c.name}-${c.kind}-${c.expenseCount}`} c={c} all={categories} onChanged={async () => setCategories(await api.categoriesList())} />)}
          </tbody>
        </table>
        <div className="flex gap-2">
          <input className="input w-72" placeholder="Yeni kategori adı" value={newCat} maxLength={60}
            onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addCategory()} aria-label="Yeni kategori adı" />
          <select className="input w-48" value={newKind} onChange={(e) => setNewKind(e.target.value as Kind)} aria-label="Yeni kategori türü">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => void addCategory()} disabled={!newCat.trim()}><Plus size={16} /> Kategori ekle</button>
        </div>
      </section>
    </div>
  );
}

function CategoryRow({ c, all, onChanged }: { c: Category; all: Category[]; onChanged: () => Promise<void> }) {
  const { toast, confirm, showError } = useApp();
  const [name, setName] = useState(c.name);
  const [kind, setKind] = useState<Kind>(c.kind);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<number>(0);
  const dirty = name !== c.name || kind !== c.kind;
  const targets = all.filter((x) => x.id !== c.id);

  const save = async () => {
    try {
      await api.categoryUpdate({ id: c.id, name, kind });
      toast('Kategori güncellendi.');
      await onChanged();
    } catch (e) {
      showError(e);
    }
  };
  const doDelete = async (moveToId?: number) => {
    try {
      await api.categoryDelete({ id: c.id, moveToId });
      toast(moveToId ? `“${c.name}” silindi; giderleri taşındı.` : `“${c.name}” silindi.`);
      setMoveOpen(false);
      await onChanged();
    } catch (e) {
      showError(e);
    }
  };
  const remove = async () => {
    if (c.expenseCount > 0) {
      setMoveTo(targets.find((x) => x.kind === c.kind)?.id ?? targets[0]?.id ?? 0);
      setMoveOpen(true);
      return;
    }
    if (await confirm({ title: 'Kategoriyi sil', message: `“${c.name}” kategorisi silinsin mi?`, confirmText: 'Sil', danger: true })) await doDelete();
  };

  return (
    <tr data-category={c.name}>
      <td className="!p-0.5"><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Kategori adı" /></td>
      <td className="!p-0.5">
        {c.isSystem ? (
          <span className="px-2 text-sm text-slate-600" title="Bordro ve mesai ödemeleri bu kategoriyi kullanır">{KIND_LABEL[c.kind]} · korumalı</span>
        ) : (
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label={`${c.name} türü`}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        )}
      </td>
      <td className="text-right text-xs text-slate-500">{c.expenseCount} gider</td>
      <td className="whitespace-nowrap">
        {dirty && <button className="btn-link" onClick={() => void save()}>Kaydet</button>}
        {!c.isSystem && <button className="btn-link-danger" onClick={() => void remove()}>Sil</button>}
        {moveOpen && (
          <Modal title={`“${c.name}” kategorisini sil`} onClose={() => setMoveOpen(false)}
            footer={<><button className="btn-secondary" onClick={() => setMoveOpen(false)}>Vazgeç</button><button className="btn-danger" disabled={!moveTo} onClick={() => void doDelete(moveTo)}>Taşı ve sil</button></>}>
            <p className="mb-3 text-sm text-slate-700">
              Bu kategoride <b>{c.expenseCount} gider kaydı</b> var. Kayıtlar kaybolmasın diye önce başka bir kategoriye taşınacak, sonra kategori silinecek.
            </p>
            <label className="label" htmlFor="moveTo">Giderlerin taşınacağı kategori</label>
            <select id="moveTo" name="moveTo" className="input" value={moveTo} onChange={(e) => setMoveTo(Number(e.target.value))}>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.name} ({KIND_LABEL[t.kind]})</option>)}
            </select>
          </Modal>
        )}
      </td>
    </tr>
  );
}
