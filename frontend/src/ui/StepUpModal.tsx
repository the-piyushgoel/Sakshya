import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { useLanguage } from '../shell/language';

export function StepUpModal({
  open,
  onClose,
  onSubmit,
  title = 'Confirm this action',
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<void>;
  title?: string;
}) {
  const { t } = useLanguage();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!/^\d{6}$/.test(pin)) {
      setError(t('stepup.invalidPin'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(pin);
      setPin('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('stepup.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={title === 'Confirm this action' ? t('stepup.title') : title} description={t('stepup.description')} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('nav.cancel')}</Button><Button onClick={() => void submit()} loading={busy} leftIcon={<KeyRound size={15} />}>{t('stepup.continue')}</Button></>}>
      <div className="flex items-start gap-3 rounded-xl bg-navy-50 p-4"><span className="rounded-lg bg-white p-2 text-navy-700"><ShieldCheck size={19} /></span><p className="text-sm leading-6 text-slate-600">{t('stepup.securityMessage')}</p></div>
      <label className="field-label mt-5">{t('stepup.pin')}
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} type="password" className="input-control mt-1.5 tracking-[0.35em]" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, '')); setError(''); }} onKeyDown={(event) => event.key === 'Enter' && void submit()} />
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}
