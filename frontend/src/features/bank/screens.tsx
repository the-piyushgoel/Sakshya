import { useMemo, useState } from 'react';
import { ArrowRight, Banknote, Check, CircleAlert, ClipboardCheck, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, DataTable, EmptyState, FormField, Modal, StatusPill, useToasts } from '../../ui';
import { useAuth } from '../../shell/auth';
import { BankReleaseLetters, LiveBankConsole } from './live';

type ChecklistAnswer = 'Yes' | 'No';
type Outcome = 'ALL_CLEAR' | 'EXCEPTIONS' | 'NOT_FOUND';
type RequestStatus = 'NOTIFIED' | 'ACKNOWLEDGED' | 'MAKER_SUBMITTED' | 'CONFIRMED' | 'CONFIRMED_WITH_EXCEPTIONS' | 'RETURNED' | 'NOT_FOUND';

interface BankRequestFixture {
  id: string;
  bankId: string;
  bank: string;
  institute: string;
  fdr: string;
  amount: string;
  maturity: string;
  status: RequestStatus;
  outcome: Outcome | null;
  maker: string | null;
  checker: string | null;
}

interface ChecklistItem {
  id: number;
  label: string;
  expected: string;
}

const initialRequests: BankRequestFixture[] = [
  { id: 'brb-request-001', bankId: 'BRB', bank: 'Bharat Reserve Bank', institute: 'Aryabhatta College of Engineering', fdr: 'BRB/2026/004821', amount: '₹45,00,000', maturity: '05 Nov 2026', status: 'ACKNOWLEDGED', outcome: null, maker: null, checker: null },
  { id: 'brb-request-002', bankId: 'BRB', bank: 'Bharat Reserve Bank', institute: 'Vidya Jyoti Institute of Technology', fdr: 'BRB/2024/009117', amount: '₹27,00,000', maturity: '12 Dec 2026', status: 'MAKER_SUBMITTED', outcome: 'EXCEPTIONS', maker: 'brb_mk', checker: null },
  { id: 'hcb-request-003', bankId: 'HCB', bank: 'Hindustan Commercial Bank', institute: 'Takshashila Institute of Management', fdr: 'HCB/2025/001104', amount: '₹32,50,000', maturity: '19 May 2027', status: 'NOTIFIED', outcome: null, maker: null, checker: null },
];

const checklist: ChecklistItem[] = [
  { id: 1, label: 'FDR exists and is open', expected: 'Yes' },
  { id: 2, label: 'Holder name(s) include the Trust', expected: 'Trust name matches bank records' },
  { id: 3, label: 'Principal amount equals submitted value', expected: '₹45,00,000' },
  { id: 4, label: 'Issue date matches submitted value', expected: '14 Oct 2026' },
  { id: 5, label: 'Maturity date and interest rate match', expected: '05 Nov 2026 · 7.10%' },
  { id: 6, label: 'Favouring is an allowed AICTE name', expected: 'Member Secretary, AICTE' },
  { id: 7, label: 'AICTE lien and reference are recorded', expected: 'Lien marked · ref BRB-LN-4108' },
  { id: 8, label: 'No other lien, loan or overdraft exists', expected: 'No competing encumbrance' },
  { id: 9, label: 'Premature closure is blocked without written consent', expected: 'Control enabled' },
  { id: 10, label: 'Auto-renewal flag and tenor are recorded', expected: 'Auto-renew · 12 months' },
  { id: 11, label: 'Accrued interest to date is recorded', expected: '₹18,410' },
  { id: 12, label: 'Maker, checker and remarks are recorded', expected: 'Bank staff details required' },
];

function RequestStatus({ status }: { status: RequestStatus }) {
  const displayState: Record<RequestStatus, string> = {
    NOTIFIED: 'BANK_PENDING',
    ACKNOWLEDGED: 'BANK_PENDING',
    MAKER_SUBMITTED: 'SUBMITTED',
    CONFIRMED: 'CONFIRMED',
    CONFIRMED_WITH_EXCEPTIONS: 'DISCREPANCY',
    RETURNED: 'CHANGES_REQUESTED',
    NOT_FOUND: 'QUARANTINED',
  };
  return <StatusPill value={displayState[status]} />;
}

