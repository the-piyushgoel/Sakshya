import { useState, type FormEvent } from 'react';
import { ArrowRight, Landmark, ShieldCheck } from 'lucide-react';
import { useAuth } from './auth';
import { Button } from '../ui';
import { LanguageToggle, useLanguage } from './language';

export function LoginPage() {
  const { login, signup, demoUsersError } = useAuth();
  const { t } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSignUp && password !== confirmPassword) {
      setError(t('login.passwordMismatch'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (isSignUp) {
        await signup(username, displayName, password);
      } else {
        await login(username, password);
      }
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
        <div className="login-brand" aria-label="Sakshya brand">
          <div className="brand-badge" aria-hidden="true"><span className="brand-symbol" /></div>
          <div>
            <strong>SAKSHYA</strong>
            <small>सुरक्षा निधि एवं एकत्रीकरण प्रबंधन</small>
          </div>
        </div>
        <div className="login-message">
          <h1>SAKSHYA</h1>
          <p className="login-hindi-tagline">सुरक्षा निधि एवं एफडीआर प्रबंधन</p>
        </div>
        <div className="login-hero-foot"><Landmark size={17} /> {t('login.auditNote')}</div>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={(event) => void submit(event)} className="login-form">
          <div className="login-form-language"><LanguageToggle /></div>
          <div className="mb-8">
            <div className="login-mobile-brand"><span className="brand-mark"><ShieldCheck size={23} /></span><strong>Sakshya</strong></div>
            <span className="eyebrow">{t(isSignUp ? 'login.signupWelcome' : 'login.welcome')}</span>
            <h2>{t(isSignUp ? 'login.signupTitle' : 'login.title')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{t(isSignUp ? 'login.signupDescription' : 'login.description')}</p>
          </div>
          {demoUsersError && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{t('login.demoUnavailable', { error: demoUsersError })}</p>}
          {isSignUp && <label className="field-label mt-4">{t('login.displayName')}
            <input autoComplete="name" maxLength={128} className="input-control mt-1.5" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>}
          <label className="field-label mt-4">{t('login.username')}
            <input autoComplete="username" minLength={3} maxLength={64} pattern="[A-Za-z0-9_.\\-]+" className="input-control mt-1.5" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label className="field-label mt-4">{t('login.password')}
            <input autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={isSignUp ? 8 : undefined} maxLength={72} type="password" className="input-control mt-1.5" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {isSignUp && <label className="field-label mt-4">{t('login.confirmPassword')}
            <input autoComplete="new-password" minLength={8} maxLength={72} type="password" className="input-control mt-1.5" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </label>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}
          <Button className="mt-6 w-full justify-center" type="submit" loading={busy} rightIcon={<ArrowRight size={16} />}>{t(isSignUp ? 'login.signupSubmit' : 'login.submit')}</Button>
          <button
            type="button"
            className="mt-4 w-full text-sm font-semibold text-blue-700 hover:underline"
            onClick={() => {
              setIsSignUp((current) => !current);
              setError('');
            }}
          >
            {t(isSignUp ? 'login.switchToLogin' : 'login.switchToSignup')}
          </button>
          <div className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-trust-confirmed" /> {t(isSignUp ? 'login.signupNotice' : 'login.authNotice')}</div>
        </form>
      </section>
    </main>
  );
}
