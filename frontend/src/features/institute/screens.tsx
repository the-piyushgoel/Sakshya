import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CircleAlert,
  Download,
  FileText,
  Landmark,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { api, apiRequest, ApiError, getAccessToken } from '../../api/client';
import { formatDate, formatINR } from '../../api/format';
import type { NotificationItem } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  FileDrop,
  FormField,
  Skeleton,
  StatusPill,
  Timeline,
  TrustBadge,
  useToasts,
} from '../../ui';
import { useAuth } from '../../shell/auth';
import { useLanguage, type TranslationKey } from '../../shell/language';

type JsonObject = Record<string, unknown>;
type TrustLevel = 'L0_CLAIMED' | 'L1_ATTESTED' | 'L2_BANK_CONFIRMED';

interface Obligation {
  id: string;
  reference?: string;
  programme?: string;
  state?: string;
  required_paise?: number;
  covered_paise?: number;
  confirmed_paise?: number;
  provisional_paise?: number;
  term_end_date?: string;
}

interface Instrument {
  id: string;
  fdr_number?: string;
  bank_ifsc?: string;
  principal_paise?: number;
  issue_date?: string;
  maturity_date?: string;
  state?: string;
  obligation_id?: string;
  fields?: Record<string, unknown>;
  discrepancies?: unknown[];
  is_quarantined?: boolean;
  on_hold?: boolean;
}

interface DocCheck {
  name?: string;
  outcome?: string;
  confidence?: number;
  details?: unknown;
}

interface EligibilityRule {
  rule_id?: string;
  result?: string;
  message?: string;
  fix_hint?: string;
}

const fieldSpecs = [
  { key: 'fdr_number', translation: 'institute.fieldFdr', required: true },
  { key: 'bank_ifsc', translation: 'institute.fieldIfsc', required: true },
  { key: 'principal_paise', translation: 'institute.fieldAmount', required: true, type: 'number' },
  { key: 'issue_date', translation: 'institute.fieldIssueDate', required: true, type: 'date' },
  { key: 'maturity_date', translation: 'institute.fieldMaturityDate', required: true, type: 'date' },
  { key: 'interest_rate_pct', translation: 'institute.fieldRate', required: false, type: 'number' },
  { key: 'favouring', translation: 'institute.fieldFavouring', required: true },
  { key: 'holder_names', translation: 'institute.fieldHolder', required: true },
] as const;

const discrepancyTranslations: Record<string, string> = {
  'D-02': 'institute.flagD02',
  'D-05': 'institute.flagD05',
  'D-07': 'institute.flagD07',
  'D-10': 'institute.flagD10',
  'D-11': 'institute.flagD11',
  'D-12': 'institute.flagD12',
  'D-14': 'institute.flagD14',
  'D-15': 'institute.flagD15',
  'D-17': 'institute.flagD17',
  'D-18': 'institute.flagD18',
};

function asObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {};
}

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const object = asObject(value);
  return Array.isArray(object.items) ? object.items as T[] : [];
}

function normalizeInstrumentFields(value: unknown): JsonObject {
  if (!Array.isArray(value)) return asObject(value);
  return value.reduce<JsonObject>((fields, item) => {
    const field = asObject(item);
    const name = text(field.name);
    if (name) fields[name] = field;
    return fields;
  }, {});
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function recordId(record: JsonObject): string {
  return text(record.id ?? record.obligation_id ?? record.instrument_id ?? record.release_id);
}

function amount(value: number | undefined): string {
  return value === undefined ? '—' : formatINR(value);
}

function translateFlag(code: string, t: (key: TranslationKey) => string): string {
  const key = discrepancyTranslations[code];
  return key ? t(key as TranslationKey) : t('institute.flagGeneric');
}

function PageHeader({
  eyebrow,
  title,
  description,
  backTo,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  backTo?: string;
  actions?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="page-heading">
      <div className="min-w-0">
        {backTo && <Link to={backTo} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-800"><ArrowLeft size={14} />{t('institute.back')}</Link>}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </section>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useLanguage();
  const { pushToast } = useToasts();
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Card className="border-red-200 bg-red-50">
      <div className="flex items-start gap-3 text-red-900">
        <CircleAlert size={19} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{t('institute.apiError')}</p>
          <p className="mt-1 break-words text-sm">{apiError?.message ?? (error instanceof Error ? error.message : t('institute.apiError'))}</p>
          {apiError?.code && <p className="mt-1 font-mono text-xs">{t('institute.loadErrorCode', { code: apiError.code })}</p>}
          {onRetry && <Button className="mt-3" size="sm" variant="secondary" onClick={onRetry}>{t('institute.retry')}</Button>}
        </div>
        <button
          type="button"
          className="ml-auto text-xs underline"
          onClick={() => pushToast({ title: apiError?.code ?? 'REQUEST_ERROR', description: apiError?.message ?? 'Request failed', tone: 'error', code: apiError?.code })}
        >
          {t('institute.refresh')}
        </button>
      </div>
    </Card>
  );
}

function LoadingState() {
  const { t } = useLanguage();
  return <div role="status" aria-label={t('institute.loading')} className="space-y-4"><Skeleton className="h-7 w-56" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div>;
}

function useObligations() {
  const { user } = useAuth();
  return useQuery({
    // Cached records must never carry over when a demo user/account changes.
    queryKey: ['institute', 'obligations', user?.id],
    queryFn: async () => {
      const rows = asList<Obligation>(await api.get<unknown>('/obligations'));
      return [...new Map(rows.map((row) => [row.id, row])).values()];
    },
    enabled: Boolean(user),
  });
}

function useInstruments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['institute', 'instruments', user?.id],
    queryFn: async () => asList<Instrument>(await api.get<unknown>('/instruments')),
    enabled: Boolean(user),
  });
}

