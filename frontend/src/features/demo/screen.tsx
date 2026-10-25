import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { formatDate } from '../../api/format';
import { Button, Card, DataTable, EmptyState, FormField, Modal, Skeleton } from '../../ui';
import type { DemoAlert, DemoClockState, DemoResult } from './types';

const clockKey = ['demo-clock'];
const alertsKey = ['demo-alerts'];

function listFrom<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'object' && value !== null && 'items' in value && Array.isArray(value.items)) return value.items as T[];
  if (typeof value === 'object' && value !== null && 'results' in value && Array.isArray(value.results)) return value.results as T[];
  return [];
}

function display(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function resultLines(value: DemoResult): Array<[string, string]> {
  const nested = value.tick_result ?? value.tick ?? value.result ?? value;
  if (Array.isArray(nested)) return nested.map((item, index) => [`Result ${index + 1}`, display(item)]);
  if (typeof nested === 'object' && nested !== null) return Object.entries(nested).map(([key, item]) => [key.replaceAll('_', ' '), display(item)]);
  return [['Result', display(nested)]];
}

export function DemoControlPage() {
  const client = useQueryClient();
  const [days, setDays] = useState('1');
  const [confirmReset, setConfirmReset] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const clockQuery = useQuery({ queryKey: clockKey, queryFn: () => api.get<DemoClockState>('/admin/clock'), retry: false });
  const alertsQuery = useQuery({ queryKey: alertsKey, queryFn: async () => listFrom<DemoAlert>(await api.get<unknown>('/alerts?limit=10')),
    select: (alerts) => alerts.slice(0, 10), retry: false });

  const afterClockChange = async (response: DemoResult) => {
    setResult(response);
    await Promise.all([
      client.invalidateQueries({ queryKey: clockKey }),
      client.invalidateQueries({ queryKey: alertsKey }),
    ]);
  };
  const advance = useMutation({
    mutationFn: (count: number) => api.post<DemoResult>('/admin/clock/advance', { days: count, run_tick: true }),
    onSuccess: afterClockChange,
  });
  const reset = useMutation({
    mutationFn: () => api.post<DemoResult>('/admin/clock/reset'),
    onSuccess: async (response) => { setConfirmReset(false); await afterClockChange(response); },
  });
  const tick = useMutation({
    mutationFn: () => api.post<DemoResult>('/admin/tick'),
    onSuccess: async (response) => {
      setResult(response);
      await client.invalidateQueries({ queryKey: alertsKey });
    },
  });

  const clock = clockQuery.data;
  const simulated = clock?.now ?? clock?.current_time ?? clock?.simulated_at;
  const real = clock?.real_now ?? clock?.real_time ?? clock?.real_date;
  const demoOff = clockQuery.error instanceof ApiError && [403, 404].includes(clockQuery.error.status);
  const alerts = alertsQuery.data ?? [];
  const alertInstrument = (alert: DemoAlert) => typeof alert.instrument === 'object' && alert.instrument !== null
    ? alert.instrument.fdr_number ?? alert.instrument.id ?? alert.instrument_id ?? alert.fdr_number
    : alert.instrument ?? alert.instrument_id ?? alert.fdr_number;

  if (demoOff) return <div className="mx-auto max-w-5xl"><Card><EmptyState title="Demo mode is off" description="The demo clock controls are available only when the backend is running in DEMO_MODE." /></Card></div>;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-700">System administration</p><h1 className="mt-1 text-2xl font-bold text-navy-900">Demo control</h1></div>
    <Card title="Current simulation date" description="Manage the simulated clock and scheduled tick jobs.">
      {clockQuery.isLoading ? <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div> : clockQuery.isError ? <EmptyState title="Clock unavailable" description="Check the error toast for the API error code." action={<Button variant="secondary" onClick={() => void clockQuery.refetch()}>Retry</Button>} /> :
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Simulated date / time</p><p className="mt-1 font-semibold text-slate-800">{simulated ? formatDate(simulated) : '—'}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Real date</p><p className="mt-1 font-semibold text-slate-800">{real ? formatDate(real) : '—'}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Offset days</p><p className="mt-1 font-semibold text-slate-800">{clock?.offset_days ?? '—'}</p></div>
        </div>}
      <div className="mt-5 flex flex-wrap items-end gap-2">
        {[1, 7, 30, 90].map((count) => <Button key={count} variant="secondary" disabled={clockQuery.isError} loading={advance.isPending && advance.variables === count} onClick={() => advance.mutate(count)}>+{count} day{count > 1 ? 's' : ''}</Button>)}
        <div className="flex items-end gap-2"><FormField label="Custom days" type="number" min={1} step={1} value={days} onChange={(event) => setDays(event.target.value)} className="w-28"/><Button disabled={clockQuery.isError || !Number.isInteger(Number(days)) || Number(days) < 1} loading={advance.isPending} onClick={() => advance.mutate(Number(days))}>Apply</Button></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="danger" disabled={clockQuery.isError} onClick={() => setConfirmReset(true)}>Reset clock</Button><Button variant="outline" disabled={clockQuery.isError} loading={tick.isPending} onClick={() => tick.mutate()}>Run tick now</Button></div>
    </Card>
    {result && <Card title="Latest job results"><div className="grid gap-3 sm:grid-cols-2">{resultLines(result).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><p className="text-xs capitalize text-slate-500">{key}</p><p className="mt-1 break-words text-sm font-medium text-slate-800">{value}</p></div>)}</div></Card>}
    <Card title="Last fired alerts" description="Latest 10 alerts returned by the API.">
      {alertsQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-10"/><Skeleton className="h-10"/></div> : alertsQuery.isError ? <EmptyState title="Alerts unavailable" description="Check the error toast for the API error code." action={<Button variant="secondary" onClick={() => void alertsQuery.refetch()}>Retry</Button>}/> : alerts.length === 0 ? <EmptyState title="No alerts yet" description="Alerts will appear here after a tick fires them."/> :
        <DataTable rows={alerts} rowKey={(alert) => String(alert.id ?? `${alert.created_at}-${alert.type}`)} columns={[
          { key: 'type', header: 'Type', render: (alert) => alert.type ?? '—' },
          { key: 'severity', header: 'Severity', render: (alert) => alert.severity ?? '—' },
          { key: 'instrument', header: 'Instrument', render: (alert) => display(alertInstrument(alert)) },
          { key: 'created', header: 'Created time', render: (alert) => alert.created_at ? formatDate(alert.created_at) : '—' },
        ]}/>
      }
    </Card>
    <Modal open={confirmReset} title="Reset demo clock?" description="This returns simulated time to the configured starting point." onClose={() => setConfirmReset(false)} footer={<><Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" loading={reset.isPending} onClick={() => reset.mutate()}>Reset clock</Button></>}>
      <p className="text-sm text-slate-600">The clock banner will refresh as soon as the reset completes.</p>
    </Modal>
  </div>;
}
