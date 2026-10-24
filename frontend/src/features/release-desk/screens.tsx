import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ExternalLink, FileCheck2, FileText, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { api, ApiError, getAccessToken } from '../../api/client';
import { formatDate, formatINR } from '../../api/format';
import { useLanguage, type TranslationKey } from '../../shell/language';
import { Badge, Button, Card, EmptyState, FormField, Modal, Skeleton, StepUpModal, useToasts } from '../../ui';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {};
}

function asList(value: unknown, keys: string[]): JsonObject[] {
  if (Array.isArray(value)) return value.map(asObject);
  const object = asObject(value);
  for (const key of keys) {
    if (Array.isArray(object[key])) return (object[key] as unknown[]).map(asObject);
  }
  if (object.data && object.data !== value) return asList(object.data, keys);
  return [];
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function recordId(record: JsonObject): string {
  return text(record.id ?? record.release_id ?? record.release_request_id ?? record.request_id ?? record.letter_id);
}

function stateOf(record: JsonObject): string {
  return text(record.state ?? record.status ?? record.request_state ?? record.settlement_state).toUpperCase();
}

function paiseValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  }
  return undefined;
}

function amount(value: number | undefined): string {
  return value === undefined ? '—' : formatINR(value);
}

function recordLetterId(record: JsonObject): string {
  return text(record.letter_id ?? record.release_letter_id ?? asObject(record.letter).id ?? asObject(record.letter).letter_id);
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'The request could not be completed.';
}

function WorkspaceHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="page-heading">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}

function LoadFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <Card className="border-red-200 bg-red-50">
      <div className="flex items-start gap-3 text-red-800">
        <AlertTriangle size={19} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('releaseDesk.loadError')}</h2>
          <p className="mt-1 break-words text-sm">{errorMessage(error)}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={onRetry}><RefreshCw size={14} />{t('releaseDesk.retry')}</Button>
        </div>
      </div>
    </Card>
  );
}

function breakdownRows(record: JsonObject): { label: TranslationKey; amount: number | undefined }[] {
  const payload = asObject(record.payload ?? asObject(record.letter).payload);
  const settlement = asObject(record.settlement);
  const sources = [record, payload, settlement];
  const findAmount = (...keys: string[]) => paiseValue(...sources.flatMap((source) => keys.map((key) => source[key])));
  const rows: { label: TranslationKey; amount: number | undefined }[] = [
    { label: 'releaseDesk.principalToInstitute', amount: findAmount('principal_to_trust_paise', 'principal_paise', 'principal_to_trust') },
    { label: 'releaseDesk.aicteShare', amount: findAmount('aicte_share_paise', 'aicte_amount_paise', 'expected_credit_paise', 'aicte_share') },
    { label: 'releaseDesk.accruedInterest', amount: findAmount('accrued_interest_paise', 'interest_paise') },
    { label: 'releaseDesk.penalty', amount: findAmount('penalty_paise') },
    { label: 'releaseDesk.total', amount: findAmount('total_paise', 'total_amount_paise') },
  ];
  return rows.filter((row) => row.amount !== undefined);
}

function metaRows(record: JsonObject): { label: TranslationKey; value: string }[] {
  const payload = asObject(record.payload ?? asObject(record.letter).payload);
  const sources = [record, payload, asObject(record.request)];
  const fields: [TranslationKey, string[]][] = [
    ['releaseDesk.institute', ['institute_name', 'institute']],
    ['releaseDesk.fdrNumber', ['fdr_number']],
    ['releaseDesk.ifsc', ['bank_ifsc', 'ifsc']],
    ['releaseDesk.obligation', ['obligation_reference', 'obligation_id']],
    ['releaseDesk.reason', ['reason', 'release_reason']],
  ];
  return fields.flatMap(([label, keys]): { label: TranslationKey; value: string }[] => {
    const value = text(sources.flatMap((source) => keys.map((key) => source[key])).find((candidate) => candidate !== undefined && candidate !== null && candidate !== ''));
    return value ? [{ label, value }] : [];
  });
}

