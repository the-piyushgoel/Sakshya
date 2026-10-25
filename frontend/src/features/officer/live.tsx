import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Building2, ChevronRight, FileCheck2, Landmark, ShieldAlert, UserRoundCheck } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { formatINR } from '../../api/format';
import { useAuth } from '../../shell/auth';
import { Badge, Button, Card, DataTable, EmptyState, Modal, Skeleton, StatusPill, StepUpModal, Tabs, Timeline, TrustBadge, useToasts } from '../../ui';

type Json = Record<string, unknown>;
type QueueRecord = {
  case_type: string;
  id: string;
  institute?: string;
  institute_name?: string;
  bank?: string;
  bank_id?: string;
  fdr_number?: string;
  amount?: number;
  principal_paise?: number;
  state: string;
  owner_role?: string;
  age_days?: number;
  score?: number;
  priority?: number;
  reasons?: string[];
  sla_due?: string | null;
  sla_breached?: boolean;
};
type InstrumentRecord = {
  id: string;
  bank_id: string;
  state: string;
  is_quarantined: boolean;
  fields: { name: string; value: string; trust: 'L0_CLAIMED' | 'L1_ATTESTED' | 'L2_BANK_CONFIRMED'; source: string; evidence_ref?: string; set_at: string }[];
  documents: Json[];
  doc_checks: { name: string; outcome: string; details?: string }[];
  discrepancies: { id: string; code: string; severity: string; status: string; details?: Json }[];
  bank_requests: { id: string; state: string; outcome?: string; created_at: string }[];
};
type RiskRecord = { score: number; priority: number; factors: Record<string, number>; reasons: string[]; sla_breached: boolean };

function object(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : {};
}

function list<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const record = object(value);
  if (Array.isArray(record.items)) return record.items as T[];
  throw new Error('The officer API returned an unexpected list response.');
}

function text(value: unknown, fallback = '—'): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

