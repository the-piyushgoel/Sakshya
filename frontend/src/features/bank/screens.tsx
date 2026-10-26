import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  FileCheck2,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatINR } from '../../api/format';
import { Button, Card, Skeleton, StatusPill } from '../../ui';

interface BankInboxItem {
  id: string;
  instrument_id: string;
  fdr_number: string;
  principal_paise: number;
  state: string;
  created_at?: string;
}

interface BankInboxResponse {
  items: BankInboxItem[];
  total: number;
}

interface ChecklistItemData {
  item_no: number;
  question: string;
  answer?: boolean | null;
  remarks?: string | null;
}

interface DirectoryContact {
  name: string;
  email: string;
  phone: string;
  is_directory: boolean;
}

interface InstrumentSummary {
  id: string;
  fdr_number: string;
  bank_ifsc: string;
  principal_paise: number;
  maturity_date: string;
  state: string;
}

interface BankRequestDetail {
  id: string;
  instrument_id: string;
  bank_id: string;
  state: string;
  outcome?: string | null;
  directory_contact: DirectoryContact;
  checklist: ChecklistItemData[];
  instrument: InstrumentSummary;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}

const STATUTORY_12_QUESTIONS: { no: number; title: string; desc: string }[] = [
  { no: 1, title: 'CBS Record Existence', desc: 'Fixed Deposit Receipt exists and is verified in Core Banking System' },
  { no: 2, title: 'Principal Amount Parity', desc: 'Principal amount matches statutory institutional deposit claim exactly' },
  { no: 3, title: 'Maturity Date Verification', desc: 'Deposit term and maturity date match core banking ledger records' },
  { no: 4, title: 'AICTE Beneficiary Clause', desc: 'Deposit receipt is made strictly in favour of Member Secretary, AICTE' },
  { no: 5, title: 'Lien Marking in CBS', desc: 'Lien is formally noted, locked and flagged in Core Banking System' },
  { no: 6, title: 'Statutory Auto-Renewal', desc: 'Automatic rollover clause enabled at prevailing sovereign interest rates' },
  { no: 7, title: 'Zero Encumbrance', desc: 'Instrument is free from any prior charge, predecessor lien or third-party claim' },
  { no: 8, title: 'Joint Operating Mandate', desc: 'Operating instructions strictly mandate joint discharge authorization by AICTE' },
  { no: 9, title: 'Authorized Signatures', desc: 'Branch signatures, power of attorney and official bank seals verified authentic' },
  { no: 10, title: 'IFSC & Branch Code', desc: 'Designated branch code and IFSC match nodal directory registration' },
  { no: 11, title: 'Fixed Interest Structure', desc: 'Guaranteed fixed term interest rate verified without market-linked variance' },
  { no: 12, title: 'Statutory KYC Certification', desc: 'Depositing educational trust/society KYC verified and active' },
];

