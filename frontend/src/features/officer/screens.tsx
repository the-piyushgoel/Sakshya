import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  Landmark,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  FormField,
  Modal,
  StatusPill,
  StepUpModal,
  Tabs,
  Timeline,
  TrustBadge,
  useToasts,
} from '../../ui';
import { useAuth } from '../../shell/auth';
import { LiveOfficerConsole } from './live';

type TrustLevel = 'L0_CLAIMED' | 'L1_ATTESTED' | 'L2_BANK_CONFIRMED';
type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
type Flag = { code: string; severity: Severity; description: string };

interface QueueCase {
  id: string;
  institute: string;
  fdr: string;
  bank: string;
  bankId: string;
  amount: string;
  state: string;
  severity: Severity;
  owner: string;
  age: number;
  score: number;
  priority: number;
  reasons: { label: string; value: number }[];
  flags: Flag[];
}

interface InstrumentField {
  name: string;
  value: string;
  trust: TrustLevel;
  source: string;
  evidence: string;
  date: string;
}

const fixtureCases: QueueCase[] = [
  {
    id: 'case-aryabhatta-01',
    institute: 'Aryabhatta College of Engineering',
    fdr: 'BRB/2026/004821',
    bank: 'Bharat Reserve Bank',
    bankId: 'BRB',
    amount: '₹45,00,000',
    state: 'DISCREPANCY',
    severity: 'HIGH',
    owner: 'Approving Officer',
    age: 18,
    score: 82,
    priority: 102,
    reasons: [
      { label: 'High-severity document flag', value: 0.92 },
      { label: 'Awaiting review for 18 days', value: 0.72 },
      { label: 'Matures in 12 days', value: 0.58 },
    ],
    flags: [
      { code: 'D-11', severity: 'HIGH', description: 'QR amount does not match the printed amount.' },
      { code: 'D-07', severity: 'MEDIUM', description: 'Favouring name needs officer review.' },
    ],
  },
  {
    id: 'case-takshashila-02',
    institute: 'Takshashila Institute of Management',
    fdr: 'HCB/2025/001104',
    bank: 'Hindustan Commercial Bank',
    bankId: 'HCB',
    amount: '₹32,50,000',
    state: 'RENEWAL_DUE',
    severity: 'MEDIUM',
    owner: 'Scrutiny Officer',
    age: 9,
    score: 64,
    priority: 74,
    reasons: [
      { label: 'Maturity window is approaching', value: 0.86 },
      { label: 'Bank confirmation is becoming stale', value: 0.48 },
      { label: 'Awaiting review for 9 days', value: 0.36 },
    ],
    flags: [{ code: 'D-14', severity: 'MEDIUM', description: 'A lien detail needs confirmation.' }],
  },
  {
    id: 'case-vidya-jyoti-03',
    institute: 'Vidya Jyoti Institute of Technology',
    fdr: 'SCB/2024/007612',
    bank: 'Sarvodaya Co-op Bank',
    bankId: 'SCB',
    amount: '₹27,00,000',
    state: 'BANK_PENDING',
    severity: 'LOW',
    owner: 'Scrutiny Officer',
    age: 4,
    score: 38,
    priority: 48,
    reasons: [
      { label: 'Bank response is pending', value: 0.52 },
      { label: 'Amount is above the portfolio median', value: 0.35 },
      { label: 'Confirmation remains within SLA', value: 0.18 },
    ],
    flags: [],
  },
];

const bankContactFixture: Record<string, { name: string; email: string; phone: string }> = {
  BRB: { name: 'BRB Nodal Desk', email: 'nodal.brbank@example.test', phone: '+91 80000 12345' },
  HCB: { name: 'HCB Verification Cell', email: 'verification.hcb@example.test', phone: '+91 80000 23456' },
  SCB: { name: 'SCB Nodal Office', email: 'nodal.scb@example.test', phone: '+91 80000 34567' },
};