function openLetterPdf(letterId: string, target: Window | null): Promise<void> {
  return (async () => {
    const pdfTab = target ?? window.open('', '_blank');
    if (!pdfTab) throw new Error('Your browser blocked the PDF tab. Allow pop-ups, then select Open PDF.');
    const token = getAccessToken();
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api'}/release/letters/${encodeURIComponent(letterId)}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let message = response.statusText || `HTTP ${response.status}`;
      try {
        const body = asObject(await response.json());
        message = text(asObject(body.error).message) || message;
      } catch {
        // Keep the HTTP status when the server does not return a JSON error.
      }
      throw new Error(message);
    }
    const url = URL.createObjectURL(await response.blob());
    if (pdfTab.closed) throw new Error('The PDF tab was closed before the letter finished loading.');
    pdfTab.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  })();
}

const pendingSignatureStates = new Set(['PENDING_SIGNATURE', 'SIGNATURE_PENDING', 'READY_FOR_SIGNATURE', 'RECOMMENDED', 'APPROVED']);
const signedStates = new Set(['SIGNED', 'ISSUED', 'ACTIVE', 'VALID']);

export function ReleaseAuthorityWorkspace() {
  const { t, label } = useLanguage();
  const { pushToast } = useToasts();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [actionError, setActionError] = useState('');
  const pdfWindow = useRef<Window | null>(null);
  const requestsQuery = useQuery({
    queryKey: ['release-desk', 'requests'],
    queryFn: async () => asList(await api.get<unknown>('/release/requests'), ['items', 'requests', 'results']),
  });
  const requests = requestsQuery.data ?? [];
  const pending = requests.filter((request) => pendingSignatureStates.has(stateOf(request)));
  const issued = requests.filter((request) => signedStates.has(stateOf(request)) && Boolean(recordLetterId(request)));
  const selected = requests.find((request) => recordId(request) === selectedId);
  const selectedLetterId = selected ? recordLetterId(selected) : '';
  const detailQuery = useQuery({
    queryKey: ['release-desk', 'detail', selectedId, selectedLetterId],
    queryFn: () => api.get<unknown>(selectedLetterId
      ? `/release/letters/${encodeURIComponent(selectedLetterId)}`
      : `/release/requests/${encodeURIComponent(selectedId)}`),
    enabled: Boolean(selectedId),
  });
  const detail = { ...(selected ?? {}), ...asObject(detailQuery.data) };

  const signingMutation = useMutation({
    mutationFn: async (pin: string) => {
      await api.post<unknown>('/auth/step-up', { pin });
      return api.post<unknown>(`/release/requests/${encodeURIComponent(selectedId)}/sign`);
    },
    onSuccess: async (response) => {
      setStepUpOpen(false);
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['release-desk', 'requests'] });
      await queryClient.invalidateQueries({ queryKey: ['release-desk', 'detail', selectedId] });
      const result = asObject(response);
      const letter = asObject(result.letter);
      let letterId = text(result.letter_id ?? result.release_letter_id ?? letter.id ?? letter.letter_id ?? result.id);
      if (!letterId) {
        try {
          const signedRequest = asObject(await api.get<unknown>(`/release/requests/${encodeURIComponent(selectedId)}`));
          letterId = recordLetterId(signedRequest) || text(asObject(signedRequest.letter).id);
        } catch {
          letterId = '';
        }
      }
      if (letterId) {
        try {
          await openLetterPdf(letterId, pdfWindow.current);
          pdfWindow.current = null;
        } catch (error) {
          pdfWindow.current?.close();
          pdfWindow.current = null;
          setActionError(errorMessage(error));
          pushToast({ title: t('releaseDesk.signSuccess'), description: t('releaseDesk.pdfUnavailable'), tone: 'warning' });
        }
      } else {
        pdfWindow.current?.close();
        pdfWindow.current = null;
        pushToast({ title: t('releaseDesk.signSuccess'), description: t('releaseDesk.pdfUnavailable'), tone: 'warning' });
      }
    },
    onError: (error) => setActionError(errorMessage(error)),
  });
  const revokeMutation = useMutation({
    mutationFn: () => api.post<unknown>(`/release/letters/${encodeURIComponent(selectedLetterId)}/revoke`, { reason: revokeReason.trim() }),
    onSuccess: async () => {
      setRevokeOpen(false);
      setRevokeReason('');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['release-desk', 'requests'] });
      await queryClient.invalidateQueries({ queryKey: ['release-desk', 'detail', selectedId] });
      pushToast({ title: t('releaseDesk.revokeSuccess'), tone: 'success' });
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const signSelected = () => {
    pdfWindow.current = window.open('', '_blank');
    if (pdfWindow.current) pdfWindow.current.document.title = t('releaseDesk.pdfPreparing');
    setActionError('');
    setStepUpOpen(true);
  };
  const closeStepUp = () => {
    setStepUpOpen(false);
    pdfWindow.current?.close();
    pdfWindow.current = null;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <WorkspaceHeading eyebrow={t('releaseDesk.raEyebrow')} title={t('releaseDesk.raTitle')} description={t('releaseDesk.raDescription')} />
      {requestsQuery.isLoading ? <Card><Skeleton className="h-10 w-full" /><Skeleton className="mt-3 h-10 w-full" /></Card>
        : requestsQuery.isError ? <LoadFailure error={requestsQuery.error} onRetry={() => void requestsQuery.refetch()} /> : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.85fr)]">
            <div className="space-y-5">
              <Card title={t('releaseDesk.pendingSignature')} description={t('releaseDesk.pendingDescription')}>
                {pending.length ? <div className="divide-y divide-slate-100">
                  {pending.map((request, index) => {
                    const id = recordId(request) || `pending-${index}`;
                    return <div key={id} className={`flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 ${selectedId === id ? 'rounded-lg bg-navy-50 px-3' : ''}`}>
                      <div className="min-w-0">
                        <p className="font-semibold text-navy-900">{text(request.reference ?? request.request_number ?? request.id) || t('releaseDesk.unnamedRequest')}</p>
                                        <p className="mt-1 text-xs text-slate-500">{text(request.institute_name ?? asObject(request.payload).institute_name) || t('releaseDesk.instituteNotListed')} · {amount(paiseValue(request.aicte_share_paise, asObject(request.payload).aicte_share_paise))}</p>
                      </div>
                      <div className="flex items-center gap-2"><Badge tone="warning">{label(stateOf(request)) || t('releaseDesk.pending')}</Badge><Button size="sm" variant="secondary" onClick={() => setSelectedId(id)}>{t('releaseDesk.preview')}</Button></div>
                    </div>;
                  })}
                </div> : <EmptyState icon={<FileCheck2 size={20} />} title={t('releaseDesk.noPendingSignature')} description={t('releaseDesk.noPendingSignatureDescription')} />}
              </Card>
              <Card title={t('releaseDesk.signedLetters')} description={t('releaseDesk.signedDescription')}>
                {issued.length ? <div className="divide-y divide-slate-100">
                  {issued.map((request, index) => {
                    const id = recordId(request) || `issued-${index}`;
                    return <div key={id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0"><p className="font-semibold text-navy-900">{text(request.letter_number ?? request.reference ?? request.id) || t('releaseDesk.unnamedLetter')}</p><p className="mt-1 text-xs text-slate-500">{text(request.institute_name) || t('releaseDesk.instituteNotListed')}</p></div>
                      <div className="flex items-center gap-2"><Badge tone="success">{label(stateOf(request))}</Badge><Button size="sm" variant="secondary" onClick={() => setSelectedId(id)}>{t('releaseDesk.preview')}</Button></div>
                    </div>;
                  })}
                </div> : <EmptyState icon={<FileText size={20} />} title={t('releaseDesk.noSignedLetters')} />}
              </Card>
            </div>

            <Card title={t('releaseDesk.letterPreview')} description={t('releaseDesk.previewDescription')}>
              {!selected ? <EmptyState icon={<FileText size={20} />} title={t('releaseDesk.selectRequest')} description={t('releaseDesk.selectRequestDescription')} />
                : detailQuery.isLoading ? <Skeleton className="h-36 w-full" />
                  : detailQuery.isError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage(detailQuery.error)}<Button className="mt-3" size="sm" variant="secondary" onClick={() => void detailQuery.refetch()}>{t('releaseDesk.retry')}</Button></div>
                    : <div className="space-y-5">
                      {metaRows(detail).length > 0 && <dl className="grid gap-3 sm:grid-cols-2">{metaRows(detail).map((row) => <div key={row.label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{t(row.label)}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{row.value}</dd></div>)}</dl>}
                      {Object.entries(asObject(detail.payload ?? asObject(detail.letter).payload)).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-navy-900">{t('releaseDesk.payloadFields')}</h3><dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">{Object.entries(asObject(detail.payload ?? asObject(detail.letter).payload)).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-3 py-2.5 text-sm"><dt className="text-slate-500">{key.replace(/_paise$/, '').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())}</dt><dd className="max-w-full break-all text-right font-medium text-navy-900">{key.endsWith('_paise') && paiseValue(value) !== undefined ? amount(paiseValue(value)) : text(value)}</dd></div>)}</dl></div>}
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-navy-900">{t('releaseDesk.financialBreakdown')}</h3>
                        {breakdownRows(detail).length ? <table className="w-full text-sm"><tbody>{breakdownRows(detail).map((row) => <tr key={row.label} className="border-b border-slate-100 last:border-0"><th className="py-2 text-left font-medium text-slate-600">{t(row.label)}</th><td className="py-2 text-right font-semibold text-navy-900">{amount(row.amount)}</td></tr>)}</tbody></table> : <p className="text-sm text-slate-500">{t('releaseDesk.breakdownUnavailable')}</p>}
                      </div>
                      {text(detail.hash_fingerprint ?? detail.payload_hash ?? detail.letter_hash ?? detail.hash) && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{t('releaseDesk.fingerprint')}</p><code className="mt-2 block break-all text-xs text-navy-800">{text(detail.hash_fingerprint ?? detail.payload_hash ?? detail.letter_hash ?? detail.hash)}</code></div>}
                      {actionError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
                      <div className="flex flex-wrap gap-2">
                        {pendingSignatureStates.has(stateOf(selected)) && <Button onClick={signSelected} leftIcon={<ShieldCheck size={15} />}>{t('releaseDesk.signLetter')}</Button>}
                        {selectedLetterId && !['REVOKED', 'SUPERSEDED'].includes(stateOf(detail)) && <Button variant="danger" onClick={() => { setActionError(''); setRevokeOpen(true); }} leftIcon={<X size={15} />}>{t('releaseDesk.revokeLetter')}</Button>}
                        {selectedLetterId && <Button variant="secondary" onClick={() => void openLetterPdf(selectedLetterId, null).catch((error: unknown) => setActionError(errorMessage(error)))} leftIcon={<ExternalLink size={15} />}>{t('releaseDesk.openPdf')}</Button>}
                      </div>
                    </div>}
            </Card>
          </div>
        )}

      <StepUpModal open={stepUpOpen} onClose={closeStepUp} onSubmit={async (pin) => { await signingMutation.mutateAsync(pin); }} title={t('releaseDesk.stepUpTitle')} />
      <Modal open={revokeOpen} title={t('releaseDesk.revokeTitle')} description={t('releaseDesk.revokeDescription')} onClose={() => setRevokeOpen(false)} footer={<><Button variant="secondary" onClick={() => setRevokeOpen(false)}>{t('releaseDesk.cancel')}</Button><Button variant="danger" loading={revokeMutation.isPending} disabled={revokeReason.trim().length < 5} onClick={() => revokeMutation.mutate()}>{t('releaseDesk.confirmRevoke')}</Button></>}>
        <label className="field-label" htmlFor="revoke-reason">{t('releaseDesk.revokeReason')}</label>
        <textarea id="revoke-reason" className="input-control mt-1.5 min-h-28 resize-y py-3" value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} maxLength={500} />
        {actionError && <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p>}
      </Modal>
    </div>
  );
}

