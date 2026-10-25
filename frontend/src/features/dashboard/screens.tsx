import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Download, RefreshCw, ShieldCheck, Timer, TrendingUp } from 'lucide-react';
import { api, apiRequest, ApiError } from '../../api/client';
import { formatDate, formatINR } from '../../api/format';
import { Badge, Button, Card, EmptyState, Skeleton, StatCard } from '../../ui';
import { useAuth } from '../../shell/auth';
import { useToasts } from '../../ui/Toast';

type Json = Record<string, unknown>;
type Breakdown = { key: string; count: number; total_paise: number };
type Summary = {
  total_value_paise: number;
  active_value_paise: number;
  total_instruments: number;
  active_instruments: number;
  record_accuracy_pct: number;
  verification_tat_days: number;
  verification_tat_p90_days?: number;
  renewals_on_time_pct: number;
  pending_aging_buckets: Record<string, number>;
  automated_actions_count: number;
  open_discrepancies: number;
  discrepancies_by_code?: Record<string, number>;
  as_of: string;
};
type QueueCase = { id: string; score: number; priority: number; state: string };

const fixtureSummary: Summary = {
  total_value_paise: 1465000000,
  active_value_paise: 925000000,
  total_instruments: 24,
  active_instruments: 16,
  record_accuracy_pct: 66.7,
  verification_tat_days: 3.2,
  verification_tat_p90_days: 6.1,
  renewals_on_time_pct: 91.4,
  pending_aging_buckets: { '0_7_days': 8, '8_14_days': 4, '15_30_days': 3, '30_plus_days': 2 },
  automated_actions_count: 184,
  open_discrepancies: 7,
  discrepancies_by_code: { 'D-11': 3, 'D-07': 2, 'D-14': 2 },
  as_of: '2026-10-24T10:15:00Z',
};

function record(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : {};
}

function rows(value: unknown): Breakdown[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value as Breakdown[];
  const data = record(value);
  if (Array.isArray(data.items)) return data.items as Breakdown[];
  throw new Error('The KPI breakdown API returned an unexpected list response.');
}

function items(value: unknown): QueueCase[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value as QueueCase[];
  const data = record(value);
  if (Array.isArray(data.items)) return data.items as QueueCase[];
  throw new Error('The officer queue API returned an unexpected list response.');
}

function BarList({ title, description, entries, valueLabel }: {
  title: string;
  description?: string;
  entries: { label: string; value: number; detail?: string }[];
  valueLabel?: (value: number) => string;
}) {
  const maximum = Math.max(1, ...entries.map((item) => item.value));
  return (
    <Card title={title} description={description}>
      {entries.length === 0 ? <EmptyState title="No data to chart" description="This chart appears when matching records are available." /> : <div className="space-y-4">{entries.map((item) => <div key={item.label}>
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-slate-700">{item.label}</span><span className="shrink-0 font-semibold text-slate-800">{valueLabel ? valueLabel(item.value) : item.value}{item.detail ? <span className="ml-2 font-normal text-slate-500">{item.detail}</span> : null}</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${item.label}: ${item.value}`}><div className="h-full rounded-full bg-navy-700 transition-[width]" style={{ width: `${Math.max(2, item.value / maximum * 100)}%` }} /></div>
      </div>)}</div>}
    </Card>
  );
}