export function BankFixtureConsole() {
  const { user } = useAuth();
  const { pushToast } = useToasts();
  const [requests, setRequests] = useState(initialRequests);
  const [selectedId, setSelectedId] = useState(initialRequests[0]?.id ?? '');
  const [answers, setAnswers] = useState<Record<number, ChecklistAnswer>>(
    Object.fromEntries(checklist.map((item) => [item.id, 'Yes'])) as Record<number, ChecklistAnswer>,
  );
  const [outcome, setOutcome] = useState<Outcome>('ALL_CLEAR');
  const [remarks, setRemarks] = useState('');
  const [decisionModal, setDecisionModal] = useState<'AUTHORISE' | 'RETURN' | null>(null);

  const isMaker = user?.roles.includes('BANK_MAKER') ?? false;
  const isChecker = user?.roles.includes('BANK_CHECKER') ?? false;
  const currentBankId = user?.bank_id ?? 'BRB';
  const scopedRequests = useMemo(() => requests.filter((request) => request.bankId === currentBankId), [currentBankId, requests]);
  const selectedRequest = scopedRequests.find((request) => request.id === selectedId) ?? scopedRequests[0];
  const hasNoAnswers = Object.values(answers).some((answer) => answer === 'No');

  const updateRequest = (id: string, update: Partial<BankRequestFixture>) => {
    setRequests((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  };

  const submitMakerChecklist = () => {
    if (!selectedRequest) return;
    const finalOutcome = hasNoAnswers && outcome === 'ALL_CLEAR' ? 'EXCEPTIONS' : outcome;
    updateRequest(selectedRequest.id, { status: finalOutcome === 'NOT_FOUND' ? 'NOT_FOUND' : 'MAKER_SUBMITTED', outcome: finalOutcome, maker: user?.username ?? 'brb_mk' });
    pushToast({
      title: 'Maker checklist saved in fixture',
      description: finalOutcome === 'EXCEPTIONS' ? 'A “No” answer is marked as an exception. No backend record was changed.' : 'Fixture preview only — no backend record was changed.',
      tone: finalOutcome === 'EXCEPTIONS' ? 'warning' : 'info',
    });
  };

  const submitCheckerDecision = () => {
    if (!selectedRequest || !decisionModal) return;
    if (selectedRequest.maker === user?.username || isMaker && !isChecker) {
      pushToast({ title: 'Maker and checker must be different users.', description: 'Code: SOD_VIOLATION · Fixture preview', tone: 'error', code: 'SOD_VIOLATION' });
      setDecisionModal(null);
      return;
    }
    const authorise = decisionModal === 'AUTHORISE';
    const nextStatus = authorise
      ? selectedRequest.outcome === 'ALL_CLEAR' ? 'CONFIRMED' : selectedRequest.outcome === 'NOT_FOUND' ? 'NOT_FOUND' : 'CONFIRMED_WITH_EXCEPTIONS'
      : 'RETURNED';
    updateRequest(selectedRequest.id, { status: nextStatus, checker: user?.username ?? 'brb_ck' });
    setDecisionModal(null);
    pushToast({ title: authorise ? 'Checker decision previewed' : 'Request return previewed', description: 'Local fixture state only — no backend record was changed.', tone: 'info' });
  };

  return (
    <div className="space-y-5">
      <div className="page-heading">
        <div><span className="eyebrow">BANK WORKSPACE · FIXTURE DATA</span><h1>Bank Console</h1><p>Verify FDR details through a maker checklist and independent checker decision.</p></div>
        <Badge tone="info"><span className="inline-flex items-center gap-1"><Banknote size={13} /> BRB directory inbox</span></Badge>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-700" /><p><strong>Fixture preview.</strong> Only BRB requests are shown to this demo bank user. Checklist decisions are local and are not sent to the backend.</p></div>

      <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.7fr)]">
        <Card title="Request inbox" description={`${scopedRequests.length} requests scoped to your bank`}>
          <DataTable
            rows={scopedRequests}
            rowKey={(item) => item.id}
            emptyMessage="No confirmation requests are assigned to this bank."
            columns={[
              { key: 'institute', header: 'Institute / FDR', render: (item) => <button type="button" className="text-left font-semibold text-navy-800 hover:underline" onClick={() => setSelectedId(item.id)}>{item.institute}<span className="mt-1 block font-mono text-xs font-normal text-slate-500">{item.fdr}</span></button> },
              { key: 'state', header: 'Status', render: (item) => <RequestStatus status={item.status} /> },
              { key: 'open', header: '', render: (item) => <Button variant="ghost" size="sm" onClick={() => setSelectedId(item.id)}>Open <ArrowRight size={13} /></Button> },
            ]}
          />
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong>Directory-routed request.</strong> Institute-provided contact details do not affect the bank inbox or response route.</div>
        </Card>

        {selectedRequest ? (
          <Card
            title="Request detail"
            description={`Request ${selectedRequest.id} · ${selectedRequest.bank}`}
            action={<RequestStatus status={selectedRequest.status} />}
          >
            <div className="grid gap-3 rounded-xl bg-navy-50/70 p-4 sm:grid-cols-2">
              <div><p className="text-xs text-slate-500">Institute</p><p className="mt-1 font-semibold text-navy-900">{selectedRequest.institute}</p></div>
              <div><p className="text-xs text-slate-500">FDR number</p><p className="mt-1 font-mono font-semibold text-navy-900">{selectedRequest.fdr}</p></div>
              <div><p className="text-xs text-slate-500">Principal amount</p><p className="mt-1 font-semibold text-navy-900">{selectedRequest.amount}</p></div>
              <div><p className="text-xs text-slate-500">Maturity date</p><p className="mt-1 font-semibold text-navy-900">{selectedRequest.maturity}</p></div>
            </div>

            <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-sm font-bold text-navy-900">12-point bank verification checklist</h3><p className="mt-1 text-xs text-slate-500">Record what the bank ledger shows; “No” answers are highlighted as exceptions.</p></div>
              {selectedRequest.maker && <Badge tone="info">Maker: {selectedRequest.maker}</Badge>}
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
              <table className="data-table min-w-[690px]">
                <thead><tr><th># / verification</th><th>Expected / submitted</th><th>Bank result</th></tr></thead>
                <tbody>{checklist.map((item) => {
                  const answer = answers[item.id] ?? 'Yes';
                  return <tr key={item.id} className={answer === 'No' ? 'bg-red-50' : ''}>
                    <td><span className="mr-2 text-xs text-slate-400">{String(item.id).padStart(2, '0')}</span><span className="font-medium">{item.label}</span></td>
                    <td className="text-xs text-slate-500">{item.expected}</td>
                    <td><select aria-label={`${item.id}. ${item.label} result`} disabled={!isMaker || selectedRequest.status === 'CONFIRMED'} className={`input-control min-w-24 py-2 ${answer === 'No' ? 'border-red-300 bg-red-50 text-red-800' : ''}`} value={answer} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value as ChecklistAnswer }))}><option>Yes</option><option>No</option></select></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <fieldset>
                <legend className="field-label">Maker outcome</legend>
                <div className="mt-2 flex flex-wrap gap-2">{(['ALL_CLEAR', 'EXCEPTIONS', 'NOT_FOUND'] as const).map((value) => <label key={value} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${outcome === value ? 'border-navy-500 bg-navy-50 text-navy-900' : 'border-slate-200 bg-white text-slate-600'}`}><input type="radio" name="bank-outcome" value={value} checked={outcome === value} disabled={!isMaker} onChange={() => setOutcome(value)} />{value === 'ALL_CLEAR' ? 'All clear' : value === 'EXCEPTIONS' ? 'Exceptions' : 'Not found'}</label>)}</div>
              </fieldset>
              <FormField label="Maker remarks" name="bank-remarks" value={remarks} disabled={!isMaker} onChange={(event) => setRemarks(event.target.value)} placeholder="Record relevant bank-ledger details" />
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
              {isMaker && <Button leftIcon={<ClipboardCheck size={15} />} onClick={submitMakerChecklist} disabled={selectedRequest.status === 'CONFIRMED'}>Submit maker checklist</Button>}
              {isChecker && <><Button variant="secondary" leftIcon={<ShieldCheck size={15} />} onClick={() => setDecisionModal('AUTHORISE')} disabled={selectedRequest.status !== 'MAKER_SUBMITTED'}>Authorise</Button><Button variant="outline" leftIcon={<RotateCcw size={15} />} onClick={() => setDecisionModal('RETURN')} disabled={selectedRequest.status !== 'MAKER_SUBMITTED'}>Return to maker</Button></>}
              {isMaker && !isChecker && <Button variant="outline" leftIcon={<LockKeyhole size={15} />} onClick={() => { pushToast({ title: 'Maker and checker must be different users.', description: 'Code: SOD_VIOLATION · Fixture preview', tone: 'error', code: 'SOD_VIOLATION' }); }}>Try checker action · demo SoD</Button>}
            </div>
            {selectedRequest.outcome === 'EXCEPTIONS' && <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><CircleAlert size={16} className="mt-0.5 shrink-0" /><p><strong>Exceptions require review.</strong> One or more checklist answers are marked “No”; checker authorisation will confirm with exceptions.</p></div>}
            {selectedRequest.status === 'CONFIRMED' && <div className="mt-4 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><Check size={16} /><p><strong>Confirmation preview complete.</strong> Bank-confirmed trust badges would appear after the live API flow.</p></div>}
          </Card>
        ) : <Card><EmptyState title="Select a bank request" description="Choose a request from the scoped inbox to review it." /></Card>}
      </div>

      <Modal
        open={decisionModal !== null}
        title={decisionModal === 'AUTHORISE' ? 'Authorise bank confirmation' : 'Return checklist to maker'}
        description="This demo requires the checker account to differ from the recorded maker."
        onClose={() => setDecisionModal(null)}
        footer={<><Button variant="secondary" onClick={() => setDecisionModal(null)}>Cancel</Button><Button onClick={submitCheckerDecision}>{decisionModal === 'AUTHORISE' ? 'Confirm authorisation' : 'Return to maker'}</Button></>}
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>{decisionModal === 'AUTHORISE' ? 'Review the maker checklist and authorise the recorded bank outcome.' : 'Return this checklist for correction by the maker.'}</p>
          <div className="rounded-lg bg-slate-50 p-3"><p><strong>Maker:</strong> {selectedRequest?.maker ?? 'Not submitted'}</p><p className="mt-1"><strong>Checker:</strong> {user?.username ?? 'Current bank user'}</p><p className="mt-1"><strong>Outcome:</strong> {selectedRequest?.outcome ?? '—'}</p></div>
          {isMaker && !isChecker && <p className="font-semibold text-red-700">A maker cannot authorise their own submission (SOD_VIOLATION).</p>}
        </div>
      </Modal>
      <BankReleaseLetters />
    </div>
  );
}

export function BankConsolePage() {
  const { authBypassed } = useAuth();
  return authBypassed ? <BankFixtureConsole /> : <LiveBankConsole />;
}
