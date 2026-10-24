import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Check,
  CircleAlert,
  Clock3,
  FileSearch,
  Fingerprint,
  Landmark,
  LoaderCircle,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ApiError, publicApi } from '../../api/client';
import { formatDate, formatINR } from '../../api/format';
import { Badge, Button, Card, FormField, Skeleton } from '../../ui';
import { LanguageToggle, useLanguage, type TranslationKey } from '../../shell/language';

type JsonObject = Record<string, unknown>;
type VerifyStatus = 'VALID' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED' | 'EXECUTED' | 'TAMPERED';

interface AmountRow {
  key: string;
  label: TranslationKey;
  paise?: number;
  rupees?: number;
}

const amountLabels: Record<string, TranslationKey> = {
  principal_paise: 'public.amountPrincipal',
  principal: 'public.amountPrincipal',
  aicte_share_paise: 'public.amountAicteShare',
  aicte_share: 'public.amountAicteShare',
  aicte_amount_paise: 'public.amountAicteShare',
  credited_paise: 'public.amountCredited',
  credited_amount: 'public.amountCredited',
  accrued_interest_paise: 'public.amountInterest',
  accrued_interest: 'public.amountInterest',
  total_paise: 'public.amountTotal',
  total: 'public.amountTotal',
};

const statusConfig: Record<VerifyStatus, {
  title: TranslationKey;
  message: TranslationKey;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  icon: typeof Check;
}> = {
  VALID: { title: 'public.statusValid', message: 'public.statusValidMessage', tone: 'success', icon: ShieldCheck },
  EXPIRED: { title: 'public.statusExpired', message: 'public.statusExpiredMessage', tone: 'warning', icon: Clock3 },
  REVOKED: { title: 'public.statusRevoked', message: 'public.statusRevokedMessage', tone: 'danger', icon: Ban },
  SUPERSEDED: { title: 'public.statusSuperseded', message: 'public.statusSupersededMessage', tone: 'neutral', icon: FileSearch },
  EXECUTED: { title: 'public.statusExecuted', message: 'public.statusExecutedMessage', tone: 'info', icon: Check },
  TAMPERED: { title: 'public.statusTampered', message: 'public.statusTamperedMessage', tone: 'danger', icon: X },
};

function asObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function displayStatus(value: unknown): VerifyStatus | null {
  const status = text(value).toUpperCase();
  return status in statusConfig ? status as VerifyStatus : null;
}

function getStatus(result: JsonObject): VerifyStatus | null {
  const envelope = asObject(result.result);
  return displayStatus(result.status ?? result.verify_status ?? envelope.status);
}

function formatRupees(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);
  }
  if (typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value)) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value));
  }
  return null;
}

function getAmountRows(result: JsonObject): AmountRow[] {
  const envelope = asObject(result.result);
  const payload = asObject(result.payload ?? envelope.payload);
  const amounts = asObject(result.amounts);
  const candidates = { ...payload, ...amounts, ...envelope, ...result };
  const rows: AmountRow[] = [];
  const seen = new Set<TranslationKey>();
  for (const [key, label] of Object.entries(amountLabels)) {
    if (seen.has(label) || !(key in candidates)) continue;
    const value = candidates[key];
    let row: AmountRow | null = null;
    if (key.endsWith('_paise')) {
      const paise = typeof value === 'number' && Number.isSafeInteger(value)
        ? value
        : typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
          ? Number(value)
          : undefined;
      if (paise !== undefined) row = { key, label, paise };
    } else if (!key.endsWith('_paise')) {
      const rupees = formatRupees(value);
      if (rupees) row = { key, label, rupees: Number(value) };
    }
    if (row) {
      rows.push(row);
      seen.add(label);
    }
  }
  return rows;
}

function cleanFingerprint(value: unknown): string {
  const fingerprint = text(value).replace(/^sha256:/i, '').trim();
  return /^[a-f\d]{32,128}$/i.test(fingerprint) ? fingerprint : '';
}

