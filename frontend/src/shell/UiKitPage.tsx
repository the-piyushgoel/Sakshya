import { useState } from 'react';
import { Check, ChevronRight, Info, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  FileDrop,
  FormField,
  Modal,
  Skeleton,
  StatCard,
  StatusPill,
  StepUpModal,
  Tabs,
  Timeline,
  TrustBadge,
  useToasts,
} from '../ui';
import { formatDate, formatINR } from '../api/format';

interface DemoRow {
  id: string;
  fdr: string;
  amount: string;
  state: string;
  trust: 'L0_CLAIMED' | 'L1_ATTESTED' | 'L2_BANK_CONFIRMED';
}

const rows: DemoRow[] = [
  { id: '01', fdr: 'BRB/2026/004521', amount: formatINR(450000000), state: 'ACTIVE', trust: 'L2_BANK_CONFIRMED' },
  { id: '02', fdr: 'HCB/2026/001908', amount: formatINR(125000000), state: 'BANK_PENDING', trust: 'L1_ATTESTED' },
  { id: '03', fdr: 'SCB/2026/000774', amount: formatINR(80000000), state: 'RENEWAL_DUE', trust: 'L0_CLAIMED' },
];

const timelineEvents = [
  { title: 'Document submitted', description: 'FDR details claimed by institute signatory', date: '24 Oct 2026 · 10:15', tone: 'neutral' as const },
  { title: 'Bank confirmation requested', description: 'Routed to the registered nodal contact', date: '24 Oct 2026 · 11:02', tone: 'warning' as const },
  { title: 'Bank confirmed', description: 'Maker-checker verified critical fields', date: '24 Oct 2026 · 13:45', tone: 'success' as const },
];

