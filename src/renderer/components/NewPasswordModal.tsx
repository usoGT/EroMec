// Şifre yenileme bağlantısıyla gelen kullanıcıdan yeni şifre alınır.
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { authErrorMessage, useAuth } from '../lib/auth';
import { useApp } from '../lib/context';
import Modal from './Modal';
import { Field, FormError } from './Fields';

export default function NewPasswordModal() {
  const { updatePassword, endRecovery } = useAuth();
  const { toast } = useApp();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (p1.length < 8) return setError('Şifre en az 8 karakter olmalı.');
    if (p1 !== p2) return setError('Şifreler birbiriyle aynı değil.');
    setBusy(true);
    setError(null);
    try {
      await updatePassword(p1);
      toast('Yeni şifreniz kaydedildi.');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Yeni şifre belirle" onClose={endRecovery} width="w-[420px]"
      footer={<><button className="btn-secondary" onClick={endRecovery}>Sonra</button><button className="btn-primary" disabled={busy} onClick={() => void submit()}><KeyRound size={16} /> Kaydet</button></>}>
      <FormError message={error} />
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <Field label="Yeni şifre" required hint="En az 8 karakter.">
          <input name="newPassword" type="password" autoComplete="new-password" className="input" value={p1} onChange={(e) => setP1(e.target.value)} autoFocus />
        </Field>
        <Field label="Yeni şifre (tekrar)" required>
          <input name="newPassword2" type="password" autoComplete="new-password" className="input" value={p2} onChange={(e) => setP2(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
