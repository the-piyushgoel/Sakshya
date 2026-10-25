import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { formatINR } from '../../api/format';
import { useAuth } from '../../shell/auth';
import { Badge, Button, Card, DataTable, EmptyState, Modal, Skeleton, StatusPill, useToasts } from '../../ui';

type ReleaseRequest = {
  id: string;
  obligation_id: string;
  institute_id: string;
  institute_name: string;
  state: string;
  instrument_ids: string[];
  total_amount_paise: number;
  settlement: { principal_to_trust_paise: number; aicte_share_paise: number };
  eligibility_verdict?: string;
  rules?: { rule_id: string; name: string; result: string; message: string; fix_hint?: string | null }[];
  recommendation_note?: string | null;
};
type Hold = {
  id: string;
  scope: 'INSTITUTE' | 'TRUST' | 'INSTRUMENT';
  entity_id: string;
  reason: string;
  legal_ref?: string | null;
  is_active: boolean;
  placed_at: string;
  lifted_at?: string | null;
};

const previewRequests: ReleaseRequest[] = [{
  id: 'rel-req-preview-01',
  obligation_id: 'obligation-vj-term-complete',
  institute_id: 'institute-vidya-jyoti',
  institute_name: 'Vidya Jyoti Institute of Technology',
  state: 'INELIGIBLE',
  instrument_ids: ['instrument-vj-matured'],
  total_amount_paise: 270000000,
  settlement: { principal_to_trust_paise: 270000000, aicte_share_paise: 0 },
  eligibility_verdict: 'INELIGIBLE',
  rules: [
    { rule_id: 'E-01', name: 'Obligation and ownership', result: 'PASS', message: 'Term-complete obligation belongs to this institute.' },
    { rule_id: 'E-03', name: 'Active instrument and trust', result: 'PASS', message: 'Instrument is bank-confirmed.', fix_hint: null },
    { rule_id: 'E-06', name: 'Compliance hold', result: 'FAIL', message: 'An active compliance hold blocks release.', fix_hint: 'Compliance Officer must lift the hold after review.' },
    { rule_id: 'E-08', name: 'Confirmation freshness', result: 'PASS', message: 'Latest confirmation is within policy freshness.' },
  ],
}];

const previewHold: Hold = {
  id: 'hold-preview-vj',
  scope: 'INSTITUTE',
  entity_id: 'institute-vidya-jyoti',
  reason: 'Compliance review in progress',
  legal_ref: 'DEMO/COMPLIANCE/001',
  is_active: true,
  placed_at: '2026-10-24T10:15:00Z',
};

function list<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'object' && value !== null && 'items' in value && Array.isArray(value.items)) return value.items as T[];
  throw new Error('The release API returned an unexpected list response.');
}