export function UiKitPage() {
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpMessage, setStepUpMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const { pushToast } = useToasts();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="page-heading">
        <div>
          <div className="eyebrow">FOUNDATION · PA-1</div>
          <h1>Interface toolkit</h1>
          <p>Accessible, reusable building blocks for Sakshya workspaces.</p>
        </div>
        <Badge tone="info" icon={<ShieldCheck size={13} />}>Design system v1</Badge>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total secured value" value={formatINR(655000000)} trend="Illustrative demo data" icon={<ShieldCheck size={18} />} />
        <StatCard label="Active instruments" value="24" trend="Across 12 institutes" />
        <StatCard label="Awaiting bank" value="05" trend="2 need attention" tone="warning" />
        <StatCard label="Record accuracy" value="92.4%" trend="Bank-confirmed critical fields" tone="success" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card title="Buttons & feedback" description="Primary actions, status labels and inline feedback">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => pushToast({ title: 'Action complete', description: 'This is a success toast.', tone: 'success' })}>Primary action</Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
            <Button variant="outline" onClick={() => setStepUpOpen(true)}>Step-up action</Button>
            <Button variant="ghost">Quiet action</Button>
            <Button variant="danger">Reject</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {['ACTIVE', 'SUBMITTED', 'BANK_PENDING', 'DISCREPANCY', 'RENEWAL_DUE', 'LAPSED', 'CLOSED'].map((state) => <StatusPill key={state} value={state} />)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="success">Verified</Badge><Badge tone="warning">Needs review</Badge><Badge tone="danger">High risk</Badge><Badge tone="info">Information</Badge><Badge tone="neutral">Draft</Badge>
          </div>
        </Card>
        <Card title="Field trust" description="Trust is tracked for each individual instrument field">
          <div className="space-y-3">
            <TrustBadge trust="L0_CLAIMED" source="Institute upload" evidenceRef="doc/8f3a" setAt="24 Oct 2026" />
            <TrustBadge trust="L1_ATTESTED" source="Officer review" evidenceRef="case/184" setAt="24 Oct 2026" />
            <TrustBadge trust="L2_BANK_CONFIRMED" source="BRB maker + checker" evidenceRef="bank/392" setAt="24 Oct 2026" />
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><Info size={16} className="mr-2 inline text-navy-600" />Each badge explains the evidence source and who verified the value.</div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Records table" description="Compact table layout with readable status and trust">
          <DataTable<DemoRow>
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'fdr', header: 'FDR number', render: (row) => <span className="font-semibold text-navy-800">{row.fdr}</span> },
              { key: 'amount', header: 'Principal', render: (row) => row.amount },
              { key: 'status', header: 'Status', render: (row) => <StatusPill value={row.state} /> },
              { key: 'trust', header: 'Trust', render: (row) => <TrustBadge trust={row.trust} compact /> },
            ]}
          />
        </Card>
        <Card title="Navigation & tabs" description="Tab panels preserve clear focus and state">
          <Tabs
            tabs={[
              { id: 'summary', label: 'Summary', content: <p className="py-4 text-sm leading-6 text-slate-600">Instrument fields, obligation coverage and next steps stay together in a clear case summary.</p> },
              { id: 'checks', label: 'Checks', content: <p className="py-4 text-sm leading-6 text-slate-600">Document checks return explainable flags; they never approve or reject a deposit by themselves.</p> },
              { id: 'activity', label: 'Activity', content: <p className="py-4 text-sm leading-6 text-slate-600">State changes are time-stamped and attached to the auditable activity timeline.</p> },
            ]}
          />
          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
            <span className="text-slate-600">View audit details</span><button className="inline-flex items-center gap-1 font-semibold text-navy-700">Open <ChevronRight size={15} /></button>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Timeline & loading" description="Audit-friendly event presentation and content placeholders">
          <Timeline events={timelineEvents} />
          <div className="mt-6 space-y-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-10" /><Skeleton className="h-10 w-5/6" /></div>
        </Card>
        <Card title="Forms & uploads" description="Clear labels, helpful validation and file constraints">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="FDR number" name="fdrNumber" placeholder="Enter FDR number" hint="As printed on the bank receipt" />
            <FormField label="Principal amount" name="principal" type="number" placeholder="Amount in paise" error="Amount must be a positive value." />
          </div>
          <div className="mt-4">
            <FileDrop accept=".pdf,application/pdf" maxSizeMB={15} fileName={fileName} onFile={(file) => setFileName(file.name)} />
          </div>
          {fileName && <p className="mt-2 text-xs text-slate-500">Selected: {fileName}</p>}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Empty & date states" description="Use helpful empty messages instead of blank screens">
          <EmptyState title="No discrepancies" description="There are no open discrepancy flags for this record." icon={<Check size={22} />} action={<Button size="sm" variant="secondary">View cleared flags</Button>} />
          <p className="mt-4 text-xs text-slate-500">Date formatting example: {formatDate('2026-10-24T10:15:00Z')}</p>
        </Card>
        <Card title="Responsive layout" description="The portal shell adapts for a 360px mobile viewport">
          <div className="rounded-xl bg-navy-800 p-5 text-white">
            <div className="flex items-start justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Obligation coverage</span><p className="mt-2 text-2xl font-bold">{formatINR(450000000)}</p><p className="mt-1 text-xs text-slate-300">Confirmed of {formatINR(600000000)} required</p></div><div className="rounded-xl bg-white/10 p-3"><ShieldCheck size={21} /></div></div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full w-3/4 rounded-full bg-emerald-400" /></div>
            <div className="mt-3 flex justify-between text-xs text-slate-300"><span>75% covered</span><span>Illustrative</span></div>
          </div>
        </Card>
      </div>

      <Modal open={modalOpen} title="Reusable dialog" description="Modal shell with a clear close action and keyboard dismissal." onClose={() => setModalOpen(false)} footer={<Button onClick={() => setModalOpen(false)}>Done</Button>}>
        <p className="text-sm leading-6 text-slate-600">Dialogs keep the current task in context and place the primary action in a consistent footer.</p>
      </Modal>
      <StepUpModal open={stepUpOpen} onClose={() => setStepUpOpen(false)} onSubmit={async (pin) => { setStepUpMessage(`Demo PIN submitted (${pin.length} digits). Wire this action to /auth/step-up.`); setStepUpOpen(false); }} />
      {stepUpMessage && <div role="status" className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-navy-900 px-4 py-3 text-sm text-white shadow-lg">{stepUpMessage}</div>}
    </div>
  );
}