const fieldFixture: InstrumentField[] = [
  { name: 'FDR number', value: 'BRB/2026/004821', trust: 'L0_CLAIMED', source: 'Institute upload', evidence: 'document-001.pdf', date: '24 Oct 2026' },
  { name: 'Principal amount', value: '₹45,00,000', trust: 'L0_CLAIMED', source: 'Institute upload', evidence: 'page 1 · printed field', date: '24 Oct 2026' },
  { name: 'Issue date', value: '14 Oct 2026', trust: 'L0_CLAIMED', source: 'Institute upload', evidence: 'page 1 · printed field', date: '24 Oct 2026' },
  { name: 'Maturity date', value: '05 Nov 2026', trust: 'L0_CLAIMED', source: 'Institute upload', evidence: 'page 1 · printed field', date: '24 Oct 2026' },
  { name: 'Favouring', value: 'Member Secretary, AICTE', trust: 'L1_ATTESTED', source: 'Document checks', evidence: 'QR + text comparison', date: '24 Oct 2026' },
  { name: 'Lien marked', value: 'Pending bank confirmation', trust: 'L0_CLAIMED', source: 'Institute upload', evidence: 'document-001.pdf', date: '24 Oct 2026' },
];

const documentChecks = [
  { label: 'PDF structure and metadata', status: 'PASS', detail: 'No incremental-save marker detected.' },
  { label: 'QR payload and printed amount', status: 'FLAG', detail: 'D-11 · QR amount differs from the printed amount.' },
  { label: 'Favouring name consistency', status: 'FLAG', detail: 'D-07 · Review the beneficiary wording.' },
  { label: 'Required fields extracted', status: 'PASS', detail: '8 fields extracted from text and QR.' },
];

function FixtureNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <CircleHelp size={18} className="mt-0.5 shrink-0 text-amber-700" />
      <p><strong>Fixture preview.</strong> The queue and actions use sample data and do not change backend records.</p>
    </div>
  );
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><span className="eyebrow">OFFICER WORKSPACE · FIXTURE DATA</span><h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  );
}