export function DashboardPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const obligationsQuery = useObligations();
  const instrumentsQuery = useInstruments();
  const instituteQuery = useQuery({
    queryKey: ['institute', 'profile', user?.id],
    queryFn: () => api.get<JsonObject>('/institutes/me'),
    enabled: Boolean(user),
  });
  const obligations = obligationsQuery.data ?? [];
  const instruments = instrumentsQuery.data ?? [];
  const instituteName = text(instituteQuery.data?.name ?? instituteQuery.data?.institute_name);
  const obligation = obligations[0];
  const confirmed = obligation?.covered_paise ?? obligation?.confirmed_paise ?? 0;
  const provisional = obligation?.provisional_paise ?? 0;
  const required = obligation?.required_paise;
  const coverage = required && required > 0 ? Math.min(100, Math.round((confirmed / required) * 100)) : 0;
  const remaining = required === undefined ? undefined : Math.max(0, required - confirmed);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow={t('institute.eyebrow')} title={t('institute.title')} description={t('institute.description')} actions={<Link className="button button-primary button-md" to="/institute/submit"><Upload size={15} />{t('institute.submitFdr')}</Link>} />
      {instituteQuery.isError && <LoadError error={instituteQuery.error} onRetry={() => void instituteQuery.refetch()} />}
      {instituteName && <p className="-mt-4 text-sm font-semibold text-slate-600">{instituteName}</p>}
      {obligationsQuery.isLoading || instrumentsQuery.isLoading ? <LoadingState /> :
        obligationsQuery.isError ? <LoadError error={obligationsQuery.error} onRetry={() => void obligationsQuery.refetch()} /> :
          instrumentsQuery.isError ? <LoadError error={instrumentsQuery.error} onRetry={() => void instrumentsQuery.refetch()} /> :
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <Card id="obligations" title={t('institute.obligation')} description={obligation?.programme ?? obligation?.reference ?? t('institute.description')} action={obligation?.state ? <StatusPill value={obligation.state} /> : undefined}>
                {obligation ? <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Metric label={t('institute.required')} value={amount(required)} />
                    <Metric label={t('institute.confirmed')} value={amount(confirmed)} />
                    <Metric label={t('institute.provisional')} value={amount(provisional)} />
                  </div>
                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">{t('institute.coverage')}</span><span className="font-bold text-navy-800">{required === undefined ? '—' : `${coverage}%`}</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={coverage} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${coverage}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{t('institute.confirmed')}: {amount(confirmed)}</span><span>{t('institute.remaining')}: {amount(remaining)}</span></div>
                  </div>
                  {obligation.term_end_date && <p className="mt-4 text-xs text-slate-500">{t('institute.nextRenewal')}: {formatDate(obligation.term_end_date, language)}</p>}
                </> : <EmptyState title={t('institute.coverageEmpty')} />}
              </Card>
              <Card title={t('institute.dashboard')} description={t('institute.recentInstruments')} padding="none">
                {instruments.length === 0 ? <EmptyState title={t('institute.noInstruments')} icon={<FileText size={20} />} action={<Link className="button button-primary button-sm" to="/institute/submit">{t('institute.submitFdr')}</Link>} /> :
                  <div className="divide-y divide-slate-100">{instruments.slice(0, 5).map((instrument) => <InstrumentListItem key={instrument.id} instrument={instrument} />)}</div>}
                <div className="border-t border-slate-100 p-4"><Link className="button button-secondary button-sm" to="/institute/instruments">{t('institute.viewInstruments')} <ArrowRight size={14} /></Link></div>
              </Card>
            </div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickLink to="/institute/release" icon={<ShieldCheck size={18} />} title={t('institute.releaseTitle')} description={t('institute.releaseDescription')} />
        <QuickLink to="/institute/notifications" icon={<Bell size={18} />} title={t('institute.notifications')} description={t('nav.recentUpdates')} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1.5 break-all text-base font-bold text-navy-900">{value}</p></div>;
}

function QuickLink({ to, icon, title, description }: { to: string; icon: ReactNode; title: string; description: string }) {
  return <Link to={to} className="surface-card flex min-w-0 items-start gap-3 p-4 no-underline transition hover:-translate-y-0.5 hover:shadow-soft"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#efe8d7] text-navy-700">{icon}</span><span className="min-w-0"><strong className="block text-sm text-navy-900">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span><ArrowRight size={15} className="ml-auto mt-1 shrink-0 text-slate-400" /></Link>;
}