function parseRupeesToPaise(value: string): number | undefined {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
  const [rupees, fraction = ''] = value.trim().split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : undefined;
}

function expectedAicteShare(record: JsonObject): number | undefined {
  const payload = asObject(record.payload ?? asObject(record.letter).payload);
  const settlement = asObject(record.settlement);
  return paiseValue(
    record.aicte_share_paise, record.expected_credit_paise, record.amount_due_paise, record.aicte_amount_paise,
    payload.aicte_share_paise, payload.expected_credit_paise, settlement.aicte_share_paise,
  );
}

function SettlementSummary({ record }: { record: JsonObject }) {
  const { t } = useLanguage();
  const credited = paiseValue(record.credited_paise, asObject(record.confirmation).credited_paise);
  const expected = expectedAicteShare(record);
  const reference = text(record.bank_ref ?? record.bank_reference ?? asObject(record.confirmation).bank_ref);
  const closedAt = text(record.closed_at ?? record.confirmed_at ?? asObject(record.confirmation).confirmed_at);
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-center gap-2 text-emerald-800"><Check size={17} /><h3 className="font-semibold">{t('releaseDesk.closedCase')}</h3></div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate-500">{t('releaseDesk.expectedCredit')}</dt><dd className="mt-1 font-semibold">{amount(expected)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('releaseDesk.creditedAmount')}</dt><dd className="mt-1 font-semibold">{amount(credited)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('releaseDesk.bankReference')}</dt><dd className="mt-1 break-all font-medium">{reference || '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('releaseDesk.closedOn')}</dt><dd className="mt-1 font-medium">{closedAt ? formatDate(closedAt) : '—'}</dd></div>
      </dl>
    </div>
  );
}