function VerifyResult({ result }: { result: JsonObject }) {
  const { t, language } = useLanguage();
  const envelope = asObject(result.result);
  const resultCode = text(result.code ?? result.error_code ?? envelope.code).toUpperCase();
  if (resultCode === 'VERIFY_NO_MATCH' || resultCode === 'NO_MATCH') {
    return <div role="alert" className="public-error"><CircleAlert size={20} /><div><strong>{t('public.noMatchTitle')}</strong><p>{t('public.noMatchMessage')}</p></div></div>;
  }
  const status = getStatus(result);
  if (!status) {
    return <div role="alert" className="public-error"><CircleAlert size={20} /><div><strong>{t('public.unexpectedResponse')}</strong><p>{t('public.tryLater')}</p></div></div>;
  }
  const config = statusConfig[status];
  const Icon = config.icon;
  const letter = asObject(result.letter);
  const payload = asObject(result.payload ?? envelope.payload ?? letter.payload);
  const amounts = getAmountRows(result);
  const fingerprint = cleanFingerprint(result.hash_fingerprint ?? result.payload_hash ?? result.letter_hash ?? result.hash ?? payload.hash);
  const letterReference = text(result.letter_number ?? result.reference ?? letter.letter_number ?? result.code);
  const institute = text(result.institute_name ?? payload.institute_name ?? letter.institute_name);
  const issuedAt = text(result.issued_at ?? result.issued_on ?? letter.issued_at);

  return (
    <section aria-live="polite" className={`public-result public-result-${config.tone}`}>
      <div className="public-result-heading">
        <span className="public-result-icon"><Icon size={24} strokeWidth={1.8} /></span>
        <div className="min-w-0 flex-1">
          <p className="public-eyebrow">{t('public.verificationResult')}</p>
          <h2>{t(config.title)}</h2>
          <p>{t(config.message)}</p>
        </div>
        <Badge tone={config.tone}>{t(config.title)}</Badge>
      </div>
      {(letterReference || institute || issuedAt) && (
        <dl className="public-letter-meta">
          {letterReference && <div><dt>{t('public.letterReference')}</dt><dd>{letterReference}</dd></div>}
          {institute && <div><dt>{t('public.institute')}</dt><dd>{institute}</dd></div>}
          {issuedAt && <div><dt>{t('public.issued')}</dt><dd>{formatDate(issuedAt, language)}</dd></div>}
        </dl>
      )}
      {amounts.length > 0 && (
        <div className="public-amounts">
          <h3>{t('public.amounts')}</h3>
          <table>
            <tbody>
              {amounts.map((row) => <tr key={row.key}><th scope="row">{t(row.label)}</th><td>{row.paise !== undefined ? formatINR(row.paise) : formatRupees(row.rupees)}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      <p className="public-payment-warning"><Landmark size={18} /><strong>{t('public.paymentWarning')}</strong></p>
      {fingerprint && <FingerprintBlock fingerprint={fingerprint} />}
      <div className="public-result-actions no-print">
        <Button variant="secondary" onClick={() => window.print()}><Printer size={15} />{t('public.print')}</Button>
        <Button variant="ghost" onClick={() => window.location.assign('/verify')}>{t('public.verifyAnother')}</Button>
      </div>
    </section>
  );
}

function FingerprintBlock({ fingerprint }: { fingerprint: string }) {
  const { t } = useLanguage();
  const prefix = fingerprint.slice(0, 8);
  const chunks = fingerprint.slice(8).match(/.{1,8}/g) ?? [];
  const fingerprintLines = [prefix, ...chunks].filter(Boolean);
  return (
    <div className="public-fingerprint">
      <div className="flex items-center gap-2"><Fingerprint size={17} /><h3>{t('public.fingerprint')}</h3></div>
      <p>{t('public.fingerprintDescription')}</p>
      <code>{fingerprintLines.map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</code>
    </div>
  );
}

function PublicError({ error }: { error: unknown }) {
  const { t } = useLanguage();
  const apiError = error instanceof ApiError ? error : null;
  const isRateLimited = apiError?.status === 429 || apiError?.code === 'RATE_LIMITED';
  const noMatch = apiError?.code === 'VERIFY_NO_MATCH' || apiError?.code === 'NOT_FOUND' || apiError?.status === 404;
  return (
    <div role="alert" className={`public-error ${isRateLimited ? 'public-error-warning' : ''}`}>
      <CircleAlert size={20} />
      <div>
        <strong>{isRateLimited ? t('public.rateLimitedTitle') : noMatch ? t('public.noMatchTitle') : t('public.verifyError')}</strong>
        <p>{isRateLimited ? t('public.rateLimitedMessage') : noMatch ? t('public.noMatchMessage') : t('public.tryLater')}</p>
      </div>
    </div>
  );
}

export function PublicVerificationPage() {
  const { t } = useLanguage();
  const { code: routeCode } = useParams();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(routeCode ?? '');
  const [fdrNumber, setFdrNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [result, setResult] = useState<JsonObject | null>(null);
  const qrHash = searchParams.get('h');

  const qrQuery = useQuery({
    queryKey: ['public', 'verify', routeCode, qrHash],
    queryFn: () => publicApi.get<JsonObject>(`/public/verify/${encodeURIComponent(routeCode ?? '')}${qrHash ? `?h=${encodeURIComponent(qrHash)}` : ''}`),
    enabled: Boolean(routeCode),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: () => publicApi.post<JsonObject>('/public/verify', {
      code: code.trim(),
      fdr_number: fdrNumber.trim(),
      ifsc: ifsc.trim().toUpperCase(),
    }),
    onSuccess: (response) => setResult(response),
    onError: () => setResult(null),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    mutation.mutate();
  };
  const visibleResult = routeCode ? qrQuery.data ?? null : result;
  const visibleError = routeCode ? qrQuery.error : mutation.error;
  const isLoading = routeCode ? qrQuery.isLoading : mutation.isPending;

  return (
    <main className={`public-page${visibleResult ? ' public-page-result' : ''}`}>
      <header className="public-topbar no-print">
        <Link to="/verify" className="public-brand" aria-label={t('public.home')}>
          <span className="public-seal"><Landmark size={22} /></span>
          <span><strong>SAKSHYA</strong><small>{t('public.brandTagline')}</small></span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/verify" className="public-back-link"><ArrowLeft size={14} />{t('public.verifyLetter')}</Link>
          <LanguageToggle />
        </div>
      </header>
      <div className="public-content">
        <div className="public-intro">
          <span className="public-intro-icon"><ShieldCheck size={21} /></span>
          <p className="public-eyebrow">{t('public.eyebrow')}</p>
          <h1>{t('public.title')}</h1>
          <p className="public-lead">{routeCode ? t('public.qrDescription') : t('public.description')}</p>
        </div>
        {!routeCode && (
          <Card className="public-form-card">
            <form onSubmit={submit} className="space-y-4">
              <FormField label={t('public.code')} name="verification-code" autoComplete="off" required value={code} onChange={(event) => setCode(event.target.value)} />
              <FormField label={t('public.fdrNumber')} name="fdr-number" autoComplete="off" required value={fdrNumber} onChange={(event) => setFdrNumber(event.target.value)} />
              <FormField label={t('public.ifsc')} name="ifsc" autoComplete="off" required value={ifsc} onChange={(event) => setIfsc(event.target.value.toUpperCase())} maxLength={11} />
              {mutation.error && <PublicError error={mutation.error} />}
              <Button className="w-full" type="submit" disabled={!code.trim() || !fdrNumber.trim() || !ifsc.trim()} loading={mutation.isPending}><ShieldCheck size={16} />{t('public.verifyButton')}</Button>
            </form>
            <p className="public-privacy-note"><ShieldCheck size={14} />{t('public.privacyNote')}</p>
          </Card>
        )}
        {routeCode && visibleError && <PublicError error={visibleError} />}
        {isLoading && <Card className="public-loading" aria-label={t('public.loading')}><LoaderCircle size={20} className="animate-spin" /><span>{t('public.loading')}</span><Skeleton className="h-16 w-full" /></Card>}
        {visibleResult && <VerifyResult result={visibleResult} />}
        {!routeCode && !visibleResult && !mutation.error && !mutation.isPending && (
          <div className="public-security-note"><FileSearch size={17} /><p>{t('public.noResultNote')}</p></div>
        )}
        <footer className="public-footer no-print">
          <span>{t('public.footer')}</span>
          <span>{t('public.footerDisclaimer')}</span>
        </footer>
      </div>
    </main>
  );
}