export function OfficerReleaseWorkspace() {
  const { user, authBypassed } = useAuth();
  const { pushToast } = useToasts();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [action, setAction] = useState<'recommend' | 'reject' | 'hold' | 'lift' | null>(null);
  const [note, setNote] = useState('');
  const [holdScope, setHoldScope] = useState<'INSTITUTE' | 'TRUST' | 'INSTRUMENT'>('INSTITUTE');
  const [holdEntityId, setHoldEntityId] = useState('');
  const [legalRef, setLegalRef] = useState('');
  const [fixtureRequests, setFixtureRequests] = useState(previewRequests);
  const [fixtureHolds, setFixtureHolds] = useState([previewHold]);
  const canViewHolds = user?.roles.some((role) => (
    role === 'COMPLIANCE_OFFICER' || role === 'APPROVING_OFFICER' || role === 'RELEASE_AUTHORITY'
    || role === 'LEADERSHIP' || role === 'AUDITOR' || role === 'SYSTEM_ADMIN'
  )) ?? false;

  const requestsQuery = useQuery({
    queryKey: ['officer', 'release-requests'],
    queryFn: async () => list<ReleaseRequest>(await api.get<unknown>('/release/requests')),
    enabled: !authBypassed,
  });
  const holdsQuery = useQuery({
    queryKey: ['officer', 'holds'],
    queryFn: async () => list<Hold>(await api.get<unknown>('/holds')),
    enabled: !authBypassed && canViewHolds,
  });
  const requests = authBypassed ? fixtureRequests : requestsQuery.data ?? [];
  const holds = authBypassed ? fixtureHolds : canViewHolds ? holdsQuery.data ?? [] : [];
  const selected = requests.find((item) => item.id === selectedId) ?? requests[0];
  const detailQuery = useQuery({
    queryKey: ['officer', 'release-detail', selected?.id],
    queryFn: () => api.get<ReleaseRequest>(`/release/requests/${encodeURIComponent(selected!.id)}`),
    enabled: Boolean(selected?.id) && !authBypassed,
  });
  const detail = authBypassed ? selected : detailQuery.data ?? selected;
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api.post<unknown>(path, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['officer', 'release-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['officer', 'release-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['officer', 'holds'] }),
      ]);
    },
  });

  const saveAction = async () => {
    if (!note.trim()) return;
    if (authBypassed) {
      if (action === 'recommend' && selected) {
        setFixtureRequests((current) => current.map((item) => item.id === selected.id
          ? { ...item, state: 'RECOMMENDED', recommendation_note: note }
          : item));
      } else if (action === 'reject' && selected) {
        setFixtureRequests((current) => current.map((item) => item.id === selected.id ? { ...item, state: 'REJECTED' } : item));
      } else if (action === 'hold') {
        setFixtureHolds((current) => [{
          id: `hold-preview-${current.length + 1}`,
          scope: holdScope,
          entity_id: holdEntityId,
          reason: note,
          legal_ref: legalRef || null,
          is_active: true,
          placed_at: '2026-10-24T10:15:00Z',
        }, ...current]);
      } else if (action === 'lift') {
        setFixtureHolds((current) => current.map((hold) => hold.id === holdEntityId ? { ...hold, is_active: false } : hold));
      }
      setAction(null);
      setNote('');
      setLegalRef('');
      pushToast({ title: 'Fixture release action previewed', description: 'Local preview state only — no backend record was changed.', tone: 'info' });
      return;
    }
    try {
      if (action === 'recommend' && selected) {
        await mutation.mutateAsync({ path: `/release/requests/${selected.id}/recommend`, body: { recommendation_note: note } });
      } else if (action === 'reject' && selected) {
        await mutation.mutateAsync({ path: `/release/requests/${selected.id}/reject`, body: { reason: note } });
      } else if (action === 'hold') {
        await mutation.mutateAsync({ path: '/holds', body: { scope: holdScope, entity_id: holdEntityId, reason: note, legal_ref: legalRef || undefined } });
      } else if (action === 'lift') {
        const hold = holds.find((item) => item.id === holdEntityId);
        if (!hold) throw new Error('Select an active hold to lift.');
        await mutation.mutateAsync({ path: `/holds/${hold.id}/lift`, body: { reason: note } });
      }
      pushToast({ title: 'Release action completed', tone: 'success' });
      setAction(null);
      setNote('');
      setLegalRef('');
    } catch (error) {
      pushToast({ title: error instanceof Error ? error.message : 'Release action failed', tone: 'error', code: error instanceof ApiError ? error.code : undefined });
    }
  };

  const compliance = user?.roles.includes('COMPLIANCE_OFFICER') ?? false;
  const approver = user?.roles.includes('APPROVING_OFFICER') ?? false;
  const signatory = user?.roles.includes('INS_SIGNATORY') ?? false;
  const rules = detail?.rules ?? [];
  const openHold = holds.find((hold) => hold.is_active && (
    hold.entity_id === selected?.institute_id || selected?.instrument_ids.includes(hold.entity_id)
  ));

  return (
    <div className="space-y-5">
      <div className="page-heading"><div><span className="eyebrow">OFFICER WORKSPACE</span><h1>Release Review & Holds</h1><p>Review eligibility rules, fix hints, recommendations and compliance hold status.</p></div>{authBypassed && <Badge tone="warning">Fixture preview</Badge>}</div>
      {!authBypassed && (requestsQuery.isLoading || canViewHolds && holdsQuery.isLoading) && <Card><Skeleton className="h-12 w-full" /><Skeleton className="mt-3 h-36 w-full" /></Card>}
      {!authBypassed && (requestsQuery.isError || canViewHolds && holdsQuery.isError) && <Card className="border-red-200 bg-red-50"><p role="alert" className="text-sm text-red-800">{(requestsQuery.error ?? holdsQuery.error)?.message}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => { void requestsQuery.refetch(); if (canViewHolds) void holdsQuery.refetch(); }}>Retry</Button></Card>}
      <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.5fr)]">
        <div className="space-y-5">
          <Card title="Release requests" description="Cases include eligibility verdict and state.">
            <DataTable rows={requests} rowKey={(item) => item.id} emptyMessage="No release requests are available." columns={[
              { key: 'institute', header: 'Institute / request', render: (item) => <button type="button" className="text-left font-semibold text-navy-800 hover:underline" onClick={() => setSelectedId(item.id)}>{item.institute_name}<span className="mt-1 block font-mono text-xs font-normal text-slate-500">{item.id}</span></button> },
              { key: 'state', header: 'State', render: (item) => <StatusPill value={item.state} /> },
              { key: 'amount', header: 'Amount', render: (item) => formatINR(item.total_amount_paise) },
            ]} />
          </Card>
          <Card title="Compliance holds" description="Only Compliance Officers can place or lift a hold.">
            {holds.length ? <div className="space-y-3">{holds.map((hold) => <div key={hold.id} className="rounded-lg border border-slate-100 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><Badge tone={hold.is_active ? 'danger' : 'success'}>{hold.is_active ? 'ACTIVE' : 'LIFTED'} · {hold.scope}</Badge>{compliance && hold.is_active && <Button size="sm" variant="outline" onClick={() => { setHoldEntityId(hold.id); setAction('lift'); }}>Lift hold</Button>}</div><p className="mt-2 text-sm font-medium">{hold.reason}</p><p className="mt-1 text-xs text-slate-500">{hold.legal_ref ?? hold.entity_id}</p></div>)}</div> : <EmptyState title="No holds loaded" description={authBypassed ? 'Fixture preview has no active hold list.' : 'The API returned no compliance holds.'} />}
            {compliance && <Button className="mt-4" variant="outline" leftIcon={<ShieldAlert size={14} />} onClick={() => { setAction('hold'); setHoldEntityId(selected?.institute_id ?? ''); }}>Place compliance hold</Button>}
          </Card>
        </div>

        <Card title="Eligibility report" description={detail ? `${detail.institute_name} · ${detail.id}` : 'Select a release request to see its eligibility evaluation.'} action={detail && <Badge tone={detail.eligibility_verdict === 'ELIGIBLE' ? 'success' : 'danger'}>{detail.eligibility_verdict ?? detail.state}</Badge>}>
          {detailQuery.isLoading && <Skeleton className="h-32 w-full" />}
          {detailQuery.isError && <p role="alert" className="text-sm text-red-700">{detailQuery.error.message}</p>}
          {detail && <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Principal to institute</p><p className="mt-1 font-semibold">{formatINR(detail.settlement.principal_to_trust_paise)}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">AICTE share</p><p className="mt-1 font-semibold">{formatINR(detail.settlement.aicte_share_paise)}</p></div></div>
            {openHold && <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><p><strong>Active hold:</strong> {openHold.reason}. {openHold.legal_ref && <span>Reference: {openHold.legal_ref}</span>}</p></div>}
            <div className="space-y-3">{rules.length ? rules.map((rule) => <div key={rule.rule_id} className="rounded-lg border border-slate-100 p-3"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-slate-500">{rule.rule_id}</span><strong className="text-sm">{rule.name}</strong><Badge tone={rule.result === 'PASS' ? 'success' : rule.result === 'FAIL' ? 'danger' : 'warning'}>{rule.result}</Badge></div><p className="mt-2 text-sm text-slate-600">{rule.message}</p>{rule.fix_hint && <p className="mt-2 flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900"><CheckCircle2 size={14} className="shrink-0" />Fix: {rule.fix_hint}</p>}</div>) : <EmptyState title="Eligibility rules unavailable" description="This request has no rule evaluation in the response." />}</div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
              {approver && detail.eligibility_verdict === 'ELIGIBLE' && !['RECOMMENDED', 'APPROVED', 'EXECUTED', 'CLOSED', 'REJECTED'].includes(detail.state) && <Button onClick={() => setAction('recommend')}>Recommend release</Button>}
              {approver && !['RECOMMENDED', 'APPROVED', 'EXECUTED', 'CLOSED', 'REJECTED'].includes(detail.state) && <Button variant="danger" onClick={() => setAction('reject')}>Reject request</Button>}
              {signatory && detail.state === 'INELIGIBLE' && <Button variant="outline" onClick={async () => {
                if (authBypassed) {
                  if (fixtureHolds.some((hold) => hold.is_active && hold.entity_id === detail.institute_id)) {
                    pushToast({ title: 'Release remains ineligible', description: 'Lift the active compliance hold before resubmitting.', tone: 'warning' });
                    return;
                  }
                  setFixtureRequests((current) => current.map((item) => item.id === detail.id
                    ? {
                      ...item,
                      state: 'SUBMITTED',
                      eligibility_verdict: 'ELIGIBLE',
                      rules: item.rules?.map((rule) => rule.rule_id === 'E-06'
                        ? { ...rule, result: 'PASS', message: 'Compliance hold has been lifted.' }
                        : rule),
                    }
                    : item));
                  pushToast({ title: 'Fixture request resubmitted', description: 'Eligibility is now ELIGIBLE in the local preview.', tone: 'info' });
                  return;
                }
                try {
                  await api.post(`/release/requests/${detail.id}/resubmit`, {});
                  await queryClient.invalidateQueries({ queryKey: ['officer', 'release-requests'] });
                  await queryClient.invalidateQueries({ queryKey: ['officer', 'release-detail'] });
                  pushToast({ title: 'Release request resubmitted', tone: 'success' });
                } catch (error) { pushToast({ title: error instanceof Error ? error.message : 'Resubmission failed', tone: 'error', code: error instanceof ApiError ? error.code : undefined }); }
              }}>Resubmit after fixes</Button>}
              {!approver && !compliance && !signatory && <p className="self-center text-xs text-slate-500">Read-only access for this role.</p>}
            </div>
          </>}
        </Card>
      </div>
      <Modal open={action !== null} title={action === 'recommend' ? 'Recommend release' : action === 'reject' ? 'Reject release request' : action === 'lift' ? 'Lift compliance hold' : 'Place compliance hold'} description="This action is recorded and audited by the backend." onClose={() => setAction(null)} footer={<><Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button><Button disabled={!note.trim() || mutation.isPending || (action === 'hold' && !holdEntityId)} onClick={() => void saveAction()}>{action === 'recommend' ? 'Submit recommendation' : action === 'reject' ? 'Confirm rejection' : action === 'lift' ? 'Lift hold' : 'Place hold'}</Button></>}>
        <div className="space-y-3">
          {action === 'hold' && <><label className="field-label">Scope<select className="input-control mt-1.5" value={holdScope} onChange={(event) => setHoldScope(event.target.value as typeof holdScope)}><option>INSTITUTE</option><option>TRUST</option><option>INSTRUMENT</option></select></label><label className="field-label">Entity ID<input className="input-control mt-1.5" value={holdEntityId} onChange={(event) => setHoldEntityId(event.target.value)} /></label><label className="field-label">Legal reference<input className="input-control mt-1.5" value={legalRef} onChange={(event) => setLegalRef(event.target.value)} /></label></>}
          <label className="field-label">{action === 'recommend' ? 'Recommendation note' : action === 'reject' ? 'Rejection reason' : 'Reason'}<textarea className="input-control mt-1.5 min-h-24" value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </div>
      </Modal>
    </div>
  );
}