function InstrumentListItem({ instrument }: { instrument: Instrument }) {
  const { language } = useLanguage();
  return (
    <Link to={`/institute/instruments/${encodeURIComponent(instrument.id)}`} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 no-underline hover:bg-[#faf7f0]">
      <span className="min-w-0"><strong className="block truncate text-sm text-navy-900">{instrument.fdr_number ?? instrument.id}</strong><span className="mt-1 block text-xs text-slate-500">{amount(instrument.principal_paise)}{instrument.maturity_date ? ` · ${formatDate(instrument.maturity_date, language)}` : ''}</span></span>
      {instrument.state && <StatusPill value={instrument.state} />}
      <ArrowRight size={14} className="shrink-0 text-slate-400" />
    </Link>
  );
}

export function InstrumentListPage() {
  const { t } = useLanguage();
  const query = useInstruments();
  return <div className="mx-auto max-w-7xl space-y-6">
    <PageHeader eyebrow={t('institute.eyebrow')} title={t('institute.recentInstruments')} actions={<Link className="button button-primary button-md" to="/institute/submit"><Upload size={15} />{t('institute.submitFdr')}</Link>} />
    {query.isLoading ? <LoadingState /> : query.isError ? <LoadError error={query.error} onRetry={() => void query.refetch()} /> :
      query.data?.length ? <Card padding="none"><div className="divide-y divide-slate-100">{query.data.map((instrument) => <InstrumentListItem key={instrument.id} instrument={instrument} />)}</div></Card> :
        <Card><EmptyState title={t('institute.noInstruments')} icon={<FileText size={20} />} action={<Link className="button button-primary button-md" to="/institute/submit">{t('institute.submitFdr')}</Link>} /></Card>}
  </div>;
}

export function SubmitFdrPage() {
  const { t, label } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToasts();
  const obligationsQuery = useObligations();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<JsonObject | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [obligationId, setObligationId] = useState('');
  const [edited, setEdited] = useState<string[]>([]);
  const [declared, setDeclared] = useState(false);
  const isSignatory = user?.roles.includes('INS_SIGNATORY') ?? false;

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t('institute.noPdf'));
      const data = new FormData();
      data.append('file', file);
      return apiRequest<JsonObject>('/documents/preview', { method: 'POST', body: data });
    },
    onSuccess: (result) => {
      setPreview(result);
      const extracted = asObject(result.extracted);
      const initial: Record<string, string> = {};
      for (const spec of fieldSpecs) {
        const field = asObject(extracted[spec.key]);
        const value = field.value ?? extracted[spec.key];
        if (value !== undefined && value !== null) initial[spec.key] = String(value);
      }
      setFieldValues(initial);
      setEdited([]);
      setStep(1);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!file || !preview) throw new Error(t('institute.previewRequired'));
      if (!obligationId) throw new Error(t('institute.requiredField'));
      if (fieldSpecs.some((spec) => spec.required && !fieldValues[spec.key]?.trim())) throw new Error(t('institute.requiredField'));
      if (!/^\d+$/.test(fieldValues.principal_paise ?? '') || Number(fieldValues.principal_paise) <= 0) throw new Error(t('institute.invalidAmount'));
      const data = new FormData();
      data.append('file', file);
      data.append('obligation_id', obligationId);
      for (const [key, value] of Object.entries(fieldValues)) data.append(key, value);
      return apiRequest<JsonObject>('/instruments', { method: 'POST', body: data });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['institute'] });
      pushToast({ title: t('institute.submitSuccess'), description: t('institute.submitSuccessDescription'), tone: 'success' });
      const id = recordId(result);
      navigate(id ? `/institute/instruments/${encodeURIComponent(id)}` : '/institute/instruments');
    },
  });

  const extracted = asObject(preview?.extracted);
  const checks = asList<DocCheck>(preview?.checks);
  const flags = Array.isArray(preview?.flags) ? preview.flags.map(String) : [];

  return <div className="mx-auto max-w-5xl space-y-6">
    <PageHeader eyebrow={t('institute.eyebrow')} title={t('institute.fdrWizard')} description={t('institute.uploadDescription')} backTo="/institute" />
    {!isSignatory && <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900"><div className="flex items-start gap-2"><CircleAlert size={17} className="mt-0.5 shrink-0" /><p>{t('institute.signatoryOnly')}</p></div></Card>}
    <WizardSteps step={step} />
    {step === 0 && <Card title={t('institute.uploadTitle')} description={t('institute.uploadDescription')}>
      {obligationsQuery.isLoading ? <Skeleton className="h-12 w-full" /> :
        obligationsQuery.isError ? <LoadError error={obligationsQuery.error} onRetry={() => void obligationsQuery.refetch()} /> :
          <label className="field-label mb-4 block">{t('institute.selectObligation')}
            <select className="input-control mt-1.5" value={obligationId} onChange={(event) => setObligationId(event.target.value)} required>
              <option value="">{t('institute.selectObligation')}</option>
              {(obligationsQuery.data ?? []).map((obligation) => <option key={obligation.id} value={obligation.id}>{obligation.programme ?? obligation.reference ?? obligation.id} · {label(obligation.state ?? 'PENDING_DEPOSIT')}</option>)}
            </select>
          </label>}
      {obligationsQuery.isSuccess && obligationsQuery.data.length === 0 && <p role="status" className="mb-4 text-sm text-slate-500">{t('institute.noInstituteObligations')}</p>}
      <FileDrop accept=".pdf,application/pdf" maxSizeMB={15} fileName={file?.name} disabled={!isSignatory || previewMutation.isPending} onFile={(nextFile) => { setFile(nextFile); setPreview(null); setFieldValues({}); }} />
      {previewMutation.isError && <InlineError error={previewMutation.error} />}
      <div className="mt-5 flex justify-end"><Button disabled={!isSignatory || !file || !obligationId} loading={previewMutation.isPending} onClick={() => previewMutation.mutate()}>{t('institute.preview')} <ArrowRight size={15} /></Button></div>
    </Card>}
    {step === 1 && <div className="space-y-5">
      <Card title={t('institute.reviewTitle')} description={t('institute.reviewDescription')}>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {fieldSpecs.map((spec) => {
            const extractedField = asObject(extracted[spec.key]);
            const extractedValue = extractedField.value ?? extracted[spec.key];
            const hasExtracted = extractedValue !== undefined && extractedValue !== null;
            return <div key={spec.key} className={edited.includes(spec.key) ? 'rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200' : ''}>
              <FormField
                label={`${t(spec.translation as TranslationKey)}${spec.required ? ' *' : ''}`}
                name={`review-${spec.key}`}
                type={'type' in spec ? spec.type : 'text'}
                value={fieldValues[spec.key] ?? ''}
                placeholder={hasExtracted ? String(extractedValue) : t('institute.notExtracted')}
                onChange={(event) => {
                  const value = event.target.value;
                  setFieldValues((current) => ({ ...current, [spec.key]: value }));
                  setEdited((current) => current.includes(spec.key) ? current : [...current, spec.key]);
                }}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                <span>{t('institute.extracted')}: {hasExtracted ? String(extractedValue) : '—'}</span>
                {typeof extractedField.confidence === 'number' && <span>· {t('institute.confidence')}: {Math.round(extractedField.confidence * 100)}%</span>}
                {text(extractedField.source) && <span>· {t('institute.source')}: {text(extractedField.source)}</span>}
                {edited.includes(spec.key) && <Badge tone="warning">{t('institute.edited')}</Badge>}
              </div>
            </div>;
          })}
        </div>
      </Card>
      <DocumentChecks checks={checks} flags={flags} />
      <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(0)}><ArrowLeft size={15} />{t('institute.back')}</Button><Button onClick={() => setStep(2)}>{t('institute.continue')} <ArrowRight size={15} /></Button></div>
    </div>}
    {step === 2 && <Card title={t('institute.declarationTitle')}>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[#173b58]" checked={declared} onChange={(event) => setDeclared(event.target.checked)} />
        <span>{t('institute.declaration')}</span>
      </label>
      {submitMutation.isError && <InlineError error={submitMutation.error} />}
      <div className="mt-5 flex justify-between"><Button variant="secondary" onClick={() => setStep(1)}><ArrowLeft size={15} />{t('institute.back')}</Button><Button disabled={!isSignatory || !declared} loading={submitMutation.isPending} onClick={() => submitMutation.mutate()}>{t('institute.submit')} <Check size={15} /></Button></div>
    </Card>}
  </div>;
}