function FixtureDashboard() {
  const [bankFilter, setBankFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const { pushToast } = useToasts();
  const filteredState = [
    { key: 'ACTIVE', count: 16, total_paise: 925000000 },
    { key: 'BANK_PENDING', count: 3, total_paise: 110000000 },
    { key: 'DISCREPANCY', count: 2, total_paise: 72000000 },
    { key: 'RENEWAL_DUE', count: 3, total_paise: 158000000 },
  ].filter((row) => stateFilter === 'ALL' || row.key === stateFilter);
  const bankData = [
    { key: 'Bharat Reserve Bank', count: 10, total_paise: 620000000 },
    { key: 'Hindustan Commercial Bank', count: 8, total_paise: 540000000 },
    { key: 'Sarvodaya Co-op Bank', count: 6, total_paise: 305000000 },
  ].filter((row) => bankFilter === 'ALL' || row.key === bankFilter);
  const bucketEntries = Object.entries(fixtureSummary.pending_aging_buckets).map(([key, value]) => ({ label: key.replaceAll('_', ' '), value }));
  const maturityEntries = [['0-30 days', 4], ['31-90 days', 6], ['91-180 days', 5], ['181-365 days', 3], ['>365 days', 2]].map(([label, value]) => ({ label: String(label), value: Number(value) }));
  const riskEntries = [{ label: '0-19', value: 3 }, { label: '20-39', value: 5 }, { label: '40-59', value: 7 }, { label: '60-79', value: 6 }, { label: '80-100', value: 3 }];
  const discrepancyEntries = Object.entries(fixtureSummary.discrepancies_by_code ?? {}).map(([label, value]) => ({ label, value }));
  return (
    <div className="space-y-5">
      <div className="page-heading"><div><span className="eyebrow">LEADERSHIP · FIXTURE PREVIEW</span><h1>Portfolio Dashboard</h1><p>Portfolio health, verification performance and upcoming maturity windows.</p></div><Badge tone="warning">Illustrative fixture values</Badge></div>
      <div className="flex flex-wrap gap-3"><label className="field-label">Bank<select className="input-control mt-1.5" value={bankFilter} onChange={(event) => setBankFilter(event.target.value)}><option value="ALL">All banks</option>{['Bharat Reserve Bank', 'Hindustan Commercial Bank', 'Sarvodaya Co-op Bank'].map((bank) => <option key={bank}>{bank}</option>)}</select></label><label className="field-label">State<select className="input-control mt-1.5" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="ALL">All states</option>{['ACTIVE', 'BANK_PENDING', 'DISCREPANCY', 'RENEWAL_DUE'].map((state) => <option key={state}>{state}</option>)}</select></label><Button className="self-end" variant="outline" leftIcon={<RefreshCw size={14} />} onClick={() => pushToast({ title: 'Fixture preview refreshed', tone: 'info' })}>Refresh</Button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Portfolio value" value={formatINR(fixtureSummary.total_value_paise)} icon={<TrendingUp size={18} />} /><StatCard label="Active value" value={formatINR(fixtureSummary.active_value_paise)} trend={`${fixtureSummary.active_instruments} active instruments`} tone="success" /><StatCard label="Record accuracy" value={`${fixtureSummary.record_accuracy_pct}%`} icon={<ShieldCheck size={18} />} /><StatCard label="Median verification TAT" value={`${fixtureSummary.verification_tat_days} days`} icon={<Timer size={18} />} /></div>
      <div className="grid gap-5 xl:grid-cols-2"><BarList title="Instrument state" entries={filteredState.map((row) => ({ label: row.key.replaceAll('_', ' '), value: row.count, detail: formatINR(row.total_paise) }))} /><BarList title="Portfolio by bank" entries={bankData.map((row) => ({ label: row.key, value: row.count, detail: formatINR(row.total_paise) }))} /><BarList title="Maturity ladder" entries={maturityEntries} /><BarList title="Risk score distribution" entries={riskEntries} /><BarList title="Pending case aging" entries={bucketEntries} /><BarList title="Open discrepancies by code" entries={discrepancyEntries} /></div>
    </div>
  );
}

export function LeadershipDashboard() {
  const { authBypassed } = useAuth();
  if (authBypassed) return <FixtureDashboard />;
  return <LiveDashboard />;
}

function LiveDashboard() {
  const { pushToast } = useToasts();
  const [bankFilter, setBankFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const summaryQuery = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => api.get<Summary>('/kpi/summary'), refetchInterval: 5000 });
  const stateQuery = useQuery({ queryKey: ['dashboard', 'state'], queryFn: async () => rows(await api.get<unknown>('/kpi/breakdown?by=state')), refetchInterval: 5000 });
  const bankQuery = useQuery({ queryKey: ['dashboard', 'bank'], queryFn: async () => rows(await api.get<unknown>('/kpi/breakdown?by=bank')), refetchInterval: 5000 });
  const maturityQuery = useQuery({ queryKey: ['dashboard', 'maturity'], queryFn: () => api.get<unknown>('/kpi/maturity-ladder'), refetchInterval: 5000 });
  const queueQuery = useQuery({ queryKey: ['dashboard', 'risk-queue'], queryFn: async () => items(await api.get<unknown>('/queue')), refetchInterval: 5000 });
  const summary = summaryQuery.data;
  const stateRows = rows(stateQuery.data).filter((item) => stateFilter === 'ALL' || item.key === stateFilter);
  const bankRows = rows(bankQuery.data).filter((item) => bankFilter === 'ALL' || item.key === bankFilter);
  const maturityWindows = record(record(maturityQuery.data).windows);
  const maturityRows = Object.entries(maturityWindows).map(([key, value]) => ({ label: key.replaceAll('_', ' '), value: Number(value) || 0 }));
  const agingRows = Object.entries(summary?.pending_aging_buckets ?? {}).map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }));
  const discrepancies = Object.entries(summary?.discrepancies_by_code ?? {}).map(([label, value]) => ({ label, value }));
  const riskRows = useMemo(() => {
    const bins = new Map([['0-19', 0], ['20-39', 0], ['40-59', 0], ['60-79', 0], ['80-100', 0]]);
    items(queueQuery.data).forEach((item) => {
      const score = Math.max(0, Math.min(100, item.score));
      const key = score < 20 ? '0-19' : score < 40 ? '20-39' : score < 60 ? '40-59' : score < 80 ? '60-79' : '80-100';
      bins.set(key, (bins.get(key) ?? 0) + 1);
    });
    return Array.from(bins, ([label, value]) => ({ label, value }));
  }, [queueQuery.data]);
  const isLoading = summaryQuery.isLoading || stateQuery.isLoading || bankQuery.isLoading || maturityQuery.isLoading || queueQuery.isLoading;
  const error = summaryQuery.error ?? stateQuery.error ?? bankQuery.error ?? maturityQuery.error ?? queueQuery.error;
  const retryAll = () => void Promise.all([summaryQuery.refetch(), stateQuery.refetch(), bankQuery.refetch(), maturityQuery.refetch(), queueQuery.refetch()]);

  const exportCsv = async () => {
    try {
      const csv = await apiRequest<string>('/reports/export.csv');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'sakshya_instruments_export.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      pushToast({ title: cause instanceof Error ? cause.message : 'CSV export failed', tone: 'error', code: cause instanceof ApiError ? cause.code : undefined });
    }
  };

  const stateOptions = rows(stateQuery.data);
  const bankOptions = rows(bankQuery.data);
  return (
    <div className="space-y-5">
      <div className="page-heading"><div><span className="eyebrow">LEADERSHIP · LIVE DATA</span><h1>Portfolio Dashboard</h1><p>KPIs refresh every 5 seconds; run a demo tick and watch the portfolio update.</p></div><div className="flex gap-2"><Button variant="outline" leftIcon={<RefreshCw size={14} />} onClick={retryAll}>Refresh now</Button><Button leftIcon={<Download size={14} />} onClick={() => void exportCsv()}>Export CSV</Button></div></div>
      <div className="flex flex-wrap gap-3"><label className="field-label">Bank<select className="input-control mt-1.5" value={bankFilter} onChange={(event) => setBankFilter(event.target.value)}><option value="ALL">All banks</option>{bankOptions.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}</select></label><label className="field-label">State<select className="input-control mt-1.5" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="ALL">All states</option>{stateOptions.map((item) => <option key={item.key}>{item.key}</option>)}</select></label><Badge tone="neutral"><span className="inline-flex items-center gap-1"><Activity size={13} /> As of {formatDate(summary?.as_of)}</span></Badge></div>
      {isLoading && <Card><Skeleton className="h-24 w-full" /><Skeleton className="mt-3 h-64 w-full" /></Card>}
      {error && <Card className="border-red-200 bg-red-50"><div role="alert" className="flex items-center gap-2 text-sm text-red-800"><AlertTriangle size={16} />{error instanceof Error ? error.message : 'Dashboard data could not be loaded.'}</div><Button className="mt-3" size="sm" variant="outline" onClick={retryAll}>Retry</Button></Card>}
      {summary && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Portfolio value" value={formatINR(summary.total_value_paise)} icon={<TrendingUp size={18} />} trend={`${summary.total_instruments} instruments`} />
          <StatCard label="Active value" value={formatINR(summary.active_value_paise)} icon={<ShieldCheck size={18} />} trend={`${summary.active_instruments} active`} tone="success" />
          <StatCard label="Record accuracy" value={`${summary.record_accuracy_pct}%`} trend="Critical fields confirmed at L2" tone={summary.record_accuracy_pct >= 80 ? 'success' : 'warning'} />
          <StatCard label="Verification TAT" value={`${summary.verification_tat_days} days`} icon={<Timer size={18} />} trend={`p90 ${summary.verification_tat_p90_days ?? 0} days`} />
          <StatCard label="On-time renewals" value={`${summary.renewals_on_time_pct}%`} tone={summary.renewals_on_time_pct >= 80 ? 'success' : 'warning'} />
          <StatCard label="Automated actions" value={String(summary.automated_actions_count)} icon={<Activity size={18} />} />
          <StatCard label="Open discrepancies" value={String(summary.open_discrepancies)} icon={<AlertTriangle size={18} />} tone={summary.open_discrepancies ? 'warning' : 'success'} />
          <StatCard label="Queue cases" value={String(items(queueQuery.data).length)} trend="Live actionable cases" />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <BarList title="Instrument state" entries={stateRows.map((item) => ({ label: item.key.replaceAll('_', ' '), value: item.count, detail: formatINR(item.total_paise) }))} />
          <BarList title="Portfolio by bank" entries={bankRows.map((item) => ({ label: item.key, value: item.count, detail: formatINR(item.total_paise) }))} />
          <BarList title="Maturity ladder" entries={maturityRows} />
          <BarList title="Risk score distribution" description="Calculated from the live officer queue." entries={riskRows} />
          <BarList title="Pending case aging" entries={agingRows} />
          <BarList title="Open discrepancies by code" entries={discrepancies} />
        </div>
      </>}
      {!isLoading && !error && !summary && <Card><EmptyState title="No dashboard metrics" description="The API returned no summary data." /></Card>}
    </div>
  );
}
