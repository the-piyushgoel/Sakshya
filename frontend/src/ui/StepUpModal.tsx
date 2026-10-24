import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

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
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!/^\d{6}$/.test(pin)) {
      setError('Enter your 6-digit step-up PIN.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(pin);
      setPin('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Step-up verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={title} description="A fresh step-up check is required for this sensitive action." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} loading={busy} leftIcon={<KeyRound size={15} />}>Verify & continue</Button></>}>
      <div className="flex items-start gap-3 rounded-xl bg-navy-50 p-4"><span className="rounded-lg bg-white p-2 text-navy-700"><ShieldCheck size={19} /></span><p className="text-sm leading-6 text-slate-600">Your action is protected by role separation and will be added to the audit trail.</p></div>
      <label className="field-label mt-5">6-digit PIN
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} type="password" className="input-control mt-1.5 tracking-[0.35em]" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, '')); setError(''); }} onKeyDown={(event) => event.key === 'Enter' && void submit()} />
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}