export function LiveOfficerConsole() {
  const { user } = useAuth();
  const { pushToast } = useToasts();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [whyOpen, setWhyOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [requestReason, setRequestReason] = useState('Please verify the FDR, holder, principal, maturity and lien details.');

  const queueQuery = useQuery({
    queryKey: ['officer', 'queue', stateFilter, bankFilter],
    queryFn: async () => list<QueueRecord>(await api.get<unknown>(`/queue?${new URLSearchParams({
      ...(stateFilter ? { state: stateFilter } : {}),
      ...(bankFilter ? { bank_id: bankFilter } : {}),
    })}`)),
  });
  const queue = queueQuery.data ?? [];
  const selected = queue.find((item) => item.id === selectedId) ?? queue[0];
  const isInstrumentCase = selected?.case_type !== 'RELEASE';
  const detailQuery = useQuery({
    queryKey: ['officer', 'instrument', selected?.id],
    queryFn: () => api.get<InstrumentRecord>(`/instruments/${encodeURIComponent(selected!.id)}`),
    enabled: Boolean(selected?.id) && isInstrumentCase,
  });
  const riskQuery = useQuery({
    queryKey: ['officer', 'risk', selected?.id],
    queryFn: () => api.get<RiskRecord>(`/instruments/${encodeURIComponent(selected!.id)}/risk`),
    enabled: Boolean(selected?.id) && isInstrumentCase,
  });
  const timelineQuery = useQuery({
    queryKey: ['officer', 'timeline', selected?.id],
    queryFn: async () => list<{ from_state?: string; to_state: string; reason?: string; at: string }>(
      await api.get<unknown>(`/instruments/${encodeURIComponent(selected!.id)}/timeline`),
    ),
    enabled: Boolean(selected?.id) && isInstrumentCase,
  });
  const contactQuery = useQuery({
    queryKey: ['officer', 'bank-contacts', selected?.bank_id],
    queryFn: async () => list<{ name: string; email: string; phone: string }>(
      await api.get<unknown>(`/banks/${encodeURIComponent(selected!.bank_id!)}/nodal-contacts`),
    ),
    enabled: requestOpen && isInstrumentCase && Boolean(selected?.bank_id),
  });

  const invalidateCase = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['officer', 'queue'] }),
      queryClient.invalidateQueries({ queryKey: ['officer', 'instrument', selected?.id] }),
      queryClient.invalidateQueries({ queryKey: ['officer', 'risk', selected?.id] }),
      queryClient.invalidateQueries({ queryKey: ['officer', 'timeline', selected?.id] }),
      queryClient.invalidateQueries({ queryKey: ['bank', 'inbox'] }),
    ]);
  };
  const actionMutation = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: unknown }) => api.post<unknown>(path, body ?? {}),
    onSuccess: invalidateCase,
  });
  const failAction = (error: Error) => pushToast({
    title: error.message,
    description: error instanceof ApiError ? `Request failed (${error.status}).` : 'The action could not be completed.',
    tone: 'error',
    code: error instanceof ApiError ? error.code : undefined,
  });
  const runAction = async (path: string, body?: unknown) => {
    try {
      await actionMutation.mutateAsync({ path, body });
      pushToast({ title: 'Action completed', tone: 'success' });
    } catch (error) {
      failAction(error instanceof Error ? error : new Error('Action failed'));
    }
  };

  const discrepancies = detailQuery.data?.discrepancies ?? [];
  const openDiscrepancies = discrepancies.filter((item) => item.status === 'OPEN');
  const filteredQueue = queue.filter((item) => {
    const severity = item.case_type === 'RELEASE'
      ? item.state === 'INELIGIBLE' ? 'HIGH' : 'MEDIUM'
      : item.id === selected?.id
      ? discrepancies.some((disc) => disc.status === 'OPEN' && disc.severity === 'HIGH') ? 'HIGH'
        : discrepancies.some((disc) => disc.status === 'OPEN' && disc.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW'
      : item.state === 'DISCREPANCY' ? 'HIGH' : 'LOW';
    return !severityFilter || severity === severityFilter;
  });

  if (queueQuery.isLoading) {
    return <div className="space-y-4"><div className="page-heading"><div><span className="eyebrow">OFFICER WORKSPACE</span><h1>Officer Console</h1><p>Loading the live priority queue…</p></div></div><Card><Skeleton className="h-8 w-full" /><Skeleton className="mt-3 h-32 w-full" /></Card></div>;
  }

  return (
    <div className="space-y-5">
      <div className="page-heading"><div><span className="eyebrow">OFFICER WORKSPACE · LIVE API</span><h1>Officer Console</h1><p>Review risk, evidence, bank confirmation and discrepancies.</p></div><Badge tone="info"><span className="inline-flex items-center gap-1"><Building2 size={13} /> {queueQuery.data?.length ?? 0} cases</span></Badge></div>
      {queueQuery.isError && <Card className="border-red-200 bg-red-50"><p role="alert" className="text-sm text-red-800">{queueQuery.error.message}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void queueQuery.refetch()}>Retry</Button></Card>}
      <Card title="Priority queue" description="Queue is sorted by backend priority; ties are ordered by age.">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <label className="field-label">State<select className="input-control mt-1.5" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="">All actionable states</option>{['SCRUTINY', 'AUTO_CHECKING', 'BANK_PENDING', 'DISCREPANCY', 'RENEWAL_DUE', 'SUBMITTED', 'INELIGIBLE'].map((state) => <option key={state}>{state}</option>)}</select></label>
          <label className="field-label">Bank ID<input className="input-control mt-1.5" value={bankFilter} onChange={(event) => setBankFilter(event.target.value)} placeholder="Filter by bank ID" /></label>
          <label className="field-label">Severity<select className="input-control mt-1.5" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="">All severities</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label>
        </div>
        <DataTable rows={filteredQueue} rowKey={(item) => item.id} emptyMessage={queueQuery.isError ? 'Queue could not be loaded.' : 'No actionable cases match these filters.'} columns={[
          { key: 'institute', header: 'Institute / FDR', render: (item) => <button type="button" className="text-left font-semibold text-navy-800 hover:underline" onClick={() => { setSelectedId(item.id); setWhyOpen(false); }}>{item.institute ?? item.institute_name ?? item.id}<span className="mt-1 block font-mono text-xs font-normal text-slate-500">{item.fdr_number ?? item.case_type}</span></button> },
          { key: 'bank', header: 'Bank / amount', render: (item) => <span>{item.bank ?? item.bank_id}<span className="mt-1 block text-xs text-slate-500">{formatINR(item.amount ?? item.principal_paise ?? 0)}</span></span> },
          { key: 'state', header: 'State', render: (item) => <StatusPill value={item.state} /> },
          { key: 'priority', header: 'Priority', render: (item) => <span className="font-bold">{item.priority ?? item.score ?? 0}<span className="ml-1 text-xs font-normal text-slate-500">({item.score ?? 0} risk)</span></span> },
          { key: 'age', header: 'Age / SLA', render: (item) => <span>{item.age_days ?? 0} days{item.sla_breached && <span className="mt-1 block text-xs font-semibold text-red-700">SLA breached</span>}</span> },
          { key: 'owner', header: 'Owner', render: (item) => text(item.owner_role) },
          { key: 'open', header: '', render: (item) => <Button variant="ghost" size="sm" rightIcon={<ChevronRight size={14} />} onClick={() => setSelectedId(item.id)}>Review</Button> },
        ]} />
      </Card>

      {selected ? (
        <Card title="Case workspace" description={`${selected.institute ?? selected.institute_name ?? selected.id} · ${selected.fdr_number ?? ''}`} action={<StatusPill value={selected.state} />}>
          {selected.case_type === 'RELEASE' ? <div className="space-y-4 pt-4">
            <div className="rounded-xl bg-navy-50/70 p-4"><p className="font-semibold text-navy-900">Release request · {selected.id}</p><p className="mt-1 text-sm text-slate-600">Priority {selected.priority ?? 0} · {selected.age_days ?? 0} days pending · owner {text(selected.owner_role)}</p><div className="mt-3 space-y-1">{(selected.reasons ?? []).map((reason) => <p key={reason} className="text-sm text-slate-700">{reason}</p>)}</div></div>
            <Link to="/officer/releases" className="button button-primary button-md inline-flex">Open eligibility report and holds</Link>
          </div> : detailQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-32 w-full" /></div>
            : detailQuery.isError ? <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{detailQuery.error.message}<Button className="ml-3" size="sm" variant="outline" onClick={() => void detailQuery.refetch()}>Retry</Button></div>
              : detailQuery.data && <>
                <div className="mb-5 grid gap-4 rounded-xl bg-navy-50/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex items-start gap-3"><span className="rounded-lg bg-white p-2 text-amber-700"><ShieldAlert size={19} /></span><div><p className="text-sm font-semibold">Why this is first</p><p className="mt-1 text-sm text-slate-600">Risk score {riskQuery.data?.score ?? selected.score ?? 0} · priority {riskQuery.data?.priority ?? selected.priority ?? 0} · {selected.age_days ?? 0} days old.</p></div></div>
                  <Button variant="outline" size="sm" aria-expanded={whyOpen} onClick={() => setWhyOpen((value) => !value)} rightIcon={<ArrowUpRight size={14} />}>{whyOpen ? 'Hide factors' : 'Show risk factors'}</Button>
                  {whyOpen && <div className="space-y-3 border-t border-navy-100 pt-4 sm:col-span-2">{(riskQuery.data?.reasons ?? selected.reasons ?? []).map((reason) => <p key={reason} className="text-sm text-slate-700">{reason}</p>)}{riskQuery.data?.factors && Object.entries(riskQuery.data.factors).map(([name, value]) => <div key={name}><div className="mb-1 flex justify-between text-xs"><span>{name.replaceAll('_', ' ')}</span><strong>{Math.round(value * 100)}%</strong></div><div className="h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></div></div>)}</div>}
                </div>
                <Tabs tabs={[
                  { id: 'overview', label: 'Overview', content: <div className="pt-5"><DataTable rows={detailQuery.data.fields} rowKey={(field) => field.name} columns={[
                    { key: 'name', header: 'Field', render: (field) => <strong>{field.name}</strong> },
                    { key: 'value', header: 'Value', render: (field) => field.value || '—' },
                    { key: 'trust', header: 'Trust', render: (field) => <TrustBadge trust={field.trust} source={field.source} evidenceRef={field.evidence_ref} setAt={field.set_at} /> },
                    { key: 'evidence', header: 'Evidence', render: (field) => <span className="text-xs">{field.source}<span className="mt-1 block text-slate-500">{field.evidence_ref ?? '—'}</span></span> },
                  ]} /></div> },
                  { id: 'documents', label: 'Documents & checks', content: <div className="space-y-3 pt-5">{detailQuery.data.documents.map((doc, index) => <div key={text(doc.id, String(index))} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><FileCheck2 size={17} /><div><p className="font-semibold">{text(doc.filename, `Document ${index + 1}`)}</p><p className="text-xs text-slate-500">{text(doc.sha256, '')}</p></div></div>)}{detailQuery.data.doc_checks.map((check, index) => <div key={`${check.name}-${index}`} className="flex justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm"><span>{check.name}<span className="mt-1 block text-xs text-slate-500">{check.details}</span></span><Badge tone={check.outcome === 'PASS' ? 'success' : check.outcome === 'FLAG' ? 'warning' : 'neutral'}>{check.outcome}</Badge></div>)}</div> },
                  { id: 'bank', label: 'Bank confirmation', content: <div className="grid gap-5 pt-5 md:grid-cols-2"><div><Timeline events={detailQuery.data.bank_requests.map((request) => ({ title: `Bank request · ${request.state}`, description: request.outcome ?? 'Awaiting response', date: request.created_at, tone: request.state.startsWith('CONFIRMED') ? 'success' : 'warning' }))} /></div><div className="rounded-xl border border-slate-100 p-4"><h3 className="font-semibold">Directory contact</h3>{contactQuery.isLoading ? <Skeleton className="mt-3 h-12 w-full" /> : contactQuery.isError ? <p role="alert" className="mt-2 text-sm text-red-700">{contactQuery.error.message}</p> : <p className="mt-2 text-sm text-slate-600">{contactQuery.data?.[0]?.name ?? 'Load contacts from the bank directory when creating a request.'}</p>}</div></div> },
                  { id: 'discrepancies', label: 'Discrepancies', content: <div className="space-y-3 pt-5">{openDiscrepancies.length ? openDiscrepancies.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-amber-600" /><strong>{item.code}</strong><Badge tone={item.severity === 'HIGH' ? 'danger' : 'warning'}>{item.severity}</Badge></div><Button size="sm" variant="outline" onClick={() => setResolutionOpen(true)}>Resolve</Button></div>) : <EmptyState title="No open discrepancies" description="The instrument has no unresolved flags." />}</div> },
                  { id: 'timeline', label: 'Timeline', content: <div className="pt-5"><Timeline events={(timelineQuery.data ?? []).map((item) => ({ title: `${item.from_state ?? 'Created'} → ${item.to_state}`, description: item.reason, date: item.at, tone: item.to_state === 'ACTIVE' ? 'success' : 'neutral' }))} /></div> },
                ]} />
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
                  {user?.roles.some((role) => role === 'SCRUTINY_OFFICER' || role === 'APPROVING_OFFICER') && <Button leftIcon={<Landmark size={15} />} onClick={() => setRequestOpen(true)}>Request bank confirmation</Button>}
                  {user?.roles.includes('APPROVING_OFFICER') && <Button variant="secondary" leftIcon={<UserRoundCheck size={15} />} onClick={() => setStepUpOpen(true)}>Activate · step-up</Button>}
                  {(user?.roles.includes('APPROVING_OFFICER') || user?.roles.includes('COMPLIANCE_OFFICER')) && <Button variant="outline" onClick={() => void runAction(`/instruments/${selected.id}/quarantine`)}>Quarantine</Button>}
                  {user?.roles.includes('APPROVING_OFFICER') && <Button variant="danger" onClick={() => void runAction(`/instruments/${selected.id}/reject`, { reason: 'Rejected after officer review' })}>Reject</Button>}
                </div>
              </>}
        </Card>
      ) : <Card><EmptyState title={queueQuery.isError ? 'Queue unavailable' : 'No actionable cases'} description={queueQuery.isError ? 'Use retry to request the officer queue again.' : 'There are no cases matching the selected filters.'} action={queueQuery.isError ? <Button variant="outline" onClick={() => void queueQuery.refetch()}>Retry</Button> : undefined} /></Card>}

      <Modal open={requestOpen} title="Request bank confirmation" description="Requests are routed to the bank directory contact, not a contact printed on the document." onClose={() => setRequestOpen(false)} footer={<><Button variant="secondary" onClick={() => setRequestOpen(false)}>Cancel</Button><Button disabled={!selected || actionMutation.isPending} onClick={() => void runAction('/bank-requests', { instrument_id: selected?.id, reason: requestReason }).then(() => setRequestOpen(false))}>Send request</Button></>}>
        <div className="space-y-4"><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase text-emerald-800">Verified bank directory</p>{contactQuery.isLoading ? <Skeleton className="mt-2 h-10 w-full" /> : contactQuery.isError ? <p role="alert" className="mt-2 text-sm text-red-700">{contactQuery.error.message}</p> : contactQuery.data?.length ? contactQuery.data.map((contact) => <p key={contact.email} className="mt-2 text-sm text-emerald-950">{contact.name} · {contact.email} · {contact.phone}</p>) : <p className="mt-2 text-sm text-emerald-950">No directory contact returned for this bank.</p>}</div><label className="field-label">Reason<textarea className="input-control mt-1.5 min-h-24" value={requestReason} onChange={(event) => setRequestReason(event.target.value)} /></label><p className="text-xs text-slate-500">Contacts printed on uploaded documents are ignored.</p></div>
      </Modal>
      <Modal open={resolutionOpen} title="Resolve discrepancy" onClose={() => setResolutionOpen(false)} footer={<><Button variant="secondary" onClick={() => setResolutionOpen(false)}>Cancel</Button><Button disabled={!resolutionNote.trim() || actionMutation.isPending} onClick={() => {
        const discrepancy = openDiscrepancies[0];
        if (!discrepancy) return;
        void runAction(`/discrepancies/${discrepancy.id}/resolve`, { action: 'ESCALATE', note: resolutionNote }).then(() => { setResolutionOpen(false); setResolutionNote(''); });
      }}>Escalate with note</Button></>}>
        <label className="field-label">Officer note<textarea className="input-control mt-1.5 min-h-24" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="A note is required to resolve a discrepancy." /></label>
      </Modal>
      <StepUpModal open={stepUpOpen} onClose={() => setStepUpOpen(false)} title="Approve instrument activation" onSubmit={async (pin) => {
        await api.post('/auth/step-up', { pin });
        await api.post(`/instruments/${selected?.id}/activate`, {});
        setStepUpOpen(false);
        await invalidateCase();
        pushToast({ title: 'Instrument activated', tone: 'success' });
      }} />
    </div>
  );
}