export function OfficerFixtureConsole() {
  const { user } = useAuth();
  const { pushToast } = useToasts();
  const [selectedId, setSelectedId] = useState(fixtureCases[0]?.id ?? '');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [bankFilter, setBankFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [whyOpen, setWhyOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionState, setActionState] = useState('In review');
  const [quarantined, setQuarantined] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const visibleCases = useMemo(
    () => fixtureCases.filter((item) =>
      (stateFilter === 'ALL' || item.state === stateFilter)
      && (bankFilter === 'ALL' || item.bankId === bankFilter)
      && (severityFilter === 'ALL' || item.severity === severityFilter)),
    [bankFilter, severityFilter, stateFilter],
  );
  const selectedCase = visibleCases.find((item) => item.id === selectedId) ?? visibleCases[0];
  const isApprover = user?.roles.includes('APPROVING_OFFICER') ?? false;
  const canRequestBank = user?.roles.some((role) => role === 'SCRUTINY_OFFICER' || role === 'APPROVING_OFFICER') ?? false;
  const canQuarantine = user?.roles.some((role) => role === 'APPROVING_OFFICER' || role === 'COMPLIANCE_OFFICER') ?? false;
  const selectedContact = selectedCase ? bankContactFixture[selectedCase.bankId] : undefined;

  const showFixtureAction = (title: string) => pushToast({
    title,
    description: 'Fixture preview only — no backend record was changed.',
    tone: 'info',
  });

  const submitBankRequest = () => {
    setRequestModalOpen(false);
    setActionState('Confirmation requested · directory-routed fixture');
    showFixtureAction('Bank confirmation request previewed');
  };

  const confirmResolution = () => {
    if (!resolutionNote.trim()) return;
    setResolveModalOpen(false);
    showFixtureAction('Discrepancy resolution previewed');
    setResolutionNote('');
  };

  const fields = fieldFixture.map((field) => ({
    ...field,
    trust: confirmed && ['Principal amount', 'Maturity date', 'Favouring', 'Lien marked'].includes(field.name)
      ? 'L2_BANK_CONFIRMED' as const
      : field.trust,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Officer Console"
        description="Review instrument risk, evidence, bank confirmation and discrepancy history."
        action={<Badge tone="info"><span className="inline-flex items-center gap-1"><Building2 size={13} /> 3 cases in queue</span></Badge>}
      />
      <FixtureNotice />

      <Card title="Priority queue" description="Sorted by fixture priority. Select a case to inspect its evidence and next actions.">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <label className="field-label">State
            <select className="input-control mt-1.5" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
              <option value="ALL">All states</option><option value="DISCREPANCY">Discrepancy</option><option value="RENEWAL_DUE">Renewal due</option><option value="BANK_PENDING">Bank pending</option>
            </select>
          </label>
          <label className="field-label">Bank
            <select className="input-control mt-1.5" value={bankFilter} onChange={(event) => setBankFilter(event.target.value)}>
              <option value="ALL">All banks</option><option value="BRB">Bharat Reserve Bank</option><option value="HCB">Hindustan Commercial Bank</option><option value="SCB">Sarvodaya Co-op Bank</option>
            </select>
          </label>
          <label className="field-label">Severity
            <select className="input-control mt-1.5" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="ALL">All severities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
            </select>
          </label>
        </div>
        <DataTable
          rows={visibleCases}
          rowKey={(item) => item.id}
          emptyMessage="No fixture cases match these filters."
          columns={[
            { key: 'institute', header: 'Institute / FDR', render: (item) => <button type="button" className="text-left font-semibold text-navy-800 hover:underline" onClick={() => { setSelectedId(item.id); setWhyOpen(false); }}>{item.institute}<span className="mt-1 block font-mono text-xs font-normal text-slate-500">{item.fdr}</span></button> },
            { key: 'bank', header: 'Bank', render: (item) => <span>{item.bank}<span className="mt-1 block text-xs text-slate-500">{item.amount}</span></span> },
            { key: 'state', header: 'State / Flag', render: (item) => <span className="flex flex-col items-start gap-1"><StatusPill value={item.state} /><Badge tone={item.severity === 'HIGH' ? 'danger' : item.severity === 'MEDIUM' ? 'warning' : 'neutral'}>{item.severity} risk</Badge></span> },
            { key: 'priority', header: 'Priority', render: (item) => <span className="font-bold text-navy-900">{item.priority}<span className="ml-1 text-xs font-normal text-slate-500">/ 120</span></span> },
            { key: 'age', header: 'Age', render: (item) => `${item.age} days` },
            { key: 'owner', header: 'Owner', render: (item) => item.owner },
            { key: 'open', header: '', render: (item) => <Button variant="ghost" size="sm" rightIcon={<ChevronRight size={15} />} onClick={() => { setSelectedId(item.id); setWhyOpen(false); }}>Review</Button> },
          ]}
        />
      </Card>

      {selectedCase ? (
        <Card
          title="Case workspace"
          description={`${selectedCase.institute} · ${selectedCase.fdr}`}
          action={<div className="flex flex-wrap items-center gap-2"><StatusPill value={selectedCase.state} /><Badge tone={selectedCase.severity === 'HIGH' ? 'danger' : selectedCase.severity === 'MEDIUM' ? 'warning' : 'neutral'}>{selectedCase.severity} severity</Badge></div>}
        >
          <div className="mb-5 grid gap-4 rounded-xl bg-navy-50/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-white p-2 text-amber-700"><ShieldAlert size={19} /></span>
              <div><p className="text-sm font-semibold text-navy-900">Why this case is first</p><p className="mt-1 text-sm text-slate-600">Risk score {selectedCase.score} · queue priority {selectedCase.priority} · {selectedCase.age} days in review.</p></div>
            </div>
            <Button variant="outline" size="sm" aria-expanded={whyOpen} onClick={() => setWhyOpen((value) => !value)} rightIcon={<ArrowUpRight size={14} />}>{whyOpen ? 'Hide factors' : 'Show risk factors'}</Button>
            {whyOpen && (
              <div className="space-y-3 border-t border-navy-100 pt-4 sm:col-span-2">
                {selectedCase.reasons.map((reason) => <div key={reason.label}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-slate-700">{reason.label}</span><strong>{Math.round(reason.value * 100)}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-amber-500" style={{ width: `${reason.value * 100}%` }} /></div></div>)}
              </div>
            )}
          </div>

          {(quarantined || actionState !== 'In review' || confirmed) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {quarantined && <Badge tone="danger">Quarantine preview active</Badge>}
              {confirmed && <Badge tone="success">Bank-confirmed fields previewed</Badge>}
              {actionState !== 'In review' && <Badge tone="info">{actionState}</Badge>}
            </div>
          )}

          <Tabs tabs={[
            {
              id: 'overview',
              label: 'Overview',
              content: <div className="space-y-4 pt-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Principal</p><p className="mt-1 font-semibold text-slate-900">{selectedCase.amount}</p></div>
                  <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Bank</p><p className="mt-1 font-semibold text-slate-900">{selectedCase.bank}</p></div>
                  <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Assigned owner</p><p className="mt-1 font-semibold text-slate-900">{selectedCase.owner}</p></div>
                </div>
                <DataTable
                  rows={fields}
                  rowKey={(item) => item.name}
                  columns={[
                    { key: 'field', header: 'Instrument field', render: (item) => <strong>{item.name}</strong> },
                    { key: 'value', header: 'Value', render: (item) => item.value },
                    { key: 'trust', header: 'Trust', render: (item) => <TrustBadge trust={item.trust} source={item.source} evidenceRef={item.evidence} setAt={item.date} /> },
                    { key: 'source', header: 'Evidence source', render: (item) => <span className="text-xs text-slate-600">{item.source}<span className="mt-1 block">{item.evidence}</span></span> },
                  ]}
                />
              </div>,
            },
            {
              id: 'documents',
              label: 'Documents & checks',
              content: <div className="space-y-3 pt-5">
                <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><FileCheck2 size={18} className="text-navy-700" /><div><p className="font-semibold text-slate-800">document-001.pdf</p><p className="text-xs text-slate-500">Uploaded 24 Oct 2026 · PDF preview fixture</p></div><Button className="ml-auto" variant="outline" size="sm" onClick={() => showFixtureAction('Document preview opened')}>Open preview</Button></div>
                {documentChecks.map((check) => <div key={check.label} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3"><div><p className="text-sm font-medium text-slate-800">{check.label}</p><p className="mt-1 text-xs text-slate-500">{check.detail}</p></div><Badge tone={check.status === 'PASS' ? 'success' : 'danger'}>{check.status}</Badge></div>)}
              </div>,
            },
            {
              id: 'bank',
              label: 'Bank confirmation',
              content: <div className="grid gap-5 pt-5 lg:grid-cols-[1fr_1fr]">
                <div><h3 className="mb-3 text-sm font-semibold text-slate-800">Request timeline</h3><Timeline events={[
                  { title: 'Request created', description: 'Routed to the bank directory contact.', date: '24 Oct 2026', tone: 'success' },
                  { title: 'Awaiting bank response', description: actionState, date: 'Today', tone: 'warning' },
                  ]} />
                  {!confirmed && <Button variant="outline" size="sm" onClick={() => { setConfirmed(true); setActionState('Bank confirmation received · fixture'); showFixtureAction('Bank confirmation received in fixture'); }}>Preview bank confirmation</Button>}
                </div>
                <div className="rounded-xl border border-slate-100 p-4"><h3 className="text-sm font-semibold text-slate-800">Checklist snapshot</h3><div className="mt-3 space-y-2 text-sm">{['FDR exists and is open', 'Holder and principal match', 'Maturity and lien details verified'].map((item, index) => <p key={item} className="flex items-center gap-2 text-slate-600">{index === 0 || confirmed ? <Check size={15} className="text-emerald-600" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}{item}</p>)}</div></div>
              </div>,
            },
            {
              id: 'discrepancies',
              label: 'Discrepancies',
              content: <div className="space-y-3 pt-5">{selectedCase.flags.length === 0 ? <EmptyState title="No open flags" description="This fixture case has no discrepancy flags." /> : selectedCase.flags.map((flag) => <div key={flag.code} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-100 p-4"><div className="flex gap-3"><AlertTriangle size={17} className={flag.severity === 'HIGH' ? 'text-red-600' : 'text-amber-600'} /><div><div className="flex items-center gap-2"><strong className="font-mono text-sm">{flag.code}</strong><Badge tone={flag.severity === 'HIGH' ? 'danger' : 'warning'}>{flag.severity}</Badge></div><p className="mt-1 text-sm text-slate-600">{flag.description}</p><p className="mt-1 text-xs text-slate-400">Status: OPEN · fixture</p></div></div><Button variant="outline" size="sm" onClick={() => setResolveModalOpen(true)}>Resolve</Button></div>)}</div>,
            },
            {
              id: 'timeline',
              label: 'Timeline',
              content: <div className="pt-5"><Timeline events={[
                { title: 'Instrument submitted', description: 'Institute signatory submitted the FDR for scrutiny.', date: '24 Oct 2026 · 09:30', tone: 'success' },
                { title: 'Document checks completed', description: 'Automated review raised D-11 and D-07 for officer review.', date: '24 Oct 2026 · 09:31', tone: 'warning' },
                { title: 'Assigned to officer queue', description: 'Awaiting scrutiny and bank confirmation.', date: '24 Oct 2026 · 09:34', tone: 'neutral' },
              ]} /></div>,
            },
          ]} />

          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            {canRequestBank && <Button leftIcon={<Landmark size={15} />} onClick={() => setRequestModalOpen(true)}>Request bank confirmation</Button>}
            {isApprover
              ? <Button variant="secondary" leftIcon={<UserRoundCheck size={15} />} onClick={() => setStepUpOpen(true)}>Activate · step-up required</Button>
              : <span className="self-center text-xs text-slate-500">Activation action is for Approving Officers.</span>}
            {canQuarantine && <Button variant="outline" onClick={() => { setQuarantined((value) => !value); showFixtureAction(quarantined ? 'Quarantine preview cleared' : 'Quarantine preview applied'); }}>{quarantined ? 'Clear quarantine preview' : 'Quarantine'}</Button>}
            {isApprover && <Button variant="danger" onClick={() => { setActionState('Rejected · local fixture'); showFixtureAction('Reject action previewed'); }}>Reject</Button>}
          </div>
        </Card>
      ) : (
        <Card><EmptyState title="No cases to display" description="Change or clear the queue filters to see fixture cases." /></Card>
      )}

      <Modal
        open={requestModalOpen}
        title="Request bank confirmation"
        description="Confirmation requests are routed using the verified directory contact."
        onClose={() => setRequestModalOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setRequestModalOpen(false)}>Cancel</Button><Button onClick={submitBankRequest}>Preview request</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Bank directory contact</p><p className="mt-2 font-semibold text-emerald-950">{selectedContact?.name ?? 'Verified bank contact'}</p><p className="mt-1 text-sm text-emerald-900">{selectedContact?.email ?? 'Contact not listed'} · {selectedContact?.phone ?? '—'}</p></div>
          <p className="text-sm leading-6 text-slate-600">Contact details printed on the FDR are ignored. The directory contact shown above is read-only for this fixture.</p>
          <FormField label="Reason for confirmation" name="request-reason" defaultValue="Please verify the FDR, holder, principal, maturity and lien details." />
        </div>
      </Modal>

      <Modal
        open={resolveModalOpen}
        title="Resolve discrepancy"
        description="High-severity flags require a resolution note."
        onClose={() => setResolveModalOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setResolveModalOpen(false)}>Cancel</Button><Button disabled={!resolutionNote.trim()} onClick={confirmResolution}>Save fixture resolution</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900"><strong>D-11 · HIGH</strong><p className="mt-1">QR amount does not match the printed amount.</p></div>
          <label className="field-label">Resolution action<select className="input-control mt-1.5"><option>Escalate</option><option>Clear</option><option>Reject</option></select></label>
          <label className="field-label">Officer note<textarea className="input-control mt-1.5 min-h-24" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Add the reason for your decision" /></label>
        </div>
      </Modal>

      <StepUpModal
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        title="Approve instrument activation"
        onSubmit={async () => {
          setStepUpOpen(false);
          setActionState('Activation approved · local fixture');
          showFixtureAction('Step-up accepted in fixture preview');
        }}
      />
    </div>
  );
}

export function OfficerConsolePage() {
  const { authBypassed } = useAuth();
  return authBypassed ? <OfficerFixtureConsole /> : <LiveOfficerConsole />;
}