export function FinanceWorkspace() {
  const { t, label } = useLanguage();
  const { pushToast } = useToasts();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [credited, setCredited] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [error, setError] = useState('');
  const settlementsQuery = useQuery({
    queryKey: ['finance', 'settlements'],
    queryFn: async () => asList(await api.get<unknown>('/finance/settlements'), ['items', 'settlements', 'results']),
  });
  const settlements = settlementsQuery.data ?? [];
  const activeSettlements = settlements.filter((record) => stateOf(record) !== 'CLOSED');
  const closedSettlements = settlements.filter((record) => stateOf(record) === 'CLOSED');
  const selected = settlements.find((record) => recordId(record) === selectedId);
  const expected = selected ? expectedAicteShare(selected) : undefined;
  const creditedPaise = useMemo(() => parseRupeesToPaise(credited), [credited]);
  const isMismatch = expected !== undefined && creditedPaise !== undefined && expected !== creditedPaise;
  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!selectedId || creditedPaise === undefined || !bankRef.trim()) throw new Error(t('releaseDesk.completeSettlementFields'));
      if (isMismatch && overrideNote.trim().length < 5) throw new Error(t('releaseDesk.overrideRequired'));
      return api.post<unknown>(`/finance/settlements/${encodeURIComponent(selectedId)}/confirm`, {
        credited_paise: creditedPaise,
        bank_ref: bankRef.trim(),
        ...(isMismatch ? { override_note: overrideNote.trim() } : {}),
      });
    },
    onSuccess: async () => {
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['finance', 'settlements'] });
      pushToast({ title: t('releaseDesk.settlementConfirmed'), tone: 'success' });
      setCredited('');
      setBankRef('');
      setOverrideNote('');
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    confirmMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <WorkspaceHeading eyebrow={t('releaseDesk.financeEyebrow')} title={t('releaseDesk.financeTitle')} description={t('releaseDesk.financeDescription')} />
      {settlementsQuery.isLoading ? <Card><Skeleton className="h-10 w-full" /><Skeleton className="mt-3 h-10 w-full" /></Card>
        : settlementsQuery.isError ? <LoadFailure error={settlementsQuery.error} onRetry={() => void settlementsQuery.refetch()} /> : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.85fr)]">
            <div className="space-y-5">
              <Card title={t('releaseDesk.pendingSettlements')} description={t('releaseDesk.pendingSettlementsDescription')}>
                {activeSettlements.length ? <div className="divide-y divide-slate-100">
                  {activeSettlements.map((record, index) => {
                    const id = recordId(record) || `settlement-${index}`;
                    return <button key={id} type="button" onClick={() => { setSelectedId(id); setError(''); setCredited(''); setBankRef(''); setOverrideNote(''); }} className={`flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0 ${selectedId === id ? 'rounded-lg bg-navy-50 px-3' : ''}`}>
                      <span className="min-w-0"><span className="block font-semibold text-navy-900">{text(record.reference ?? record.letter_number ?? record.release_id ?? record.id) || t('releaseDesk.unnamedSettlement')}</span><span className="mt-1 block text-xs text-slate-500">{text(record.institute_name) || t('releaseDesk.instituteNotListed')} · {t('releaseDesk.expectedCredit')}: {amount(expectedAicteShare(record))}</span></span>
                      <Badge tone="warning">{label(stateOf(record)) || t('releaseDesk.pending')}</Badge>
                    </button>;
                  })}
                </div> : <EmptyState icon={<FileCheck2 size={20} />} title={t('releaseDesk.noPendingSettlements')} description={t('releaseDesk.noPendingSettlementsDescription')} />}
              </Card>
              <Card title={t('releaseDesk.closedCases')}>
                {closedSettlements.length ? <div className="divide-y divide-slate-100">{closedSettlements.map((record, index) => <div key={recordId(record) || `closed-${index}`} className="py-3 first:pt-0 last:pb-0"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-navy-900">{text(record.reference ?? record.letter_number ?? record.release_id ?? record.id) || t('releaseDesk.unnamedSettlement')}</p><p className="mt-1 text-xs text-slate-500">{text(record.institute_name) || t('releaseDesk.instituteNotListed')}</p></div><Badge tone="success">{t('releaseDesk.closed')}</Badge></div><SettlementSummary record={record} /></div>)}</div> : <EmptyState title={t('releaseDesk.noClosedCases')} />}
              </Card>
            </div>
            <Card title={t('releaseDesk.confirmCredit')} description={t('releaseDesk.confirmCreditDescription')}>
              {!selected ? <EmptyState icon={<FileText size={20} />} title={t('releaseDesk.selectSettlement')} description={t('releaseDesk.selectSettlementDescription')} />
                : stateOf(selected) === 'CLOSED' ? <SettlementSummary record={selected} />
                  : <div className="space-y-5">
                    <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t('releaseDesk.expectedCredit')}</p><p className="mt-1 text-xl font-bold text-navy-900">{amount(expected)}</p>{breakdownRows(selected).length > 0 && <dl className="mt-3 space-y-2 border-t border-slate-200 pt-3">{breakdownRows(selected).map((row) => <div key={row.label} className="flex justify-between gap-3 text-sm"><dt className="text-slate-600">{row.label}</dt><dd className="font-medium">{amount(row.amount)}</dd></div>)}</dl>}</div>
                    <form className="space-y-4" onSubmit={submit}>
                      <FormField label={t('releaseDesk.creditedAmount')} name="credited-amount" type="number" min="0.01" step="0.01" required value={credited} onChange={(event) => setCredited(event.target.value)} suffix="INR" />
                      <FormField label={t('releaseDesk.bankReference')} name="bank-reference" required value={bankRef} onChange={(event) => setBankRef(event.target.value)} maxLength={120} />
                      {isMismatch && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-semibold">{t('releaseDesk.mismatchWarning')}</p><p className="mt-1">{t('releaseDesk.mismatchDescription', { expected: amount(expected), received: amount(creditedPaise) })}</p><label className="field-label mt-4 block" htmlFor="override-note">{t('releaseDesk.overrideNote')}</label><textarea id="override-note" className="input-control mt-1.5 min-h-20 resize-y py-3" value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} maxLength={500} /></div></div></div>}
                      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                      <Button type="submit" loading={confirmMutation.isPending} disabled={creditedPaise === undefined || !bankRef.trim() || (isMismatch && overrideNote.trim().length < 5)} leftIcon={<Check size={15} />}>{t('releaseDesk.confirmCredit')}</Button>
                    </form>
                  </div>}
            </Card>
          </div>
        )}
    </div>
  );
}