function WizardSteps({ step }: { step: number }) {
  const { t } = useLanguage();
  const labels = [t('institute.stepUpload'), t('institute.stepReview'), t('institute.stepDeclare')];
  return <ol className="grid grid-cols-3 gap-2" aria-label={t('institute.fdrWizard')}>
    {labels.map((label, index) => <li key={label} className={`flex min-w-0 items-center gap-2 rounded-xl border p-3 ${step === index ? 'border-[#cda640] bg-[#fbf5e7]' : index < step ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${index < step ? 'bg-emerald-700 text-white' : step === index ? 'bg-[#d8a83f] text-navy-900' : 'bg-slate-100 text-slate-500'}`}>{index < step ? <Check size={14} /> : index + 1}</span>
      <span className="truncate text-xs font-semibold text-slate-700">{label}</span>
    </li>)}
  </ol>;
}

function InlineError({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : null;
  return <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
    <p className="font-semibold">{apiError?.code ?? 'REQUEST_ERROR'}: {error instanceof Error ? error.message : 'Request failed'}</p>
  </div>;
}

function DocumentChecks({ checks, flags }: { checks: DocCheck[]; flags: string[] }) {
  const { t } = useLanguage();
  return <Card title={t('institute.documentChecks')}>
    {checks.length === 0 && flags.length === 0 ? <p className="text-sm text-slate-500">{t('institute.noFlags')}</p> :
      <div className="space-y-2">
        {checks.map((check, index) => {
          const outcome = text(check.outcome).toUpperCase();
          const tone = outcome === 'PASS' ? 'success' : outcome === 'FLAG' ? 'warning' : outcome === 'ERROR' ? 'danger' : 'neutral';
          return <div key={`${check.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{flagDescription(text(check.name), t)}</p>{check.details !== undefined && check.details !== null && <p className="mt-1 text-xs text-slate-500">{friendlyDetails(check.details)}</p>}</div>
            <Badge tone={tone}>{outcomeLabel(outcome, t)}</Badge>
          </div>;
        })}
        {flags.map((flag) => <div key={flag} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><CircleAlert size={16} className="mt-0.5 shrink-0" />{flagDescription(flag, t)}</div>)}
      </div>}
  </Card>;
}

function flagDescription(value: string, t: (key: TranslationKey) => string): string {
  const codeMatch = value.match(/D-\d{2}/);
  if (codeMatch) return translateFlag(codeMatch[0], t);
  if (value.startsWith('D-')) return t('institute.flagGeneric');
  return value.replaceAll('_', ' ') || t('institute.flagGeneric');
}

function friendlyDetails(details: unknown): string {
  if (typeof details === 'string') return details;
  if (typeof details === 'object' && details !== null) {
    return Object.entries(details as JsonObject).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${text(value)}`).join(' · ');
  }
  return '';
}

function outcomeLabel(outcome: string, t: (key: TranslationKey) => string): string {
  const mapping: Record<string, string> = { PASS: 'institute.pass', FLAG: 'institute.flagged', ERROR: 'institute.error', NA: 'institute.notApplicable' };
  return mapping[outcome] ? t(mapping[outcome] as TranslationKey) : outcome.replaceAll('_', ' ');
}

export function InstrumentDetailPage() {
  const { id = '' } = useParams();
  const { t, language, label } = useLanguage();
  const { pushToast } = useToasts();
  const detailQuery = useQuery({
    queryKey: ['institute', 'instrument', id],
    queryFn: () => api.get<JsonObject>(`/instruments/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  const timelineQuery = useQuery({
    queryKey: ['institute', 'instrument', id, 'timeline'],
    queryFn: async () => asList<JsonObject>(await api.get<unknown>(`/instruments/${encodeURIComponent(id)}/timeline`)),
    enabled: Boolean(id),
  });
  const instrument = detailQuery.data as Instrument | undefined;
  const fields = normalizeInstrumentFields(detailQuery.data?.fields);
  const checks = asList<DocCheck>(detailQuery.data?.doc_checks);
  const discrepancies = asList<JsonObject>(detailQuery.data?.discrepancies);
  const bankRequests = asList<JsonObject>(detailQuery.data?.bank_requests);

  const openDocument = async () => {
    try {
      const token = getAccessToken();
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api'}/instruments/${encodeURIComponent(id)}/document`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        let message = response.statusText;
        let code = `HTTP_${response.status}`;
        try {
          const body = asObject(await response.json());
          const error = asObject(body.error);
          message = text(error.message) || message;
          code = text(error.code) || code;
        } catch {
          // Keep the HTTP status if an error body is not JSON.
        }
        throw new ApiError(message, code, response.status);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      pushToast({ title: error instanceof ApiError ? error.message : t('institute.documentUnavailable'), description: error instanceof ApiError ? `Code: ${error.code}` : undefined, tone: 'error', code: error instanceof ApiError ? error.code : undefined });
    }
  };

  if (detailQuery.isLoading) return <div className="mx-auto max-w-7xl"><LoadingState /></div>;
  if (detailQuery.isError) return <div className="mx-auto max-w-7xl space-y-5"><PageHeader title={t('institute.detail')} backTo="/institute/instruments" /><LoadError error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /></div>;
  if (!instrument) return <div className="mx-auto max-w-7xl space-y-5"><PageHeader title={t('institute.detail')} backTo="/institute/instruments" /><Card><EmptyState title={t('institute.notFound')} /></Card></div>;

  const timeline = (timelineQuery.data ?? []).map((event) => ({
    title: text(event.title) || [event.action, event.to_state, event.state].map(text).filter(Boolean).map(label).join(' → '),
    description: text(event.reason ?? event.description),
    date: formatDate(text(event.ts ?? event.created_at ?? event.changed_at), language),
    tone: event.to_state === 'ACTIVE' || event.state === 'ACTIVE' ? 'success' as const : 'neutral' as const,
  })).filter((event) => event.title);
  const renewalAllowed = instrument.state === 'RENEWAL_DUE' || instrument.state === 'LAPSED';

  return <div className="mx-auto max-w-7xl space-y-6">
    <PageHeader eyebrow={t('institute.eyebrow')} title={instrument.fdr_number ?? t('institute.detail')} description={`${t('institute.state')}: ${label(instrument.state ?? 'SUBMITTED')}`} backTo="/institute/instruments" actions={<div className="flex flex-wrap gap-2">{renewalAllowed && <Link className="button button-secondary button-md" to={`/institute/renew/${encodeURIComponent(id)}`}>{t('institute.renew')}</Link>}<Button variant="outline" onClick={() => void openDocument()}><FileText size={15} />{t('institute.openDocument')}</Button></div>} />
    {(instrument.is_quarantined || instrument.on_hold) && <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900"><CircleAlert size={16} className="mr-2 inline" />{instrument.is_quarantined ? t('institute.flagGeneric') : t('institute.bankContactNotice')}</Card>}
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <Card title={t('institute.fields')}>
        <dl className="divide-y divide-slate-100">
          {fieldSpecs.map((spec) => {
            const rawField = fields[spec.key];
            const field = asObject(rawField);
            const value = field.value ?? rawField ?? instrument[spec.key as keyof Instrument];
            const trust = text(field.trust) as TrustLevel;
            return <div key={spec.key} className="grid grid-cols-[minmax(100px,.8fr)_minmax(0,1fr)] gap-3 py-3 first:pt-0">
              <dt className="text-xs font-medium text-slate-500">{t(spec.translation as TranslationKey)}</dt>
              <dd className="min-w-0 break-words text-sm font-semibold text-slate-800">
                {spec.key === 'principal_paise' ? amount(asNumber(value)) : spec.key.endsWith('_date') ? formatDate(text(value), language) : text(value) || '—'}
                {trust && <div className="mt-1.5"><TrustBadge trust={trust} source={text(field.source) || undefined} evidenceRef={text(field.evidence_ref) || undefined} setAt={formatDate(text(field.set_at), language)} /></div>}
              </dd>
            </div>;
          })}
        </dl>
      </Card>
      <div className="space-y-5">
        <Card title={t('institute.bankStatus')} description={t('institute.bankContactNotice')}>
          {bankRequests.length === 0 ? <EmptyState title={t('institute.noFlags')} icon={<Landmark size={20} />} /> :
            <div className="space-y-3">{bankRequests.map((request, index) => <div key={text(request.id) || index} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-semibold text-slate-800">{text(request.reason) || t('institute.bankStatus')}</p><p className="mt-1 text-xs text-slate-500">{formatDate(text(request.created_at), language)}</p></div><StatusPill value={text(request.state) || 'CREATED'} /></div>)}</div>}
        </Card>
        <Card title={t('institute.flags')}>
          {discrepancies.length === 0 && checks.length === 0 ? <EmptyState title={t('institute.noFlagsOnRecord')} icon={<Check size={20} />} /> :
            <div className="space-y-2">{discrepancies.map((discrepancy, index) => {
              const code = text(discrepancy.code);
              return <div key={text(discrepancy.id) || `${code}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-amber-900">{code || 'REVIEW'}</span>{text(discrepancy.severity) && <Badge tone={text(discrepancy.severity) === 'HIGH' ? 'danger' : 'warning'}>{label(text(discrepancy.severity))}</Badge>}</div><p className="mt-1 text-sm text-amber-950">{translateFlag(code, t)}</p></div>;
            })}<DocumentChecks checks={checks} flags={[]} /></div>}
        </Card>
      </div>
    </div>
    <Card title={t('institute.timeline')}>
      {timelineQuery.isLoading ? <Skeleton className="h-28" /> : timelineQuery.isError ? <LoadError error={timelineQuery.error} onRetry={() => void timelineQuery.refetch()} /> : <Timeline events={timeline} />}
    </Card>
  </div>;
}

export function RenewalPage() {
  const { id = '' } = useParams();
  const { t } = useLanguage();
  const { pushToast } = useToasts();
  const navigate = useNavigate();
  const client = useQueryClient();
  const instrumentQuery = useQuery({ queryKey: ['institute', 'instrument', id], queryFn: () => api.get<Instrument>(`/instruments/${encodeURIComponent(id)}`), enabled: Boolean(id) });
  const [mode, setMode] = useState<'SAME_NUMBER' | 'NEW_NUMBER'>('NEW_NUMBER');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<JsonObject | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t('institute.noPdf'));
      const data = new FormData();
      data.append('file', file);
      return apiRequest<JsonObject>('/documents/preview', { method: 'POST', body: data });
    },
    onSuccess: (result) => {
      setPreview(result);
      const extracted = asObject(result.extracted);
      const initial: Record<string, string> = {};
      for (const spec of fieldSpecs) {
        const field = asObject(extracted[spec.key]);
        const value = field.value ?? extracted[spec.key];
        if (value !== undefined && value !== null) initial[spec.key] = String(value);
      }
      setFieldValues(initial);
      setError('');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : t('institute.apiError')),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t('institute.noPdf'));
      if (!preview) throw new Error(t('institute.previewRequired'));
      if (fieldSpecs.some((spec) => spec.required && !fieldValues[spec.key]?.trim())) throw new Error(t('institute.requiredField'));
      if (!/^\d+$/.test(fieldValues.principal_paise ?? '') || Number(fieldValues.principal_paise) <= 0) throw new Error(t('institute.invalidAmount'));
      const renewalFdrNumber = fieldValues.fdr_number?.trim();
      if (mode === 'NEW_NUMBER' && !renewalFdrNumber) throw new Error(t('institute.requiredField'));
      const data = new FormData();
      data.append('mode', mode);
      data.append('file', file);
      for (const [key, value] of Object.entries(fieldValues)) data.append(key, value);
      if (mode === 'NEW_NUMBER' && renewalFdrNumber) data.append('new_fdr_number', renewalFdrNumber);
      return apiRequest<JsonObject>(`/instruments/${encodeURIComponent(id)}/renew`, { method: 'POST', body: data });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['institute'] });
      pushToast({ title: t('institute.renewSuccess'), description: t('institute.renewDescription'), tone: 'success' });
      navigate(`/institute/instruments/${encodeURIComponent(id)}`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : t('institute.apiError')),
  });

  if (instrumentQuery.isLoading) return <div className="mx-auto max-w-4xl"><LoadingState /></div>;
  if (instrumentQuery.isError) return <div className="mx-auto max-w-4xl space-y-5"><PageHeader title={t('institute.renewalTitle')} backTo={`/institute/instruments/${encodeURIComponent(id)}`} /><LoadError error={instrumentQuery.error} onRetry={() => void instrumentQuery.refetch()} /></div>;
  const instrument = instrumentQuery.data;
  if (!instrument) return <div className="mx-auto max-w-4xl space-y-5"><PageHeader title={t('institute.renewalTitle')} backTo="/institute/instruments" /><Card><EmptyState title={t('institute.notFound')} /></Card></div>;
  const renewalAllowed = instrument.state === 'RENEWAL_DUE' || instrument.state === 'LAPSED';

  return <div className="mx-auto max-w-3xl space-y-6">
    <PageHeader eyebrow={instrument.fdr_number} title={t('institute.renewalTitle')} description={t('institute.renewDescription')} backTo={`/institute/instruments/${encodeURIComponent(id)}`} />
    {!renewalAllowed ? <Card><EmptyState title={t('institute.renewalOnly')} /></Card> :
      <Card title={t('institute.renewalMode')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-xl border p-4 ${mode === 'SAME_NUMBER' ? 'border-[#cda640] bg-[#fbf5e7]' : 'border-slate-200'}`}><span className="flex items-start gap-2"><input type="radio" name="renewal-mode" checked={mode === 'SAME_NUMBER'} onChange={() => setMode('SAME_NUMBER')} /><span className="text-sm font-semibold">{t('institute.sameNumber')}</span></span></label>
          <label className={`cursor-pointer rounded-xl border p-4 ${mode === 'NEW_NUMBER' ? 'border-[#cda640] bg-[#fbf5e7]' : 'border-slate-200'}`}><span className="flex items-start gap-2"><input type="radio" name="renewal-mode" checked={mode === 'NEW_NUMBER'} onChange={() => setMode('NEW_NUMBER')} /><span className="text-sm font-semibold">{t('institute.newNumber')}</span></span></label>
        </div>
        <div className="mt-4"><FileDrop fileName={file?.name} maxSizeMB={15} onFile={(nextFile) => { setFile(nextFile); setPreview(null); setFieldValues({}); setError(''); }} /></div>
        <div className="mt-3 flex justify-end"><Button variant="secondary" disabled={!file} loading={previewMutation.isPending} onClick={() => previewMutation.mutate()}>{t('institute.preview')}</Button></div>
        {preview && <div className="mt-4 grid gap-x-5 gap-y-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          {fieldSpecs.map((spec) => <FormField key={spec.key} label={`${t(spec.translation as TranslationKey)}${spec.required ? ' *' : ''}`} name={`renew-${spec.key}`} type={'type' in spec ? spec.type : 'text'} value={fieldValues[spec.key] ?? ''} onChange={(event) => setFieldValues((current) => ({ ...current, [spec.key]: event.target.value }))} />)}
        </div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end"><Button loading={mutation.isPending} disabled={!file || !preview} onClick={() => mutation.mutate()}>{t('institute.renewSubmit')} <ArrowRight size={15} /></Button></div>
      </Card>}
  </div>;
}

function ReleaseRequestRow({
  request,
  onDownload,
}: {
  request: JsonObject;
  onDownload: (letterId: string) => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const requestId = recordId(request);
  const detailQuery = useQuery({
    queryKey: ['institute', 'release-request', requestId],
    queryFn: () => api.get<JsonObject>(`/release/requests/${encodeURIComponent(requestId)}`),
    enabled: expanded && Boolean(requestId),
  });
  const resubmit = useMutation({
    mutationFn: () => api.post(`/release/requests/${encodeURIComponent(requestId)}/resubmit`),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['institute', 'release-requests'] });
      await client.invalidateQueries({ queryKey: ['institute', 'release-request', requestId] });
    },
  });
  const detail = detailQuery.data ?? {};
  const eligibility = asObject(detail.eligibility);
  const rules = asList<EligibilityRule>(eligibility.rules ?? detail.eligibility_results);
  const letterId = text(detail.letter_id ?? request.letter_id);
  const state = text(detail.state ?? request.state);
  const verdict = text(eligibility.verdict ?? detail.verdict);

  return <div className="rounded-xl border border-slate-100 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="font-semibold text-slate-800">{requestId}</p><p className="mt-1 text-xs text-slate-500">{formatDate(text(detail.created_at ?? request.created_at), language)}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {state && <StatusPill value={state} />}
        <Button size="sm" variant="secondary" onClick={() => setExpanded((open) => !open)}>{expanded ? t('institute.hideRequest') : t('institute.openRequests')}</Button>
        {letterId && <Button size="sm" variant="outline" onClick={() => void onDownload(letterId)}><Download size={13} />{t('institute.downloadLetter')}</Button>}
        {state === 'INELIGIBLE' && <Button size="sm" loading={resubmit.isPending} onClick={() => resubmit.mutate()}>{t('institute.resubmit')}</Button>}
      </div>
    </div>
    {resubmit.isError && <div className="mt-3"><InlineError error={resubmit.error} /></div>}
    {expanded && <div className="mt-4 border-t border-slate-100 pt-4">
      {detailQuery.isLoading ? <Skeleton className="h-16" /> : detailQuery.isError ? <LoadError error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /> :
        <div className="space-y-3">
          {verdict && <p className="text-sm font-semibold text-slate-700">{t('institute.verdict')}: <StatusPill value={verdict} /></p>}
          {rules.length === 0 ? <p className="text-sm text-slate-500">{t('institute.noEligibility')}</p> :
            <div className="space-y-2">{rules.map((rule, index) => <div key={rule.rule_id ?? index} className="rounded-lg bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{t('institute.releaseRule', { rule: rule.rule_id ?? '—' })}</p><StatusPill value={rule.result ?? 'MANUAL'} /></div>
              {rule.message && <p className="mt-1 text-sm text-slate-600">{rule.message}</p>}
              {rule.fix_hint && <p className="mt-1 text-xs text-slate-500">{t('institute.fixHint')}: {rule.fix_hint}</p>}
            </div>)}</div>}
        </div>}
    </div>}
  </div>;
}

export function ReleaseRequestPage() {
  const { t, label } = useLanguage();
  const { pushToast } = useToasts();
  const client = useQueryClient();
  const obligationsQuery = useObligations();
  const instrumentsQuery = useInstruments();
  const requestsQuery = useQuery({ queryKey: ['institute', 'release-requests'], queryFn: async () => asList<JsonObject>(await api.get<unknown>('/release/requests')) });
  const [obligationId, setObligationId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [result, setResult] = useState<JsonObject | null>(null);
  const instruments = instrumentsQuery.data ?? [];
  const eligibleToSelect = instruments.filter((instrument) => instrument.state === 'ACTIVE' || instrument.state === 'MATURED');
  const selectedObligation = obligationsQuery.data?.find((item) => item.id === obligationId);
  const downloadLetter = async (letterId: string) => {
    try {
      const token = getAccessToken();
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api'}/release/letters/${encodeURIComponent(letterId)}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        let message = response.statusText;
        let code = `HTTP_${response.status}`;
        try {
          const errorBody = asObject(await response.json());
          const error = asObject(errorBody.error);
          message = text(error.message) || message;
          code = text(error.code) || code;
        } catch {
          // Retain the HTTP status when the server does not return a JSON error.
        }
        throw new ApiError(message, code, response.status);
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${letterId}.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      pushToast({
        title: error instanceof ApiError ? error.message : t('institute.documentUnavailable'),
        description: error instanceof ApiError ? `Code: ${error.code}` : undefined,
        tone: 'error',
        code: error instanceof ApiError ? error.code : undefined,
      });
    }
  };
  const mutation = useMutation({
    mutationFn: () => {
      if (!obligationId) throw new Error(t('institute.requiredField'));
      if (selectedIds.length === 0) throw new Error(t('institute.requiredField'));
      return api.post<JsonObject>('/release/requests', { obligation_id: obligationId, instrument_ids: selectedIds, case_type: 'TERM_COMPLETE' });
    },
    onSuccess: async (response) => {
      setResult(response);
      await client.invalidateQueries({ queryKey: ['institute', 'release-requests'] });
      pushToast({ title: t('institute.releaseSuccess'), tone: 'success' });
    },
  });
  const requestRows = requestsQuery.data ?? [];
  const eligibility = asObject(result?.eligibility);
  const rules = asList<EligibilityRule>(eligibility.rules ?? result?.eligibility_results);
  const verdict = text(eligibility.verdict ?? result?.verdict);

  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow={t('institute.eyebrow')} title={t('institute.releaseTitle')} description={t('institute.releaseDescription')} backTo="/institute" />
    <Card title={t('institute.releaseTitle')}>
      {obligationsQuery.isError ? <LoadError error={obligationsQuery.error} onRetry={() => void obligationsQuery.refetch()} /> :
        instrumentsQuery.isError ? <LoadError error={instrumentsQuery.error} onRetry={() => void instrumentsQuery.refetch()} /> :
          obligationsQuery.isLoading || instrumentsQuery.isLoading ? <LoadingState /> :
            <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); mutation.mutate(); }} className="space-y-5">
              <label className="field-label block">{t('institute.selectObligation')}
                <select className="input-control mt-1.5" value={obligationId} onChange={(event) => setObligationId(event.target.value)} required>
                  <option value="">{t('institute.noObligations')}</option>
                  {(obligationsQuery.data ?? []).map((obligation) => <option key={obligation.id} value={obligation.id}>{obligation.programme ?? obligation.reference ?? obligation.id} · {label(obligation.state ?? 'PENDING_DEPOSIT')}</option>)}
                </select>
              </label>
              {selectedObligation && <div className="grid gap-3 sm:grid-cols-3"><Metric label={t('institute.coverageRequired')} value={amount(selectedObligation.required_paise)} /><Metric label={t('institute.confirmedAmount')} value={amount(selectedObligation.covered_paise ?? selectedObligation.confirmed_paise)} /><Metric label={t('institute.provisionalAmount')} value={amount(selectedObligation.provisional_paise)} /></div>}
              <fieldset><legend className="field-label mb-2">{t('institute.selectInstruments')}</legend>
                {eligibleToSelect.length === 0 ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{t('institute.noInstruments')}</p> :
                  <div className="space-y-2">{eligibleToSelect.map((instrument) => <label key={instrument.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(instrument.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, instrument.id] : current.filter((id) => id !== instrument.id))} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{instrument.fdr_number ?? instrument.id}</strong><span className="mt-1 block text-xs text-slate-500">{amount(instrument.principal_paise)}</span></span><StatusPill value={instrument.state ?? 'ACTIVE'} /></label>)}</div>}
              </fieldset>
              {mutation.isError && <InlineError error={mutation.error} />}
              <div className="flex justify-end"><Button type="submit" loading={mutation.isPending} disabled={eligibleToSelect.length === 0}>{t('institute.releaseSubmit')} <ArrowRight size={15} /></Button></div>
            </form>}
    </Card>
    {result && <Card title={t('institute.eligibility')} action={verdict && <StatusPill value={verdict} />}>
      {rules.length === 0 ? <p className="text-sm text-slate-500">{t('institute.noEligibility')}</p> :
        <DataTable<EligibilityRule>
          rows={rules}
          rowKey={(rule) => rule.rule_id ?? `${rule.message}`}
          columns={[
            { key: 'rule', header: t('institute.rule'), render: (rule) => t('institute.releaseRule', { rule: rule.rule_id ?? '—' }) },
            { key: 'result', header: t('institute.result'), render: (rule) => <StatusPill value={rule.result ?? 'MANUAL'} /> },
            { key: 'message', header: t('institute.reason'), render: (rule) => rule.message ?? '—' },
            { key: 'fix', header: t('institute.fixHint'), render: (rule) => rule.fix_hint ?? '—' },
          ]}
        />}
    </Card>}
    <Card title={t('institute.releaseRequests')}>
      {requestsQuery.isLoading ? <Skeleton className="h-20" /> : requestsQuery.isError ? <LoadError error={requestsQuery.error} onRetry={() => void requestsQuery.refetch()} /> : requestRows.length === 0 ? <EmptyState title={t('institute.noEligibility')} /> :
        <div className="space-y-2">{requestRows.map((request, index) => <ReleaseRequestRow key={recordId(request) || index} request={asObject(request)} onDownload={downloadLetter} />)}</div>}
    </Card>
  </div>;
}

export function NotificationsPage() {
  const { t, language } = useLanguage();
  const client = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ['institute', 'notifications'],
    queryFn: async () => asList<NotificationItem>(await api.get<unknown>('/notifications')),
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) => api.post(`/notifications/${encodeURIComponent(notificationId)}/read`),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['institute', 'notifications'] });
      await client.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const items = notificationsQuery.data ?? [];
  return <div className="mx-auto max-w-5xl space-y-6">
    <PageHeader eyebrow={t('institute.eyebrow')} title={t('institute.notifications')} backTo="/institute" />
    {notificationsQuery.isLoading ? <LoadingState /> : notificationsQuery.isError ? <LoadError error={notificationsQuery.error} onRetry={() => void notificationsQuery.refetch()} /> : items.length === 0 ? <Card><EmptyState title={t('institute.noNotifications')} icon={<Bell size={20} />} /></Card> :
      <Card padding="none"><div className="divide-y divide-slate-100">{items.map((item) => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.read ? 'bg-slate-300' : 'bg-[#d8a83f]'}`} /><div><p className="text-sm font-semibold text-slate-800">{item.title}</p>{item.body && <p className="mt-1 text-sm leading-5 text-slate-500">{item.body}</p>}<p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at, language)} · {item.read ? t('institute.read') : t('institute.unread')}</p></div></div>
        {!item.read && <Button size="sm" variant="secondary" loading={markRead.isPending && markRead.variables === item.id} onClick={() => markRead.mutate(item.id)}>{t('institute.markRead')}</Button>}
      </div>)}</div>{markRead.isError && <div className="p-4"><InlineError error={markRead.error} /></div>}</Card>}
  </div>;
}
