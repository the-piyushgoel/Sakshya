import { useState, type FormEvent } from 'react';
import { ArrowRight, Landmark, ShieldCheck } from 'lucide-react';
import { useAuth } from './auth';
import { Button } from '../ui';
import { LanguageToggle, useLanguage } from './language';

export function LoginPage() {
  const { login, demoUsers, demoUsersError } = useAuth();
  const { t, label } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('login.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="login-language"><LanguageToggle /></div>
        <div className="login-brand"><span className="brand-mark brand-mark-light"><ShieldCheck size={25} /></span><div><strong>Sakshya</strong><small>AICTE FDR PORTAL</small></div></div>
        <div className="login-message">
          <span className="eyebrow eyebrow-light">{t('login.eyebrow')}</span>
          <h1>{t('login.heroTitle').split('\n').map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1>
          <p>{t('login.heroDescription')}</p>
        </div>
        <div className="login-hero-foot"><Landmark size={17} /> {t('login.auditNote')}</div>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={(event) => void submit(event)} className="login-form">
          <div className="login-form-language"><LanguageToggle /></div>
          <div className="mb-8">
            <div className="login-mobile-brand"><span className="brand-mark"><ShieldCheck size={23} /></span><strong>Sakshya</strong></div>
            <span className="eyebrow">{t('login.welcome')}</span>
            <h2>{t('login.title')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{t('login.description')}</p>
          </div>
          {demoUsers.length > 0 && (
            <label className="field-label">{t('login.demoAccount')}
              <select className="input-control mt-1.5" value={username} onChange={(event) => setUsername(event.target.value)}>
                <option value="">{t('login.chooseAccount')}</option>
                {demoUsers.map((demoUser) => <option key={demoUser.username} value={demoUser.username}>{demoUser.display_name ?? demoUser.username}{demoUser.roles?.[0] ? ` · ${label(demoUser.roles[0])}` : ''}</option>)}
              </select>
            </label>
          )}
          {demoUsersError && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{t('login.demoUnavailable', { error: demoUsersError })}</p>}
          <label className="field-label mt-4">{t('login.username')}
            <input autoComplete="username" className="input-control mt-1.5" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label className="field-label mt-4">{t('login.password')}
            <input autoComplete="current-password" type="password" className="input-control mt-1.5" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}
          <Button className="mt-6 w-full justify-center" type="submit" loading={busy} rightIcon={<ArrowRight size={16} />}>{t('login.submit')}</Button>
          <div className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-trust-confirmed" /> {t('login.authNotice')}</div>
        </form>
      </section>
    </main>
  );
}