export function BankInboxPage() {
  const navigate = useNavigate();

  const inboxQuery = useQuery({
    queryKey: ['bank-inbox'],
    queryFn: () => api.get<BankInboxResponse>('/bank/inbox'),
    refetchInterval: 8000,
  });

  const items = inboxQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
            <Building2 size={13} />
            BANK CONSOLE · NODAL CELL
          </span>
          <span className="text-xs text-slate-400">Core Banking Direct Attestation Channel</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Statutory Deposit Verification Inbox
        </h1>
        <p className="text-sm text-slate-500">
          Official verification requests routed directly to AICTE verified Nodal Bank officers
        </p>
      </div>

      {/* Inbox Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-5 py-3.5">Request Ref</th>
                <th className="px-5 py-3.5">FDR Number</th>
                <th className="px-5 py-3.5">Principal Amount</th>
                <th className="px-5 py-3.5">Verification State</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inboxQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={5} className="p-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No pending verification requests in this bank queue.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    onClick={() => navigate(`/bank/requests/${item.id}`)}
                  >
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-800">
                      #{item.id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">{item.fdr_number}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      {formatINR(item.principal_paise)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill value={item.state} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/bank/requests/${item.id}`);
                        }}
                      >
                        <FileCheck2 size={14} />
                        <span>12-Pt Checklist</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function BankRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [outcome, setOutcome] = useState<'ALL_CLEAR' | 'DISCREPANCY_NOTED' | 'NOT_FOUND'>('ALL_CLEAR');
  const [makerRemarks, setMakerRemarks] = useState('All 12 items verified clear against core banking ledger');
  const [checkerRemarks, setCheckerRemarks] = useState('Authorised by Bank Checker');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const reqQuery = useQuery({
    queryKey: ['bank-request-detail', id],
    queryFn: () => api.get<BankRequestDetail>(`/bank/requests/${id}`),
    enabled: !!id,
  });

  const req = reqQuery.data;

  // Initialize checklist answers
  const handleMarkAllClear = () => {
    const all: Record<number, boolean> = {};
    for (let i = 1; i <= 12; i++) {
      all[i] = true;
    }
    setAnswers(all);
    setOutcome('ALL_CLEAR');
  };

  const toggleAnswer = (no: number) => {
    setAnswers((prev) => ({
      ...prev,
      [no]: !prev[no],
    }));
  };

  // Maker Submit
  const handleMakerSubmit = async () => {
    if (!req) return;
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const checklistPayload = STATUTORY_12_QUESTIONS.map((q) => ({
        item_no: q.no,
        question: q.title,
        answer: answers[q.no] ?? true,
        remarks: 'OK',
      }));

      await api.post(`/bank/requests/${req.id}/maker-submit`, {
        checklist: checklistPayload,
        outcome,
        remarks: makerRemarks,
      });

      setActionSuccess('12-Point Checklist submitted successfully by Bank Maker. Ready for Checker sign-off.');
      queryClient.invalidateQueries({ queryKey: ['bank-request-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['bank-inbox'] });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Maker checklist submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Checker Authorize
  const handleCheckerDecision = async (decision: 'AUTHORISE' | 'RETURN') => {
    if (!req) return;
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.post(`/bank/requests/${req.id}/checker-decision`, {
        decision,
        remarks: checkerRemarks,
      });

      setActionSuccess('Verification successfully AUTHORISED by Bank Checker. Trust badges upgraded to L2.');
      queryClient.invalidateQueries({ queryKey: ['bank-request-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['bank-inbox'] });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Checker authorization failed (Check Segregation of Duties)');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          to="/bank"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-900"
        >
          <ArrowLeft size={14} />
          Back to Bank Inbox
        </Link>
      </div>

      {/* Request Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">
                Request #{req?.id ? req.id.slice(0, 8) : '…'}
              </span>
              {req && <StatusPill value={req.state} />}
            </div>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900">
              {req?.instrument.fdr_number ?? 'FDR Receipt'}
            </h1>
            <p className="text-sm font-medium text-slate-600">
              IFSC: {req?.instrument.bank_ifsc} · Principal: {req ? formatINR(req.instrument.principal_paise) : '—'}
            </p>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 space-y-0.5">
            <div className="font-semibold flex items-center gap-1">
              <ShieldCheck size={14} className="text-blue-700" />
              Verified Nodal Directory Officer
            </div>
            <div>{req?.directory_contact.name}</div>
            <div className="text-[11px] text-blue-700 font-mono">
              {req?.directory_contact.email} · {req?.directory_contact.phone}
            </div>
          </div>
        </div>

        {/* Action Error / Success alerts */}
        {actionSuccess && (
          <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm font-medium text-emerald-800">
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm font-medium text-rose-800">
            {actionError}
          </div>
        )}
      </Card>

      {/* 12-Point Statutory Checklist */}
      <Card className="p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Statutory 12-Point Verification Checklist (SRS §7.5)
            </h2>
            <p className="text-xs text-slate-500">
              Complete each verification parameter in core banking records before signing off
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={handleMarkAllClear}>
            <Check size={14} />
            <span>Mark All Clear (Demo)</span>
          </Button>
        </div>

        {/* Checklist Grid */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STATUTORY_12_QUESTIONS.map((q) => {
            const isChecked = answers[q.no] ?? (req?.state === 'MAKER_SUBMITTED' || req?.state === 'CONFIRMED');

            return (
              <div
                key={q.no}
                className={`flex items-start gap-3 rounded-lg border p-3.5 transition-all cursor-pointer ${
                  isChecked
                    ? 'border-emerald-200 bg-emerald-50/40 text-emerald-950'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                onClick={() => req?.state !== 'CONFIRMED' && toggleAnswer(q.no)}
              >
                <input
                  type="checkbox"
                  id={`chk-${q.no}`}
                  checked={isChecked}
                  onChange={() => toggleAnswer(q.no)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  disabled={req?.state === 'CONFIRMED'}
                />
                <div className="space-y-0.5 text-xs">
                  <div className="font-semibold text-slate-900">
                    {q.no}. {q.title}
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">{q.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Maker Submission Section */}
        {req?.state !== 'CONFIRMED' && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
            <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <UserCheck size={16} className="text-navy-700" />
              <span>Step 1: Bank Maker Submission (`brb_mk`)</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700">
                Audit Outcome:
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-medium"
                >
                  <option value="ALL_CLEAR">ALL_CLEAR (All 12 items verified clear)</option>
                  <option value="DISCREPANCY_NOTED">DISCREPANCY_NOTED (Lien or amount defect)</option>
                  <option value="NOT_FOUND">NOT_FOUND (Deposit record missing in CBS)</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                Maker Ledger Remarks:
                <input
                  type="text"
                  value={makerRemarks}
                  onChange={(e) => setMakerRemarks(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs"
                />
              </label>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={handleMakerSubmit}
              loading={submitting}
            >
              <CheckCircle2 size={14} />
              <span>Submit 12-Pt Checklist (Maker)</span>
            </Button>
          </div>
        )}

        {/* Checker Authorization Section */}
        {req?.state === 'MAKER_SUBMITTED' && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-5 space-y-4">
            <div className="font-semibold text-sm text-blue-900 flex items-center gap-2">
              <ShieldCheck size={16} className="text-blue-700" />
              <span>Step 2: Bank Checker Authorization (`brb_ck`)</span>
            </div>

            <p className="text-xs text-blue-800">
              Maker has submitted outcome: <strong>{req.outcome ?? 'ALL_CLEAR'}</strong>.
              Checker authorization will finalize the audit and flip the instrument's trust badges to
              <strong> L2_BANK_CONFIRMED</strong>.
            </p>

            <label className="block text-xs font-semibold text-blue-950">
              Checker Authorization Remarks:
              <input
                type="text"
                value={checkerRemarks}
                onChange={(e) => setCheckerRemarks(e.target.value)}
                className="mt-1 w-full rounded-md border border-blue-300 bg-white p-2 text-xs"
              />
            </label>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleCheckerDecision('AUTHORISE')}
                loading={submitting}
              >
                <CheckCircle2 size={14} />
                <span>Authorise Confirmation (Checker)</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCheckerDecision('RETURN')}
                loading={submitting}
              >
                <X size={14} />
                <span>Return to Maker</span>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
