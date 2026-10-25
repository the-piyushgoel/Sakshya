import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { formatDate } from '../../api/format';
import { useAuth } from '../../shell/auth';
import { Button, Card, DataTable, EmptyState, FormField, Modal, Skeleton, useToasts } from '../../ui';
import type { AuditEvent, AuditListResponse, AuditVerifyResponse, RepairDemoResponse, TamperDemoResponse } from './types';

const PAGE_SIZE = 25;
const listKey = 'audit-events';

function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'REQUEST_FAILED';
}

function displayTime(value: string | null): string {
  return value ? formatDate(value) : '—';
}

export function AuditPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles.includes('SYSTEM_ADMIN'));
  const { pushToast } = useToasts();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [actor, setActor] = useState(searchParams.get('actor_id') ?? '');
  const [entityType, setEntityType] = useState(searchParams.get('entity_type') ?? '');
  const [action, setAction] = useState(searchParams.get('action') ?? '');
  const [fromDate, setFromDate] = useState(searchParams.get('from') ?? '');
  const [toDate, setToDate] = useState(searchParams.get('to') ?? '');
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);
  const [confirmTamper, setConfirmTamper] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResponse | null>(null);
  const [demoUnavailable, setDemoUnavailable] = useState(false);
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const queryFilters = useMemo(() => ({
    actor_id: searchParams.get('actor_id') ?? '',
    entity_type: searchParams.get('entity_type') ?? '',
    action: searchParams.get('action') ?? '',
  }), [searchParams]);
  const query = useQuery({
    queryKey: [listKey, page, queryFilters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      Object.entries(queryFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
      return api.get<AuditListResponse>(`/audit?${params.toString()}`);
    },
    placeholderData: (previous) => previous,
    retry: false,
  });
  const verify = async () => {
    try {
      const result = await api.get<AuditVerifyResponse>('/audit/verify');
      setVerifyResult(result);
      return result;
    } catch (error) {
      pushToast({ title: 'Audit verification failed', description: `Error code: ${errorCode(error)}`, tone: 'error', code: errorCode(error) });
      return null;
    }
  };
  const tamper = useMutation({
    mutationFn: (seq: number) => api.post<TamperDemoResponse>('/admin/audit/tamper-demo', { seq }),
    onSuccess: async () => { setConfirmTamper(false); setDemoUnavailable(false); await verify(); await queryClient.invalidateQueries({ queryKey: [listKey] }); },
    onError: (error) => {
      if (error instanceof ApiError && [403, 404].includes(error.status)) setDemoUnavailable(true);
      else pushToast({ title: 'Could not simulate tampering', description: `Error code: ${errorCode(error)}`, tone: 'error', code: errorCode(error) });
    },
  });
  const repair = useMutation({
    mutationFn: (from_seq: number) => api.post<RepairDemoResponse>('/admin/audit/repair-demo', { from_seq }),
    onSuccess: async () => { setDemoUnavailable(false); await verify(); await queryClient.invalidateQueries({ queryKey: [listKey] }); },
    onError: (error) => {
      if (error instanceof ApiError && [403, 404].includes(error.status)) setDemoUnavailable(true);
      else pushToast({ title: 'Could not repair the audit chain', description: `Error code: ${errorCode(error)}`, tone: 'error', code: errorCode(error) });
    },
  });

  useEffect(() => {
    setActor(searchParams.get('actor_id') ?? '');
    setEntityType(searchParams.get('entity_type') ?? '');
    setAction(searchParams.get('action') ?? '');
    setFromDate(searchParams.get('from') ?? '');
    setToDate(searchParams.get('to') ?? '');
  }, [searchParams]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (actor.trim()) next.set('actor_id', actor.trim());
    if (entityType.trim()) next.set('entity_type', entityType.trim());
    if (action.trim()) next.set('action', action.trim());
    if (fromDate) next.set('from', fromDate);
    if (toDate) next.set('to', toDate);
    setSearchParams(next);
  };
  const clearFilters = () => {
    setActor(''); setEntityType(''); setAction(''); setFromDate(''); setToDate(''); setSearchParams({});
  };
  const allRows = query.data?.items ?? [];
  const rows = allRows.filter((event) => {
    const timestamp = event.ts?.slice(0, 10) ?? '';
    return (!searchParams.get('from') || timestamp >= (searchParams.get('from') ?? ''))
      && (!searchParams.get('to') || timestamp <= (searchParams.get('to') ?? ''));
  });
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = rows.find((row) => row.seq === expandedSeq);
  const demoOff = demoUnavailable || (query.error instanceof ApiError && [403, 404].includes(query.error.status));
  const columns = [
    { key: 'seq', header: '#', render: (event: AuditEvent) => <button className="font-mono text-navy-700 underline" onClick={() => setExpandedSeq(expandedSeq === event.seq ? null : event.seq)} aria-expanded={expandedSeq === event.seq}>{event.seq}</button> },
    { key: 'ts', header: 'Time', render: (event: AuditEvent) => displayTime(event.ts) },
    { key: 'actor', header: 'Actor', render: (event: AuditEvent) => <span title={event.actor_id}>{event.actor_id} <span className="text-xs text-slate-500">({event.actor_role})</span></span> },
    { key: 'action', header: 'Action', render: (event: AuditEvent) => event.action },
    { key: 'entity', header: 'Entity', render: (event: AuditEvent) => <span>{event.entity_type} <span className="font-mono text-xs">{event.entity_id}</span></span> },
    { key: 'hash', header: 'Hash', render: (event: AuditEvent) => <span className="font-mono text-xs" title={event.hash}>{event.hash.slice(0, 12)}…</span> },
  ];

  return <div className="mx-auto max-w-7xl space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-700">Evidence and governance</p><h1 className="mt-1 text-2xl font-bold text-navy-900">Audit trail</h1></div>
    <Card title="Search audit events" description="Filter the immutable event history and inspect event payloads.">
      <form onSubmit={applyFilters} className="grid gap-4 md:grid-cols-3">
        <FormField label="Actor ID" value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Exact actor ID" />
        <FormField label="Entity type" value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="e.g. BANK_REQUEST" />
        <FormField label="Action" value={action} onChange={(event) => setAction(event.target.value)} placeholder="e.g. BANK_REQUEST_CREATED" />
        <FormField label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <FormField label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <div className="flex items-end gap-2"><Button type="submit">Apply</Button><Button type="button" variant="secondary" onClick={clearFilters}>Clear</Button></div>
      </form>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" loading={false} onClick={() => void verify()}>Verify chain</Button>
        {isAdmin && <><Button variant="danger" onClick={() => setConfirmTamper(true)}>Simulate tampering</Button><Button variant="secondary" loading={repair.isPending} disabled={!verifyResult?.first_broken_seq} onClick={() => repair.mutate(verifyResult?.first_broken_seq ?? 1)}>Repair</Button></>}
      </div>
      {demoOff && isAdmin && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50"><EmptyState title="Audit demo controls unavailable" description="Tampering and repair actions are unavailable when DEMO_MODE is off or the action is forbidden." /></div>}
      {verifyResult && <div role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${verifyResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
        {verifyResult.ok ? `Chain intact (${verifyResult.checked} events)` : `BROKEN at #${verifyResult.first_broken_seq ?? 'unknown'}${verifyResult.reason ? ` · ${verifyResult.reason}` : ''}`}
      </div>}
    </Card>
    <Card title="Events" description={`${total.toLocaleString()} total events · newest first`}>
      {query.isLoading ? <div className="space-y-3"><Skeleton className="h-10"/><Skeleton className="h-10"/><Skeleton className="h-10"/></div>
        : query.isError ? <EmptyState title="Audit events unavailable" description={`Request failed with error code ${errorCode(query.error)}.`} action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry</Button>} />
          : total === 0 ? <EmptyState title="No audit events" description="Try changing the filters or clear them to see all events." />
            : <>
              <DataTable rows={rows} rowKey={(event) => String(event.seq)} columns={columns} emptyMessage="No events on this page match the selected date range." />
              {selected && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-navy-900">Event #{selected.seq} payload</h3><Button size="sm" variant="ghost" onClick={() => setExpandedSeq(null)}>Close</Button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">{JSON.stringify(selected.payload, null, 2)}</pre></div>}
              <div className="mt-4 flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Page {page} of {pageCount} · {PAGE_SIZE} per page</p><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page - 1)); setSearchParams(next); }}>Previous</Button><Button variant="secondary" disabled={page >= pageCount || query.isFetching} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page + 1)); setSearchParams(next); }}>Next</Button></div></div>
            </>}
    </Card>
    <Modal open={confirmTamper} title="Simulate audit tampering?" description="This changes an audit payload to demonstrate chain verification failure." onClose={() => setConfirmTamper(false)} footer={<><Button variant="secondary" onClick={() => setConfirmTamper(false)}>Cancel</Button><Button variant="danger" loading={tamper.isPending} disabled={isAdmin !== true} onClick={() => tamper.mutate(allRows.at(-1)?.seq ?? 1)}>Tamper chain</Button></>}>
      <p className="text-sm text-slate-600">The audit chain will be re-verified automatically after the action.</p>
    </Modal>
  </div>;
}
