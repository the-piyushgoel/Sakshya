import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  HelpCircle,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatINR } from '../../api/format';
import { Button, Card, Modal, Skeleton, StatusPill, StepUpModal, TrustBadge } from '../../ui';
import type { TrustLevel } from '../../ui/TrustBadge';

interface QueueItem {
  case_type: string;
  id: string;
  institute_id?: string;
  institute_name: string;
  bank_id?: string;
  fdr_number: string;
  principal_paise: number;
  state: string;
  owner_role: string;
  score: number;
  priority: number;
  sla_breached: boolean;
  reasons: string[];
  created_at?: string;
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
}

interface InstrumentField {
  name: string;
  value: string;
  trust: TrustLevel;
  source?: string;
  evidence_ref?: string;
  set_at?: string;
}

interface DiscrepancyItem {
  id: string;
  code: string;
  severity: string;
  status: string;
  details?: Record<string, unknown>;
  created_at?: string;
  resolution_note?: string;
}

interface BankRequestSummary {
  id: string;
  state: string;
  outcome?: string;
  remarks?: string;
  created_at?: string;
}

interface InstrumentDetail {
  id: string;
  obligation_id: string;
  institute_id: string;
  bank_id: string;
  state: string;
  is_quarantined: boolean;
  fields: InstrumentField[];
  discrepancies: DiscrepancyItem[];
  bank_requests: BankRequestSummary[];
  obligation?: {
    id: string;
    institute?: {
      name: string;
      code?: string;
    };
  };
  created_at?: string;
}

export function OfficerQueuePage() {
  const navigate = useNavigate();
  const [filterState, setFilterState] = useState<string>('ALL');
  const [hoveredReasons, setHoveredReasons] = useState<{ id: string; reasons: string[] } | null>(null);

  const queueQuery = useQuery({
    queryKey: ['officer-queue'],
    queryFn: () => api.get<QueueResponse>('/queue'),
    refetchInterval: 10000,
  });

  const items = queueQuery.data?.items ?? [];
  const filteredItems = items.filter((item) => {
    if (filterState === 'ALL') return true;
    return item.state === filterState;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
              <ShieldCheck size={13} />
              AICTE SCRUTINY DESK
            </span>
            <span className="text-xs text-slate-400">Dynamic Risk-Ranked Priority Queue</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Institutional Verification Queue
          </h1>
          <p className="text-sm text-slate-500">
            Cases sorted descending by 7-factor composite risk and statutory SLA urgency
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 text-sm">
        {[
          { key: 'ALL', label: 'All Actionable' },
          { key: 'SCRUTINY', label: 'New Submissions (Scrutiny)' },
          { key: 'BANK_PENDING', label: 'Bank Verification In-Flight' },
          { key: 'DISCREPANCY', label: 'Open Discrepancies' },
          { key: 'RENEWAL_DUE', label: 'Renewal Approaching' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
              filterState === tab.key
                ? 'bg-navy-800 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setFilterState(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Queue Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">FDR Number</th>
                <th className="px-4 py-3.5">Institute</th>
                <th className="px-4 py-3.5">Principal Amount</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">SLA / Risk Factors</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queueQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={7} className="p-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No cases pending in this status category.
                  </td>
                </tr>
              ) : (
                filteredItems.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    onClick={() => navigate(`/officer/cases/${c.id}`)}
                  >
                    {/* Priority score */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                            c.priority >= 80
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : c.priority >= 50
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {c.priority}
                        </span>
                        {c.sla_breached && (
                          <span className="inline-flex rounded bg-rose-50 px-1.5 py-0.2 text-[10px] font-bold text-rose-700 border border-rose-200">
                            SLA +20
                          </span>
                        )}
                      </div>
                    </td>

                    {/* FDR Number */}
                    <td className="px-4 py-3.5 font-semibold text-slate-900 whitespace-nowrap">
                      {c.fdr_number}
                    </td>

                    {/* Institute Name */}
                    <td className="px-4 py-3.5 font-medium text-slate-800">{c.institute_name}</td>

                    {/* Amount */}
                    <td className="px-4 py-3.5 font-semibold text-slate-900 whitespace-nowrap">
                      {formatINR(c.principal_paise)}
                    </td>

                    {/* State */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <StatusPill value={c.state} />
                    </td>

                    {/* Explainability factors */}
                    <td className="px-4 py-3.5">
                      <div className="relative flex items-center gap-1">
                        <span className="truncate text-xs text-slate-600 max-w-[220px]">
                          {c.reasons[0] ?? 'Standard priority'}
                        </span>
                        {c.reasons.length > 1 && (
                          <button
                            type="button"
                            className="rounded p-0.5 text-slate-400 hover:text-navy-700 hover:bg-slate-100"
                            title="Why is this ranked here?"
                            onMouseEnter={(e) => {
                              e.stopPropagation();
                              setHoveredReasons({ id: c.id, reasons: c.reasons });
                            }}
                            onMouseLeave={(e) => {
                              e.stopPropagation();
                              setHoveredReasons(null);
                            }}
                          >
                            <HelpCircle size={14} />
                          </button>
                        )}

                        {/* Explainability Popover */}
                        {hoveredReasons?.id === c.id && (
                          <div className="absolute top-6 left-0 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl text-xs space-y-1.5 animate-in fade-in">
                            <div className="font-semibold text-navy-900 flex items-center justify-between border-b pb-1">
                              <span>Why this case is first:</span>
                              <span className="font-bold text-rose-700">P-{c.priority}</span>
                            </div>
                            <ul className="list-disc pl-4 space-y-1 text-slate-700">
                              {c.reasons.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/officer/cases/${c.id}`);
                        }}
                      >
                        Inspect
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

export function CaseWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'discrepancies' | 'bank'>('overview');
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [quarantineModalOpen, setQuarantineModalOpen] = useState(false);
  const [quarantineReason, setQuarantineReason] = useState('Cross-institute duplicate number detected');
  const [actionMessage, setActionMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(
    null,
  );
  const [isRequestingBank, setIsRequestingBank] = useState(false);

  const caseQuery = useQuery({
    queryKey: ['instrument-case', id],
    queryFn: () => api.get<InstrumentDetail>(`/instruments/${id}`),
    enabled: !!id,
  });

  const ins = caseQuery.data;
  const fdrNumber = ins?.fields.find((f) => f.name === 'fdr_number')?.value ?? 'FDR';
  const instituteName = ins?.obligation?.institute?.name ?? 'Aryabhatta Trust';
  const principalPaise = Number(ins?.fields.find((f) => f.name === 'principal_paise')?.value ?? 0);

  const handleRequestBankConfirmation = async () => {
    if (!ins) return;
    setIsRequestingBank(true);
    setActionMessage(null);
    try {
      await api.post('/bank-requests', {
        instrument_id: ins.id,
        reason: 'Statutory verification for AICTE obligation coverage',
      });
      setBankModalOpen(false);
      setActionMessage({
        text: 'Bank confirmation request successfully routed to verified Nodal Directory contact.',
        tone: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['instrument-case', id] });
      queryClient.invalidateQueries({ queryKey: ['officer-queue'] });
    } catch (e) {
      setActionMessage({
        text: e instanceof Error ? e.message : 'Failed to request bank confirmation',
        tone: 'danger',
      });
    } finally {
      setIsRequestingBank(false);
    }
  };

  const handleActivateWithPin = async (pin: string) => {
    if (!ins) return;
    setActionMessage(null);
    try {
      // Step-up verification
      await api.post('/auth/step-up', { pin });
      // Call activate
      await api.post(`/instruments/${ins.id}/activate`);
      setStepUpOpen(false);
      setActionMessage({
        text: 'Instrument successfully verified and ACTIVATED. Obligation coverage updated.',
        tone: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['instrument-case', id] });
      queryClient.invalidateQueries({ queryKey: ['officer-queue'] });
    } catch (e) {
      setStepUpOpen(false);
      setActionMessage({
        text: e instanceof Error ? e.message : 'Activation failed (Check Segregation of Duties / Role)',
        tone: 'danger',
      });
    }
  };

  const handleQuarantine = async () => {
    if (!ins) return;
    try {
      await api.post(`/instruments/${ins.id}/quarantine`, { reason: quarantineReason });
      setQuarantineModalOpen(false);
      setActionMessage({
        text: 'Instrument QUARANTINED. Vigilance alert dispatched to compliance ledger.',
        tone: 'danger',
      });
      queryClient.invalidateQueries({ queryKey: ['instrument-case', id] });
      queryClient.invalidateQueries({ queryKey: ['officer-queue'] });
    } catch (e) {
      setActionMessage({
        text: e instanceof Error ? e.message : 'Failed to quarantine',
        tone: 'danger',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/officer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-900"
        >
          <ArrowLeft size={14} />
          Back to Verification Queue
        </Link>
      </div>

      {/* Case Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">
                Case ID: {ins?.id ? ins.id.slice(0, 8) : '…'}
              </span>
              {ins && <StatusPill value={ins.state} />}
              {ins?.is_quarantined && (
                <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold text-white animate-pulse">
                  QUARANTINED
                </span>
              )}
            </div>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900">{fdrNumber}</h1>
            <p className="text-sm font-medium text-slate-600">
              {instituteName} · {principalPaise > 0 ? formatINR(principalPaise) : '—'}
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBankModalOpen(true)}
              disabled={ins?.state === 'ACTIVE' || ins?.is_quarantined}
            >
              <Send size={14} />
              <span>Request Bank Confirmation</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setStepUpOpen(true)}
              disabled={ins?.state === 'ACTIVE' || ins?.is_quarantined}
            >
              <UserCheck size={14} />
              <span>Activate (Step-Up)</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQuarantineModalOpen(true)}
              disabled={ins?.is_quarantined}
            >
              <ShieldAlert size={14} className="text-rose-600" />
              <span>Quarantine</span>
            </Button>
          </div>
        </div>

        {/* Action Message Alert */}
        {actionMessage && (
          <div
            className={`mt-4 rounded-lg p-3 text-sm font-medium ${
              actionMessage.tone === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {actionMessage.text}
          </div>
        )}
      </Card>

      {/* Workspace Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200 text-sm font-medium">
        <button
          type="button"
          className={`pb-2.5 transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-navy-900 text-navy-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          Field Verification & Trust Badges
        </button>

        <button
          type="button"
          className={`pb-2.5 transition-colors border-b-2 ${
            activeTab === 'discrepancies'
              ? 'border-navy-900 text-navy-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('discrepancies')}
        >
          Discrepancies & Forgery Flags ({ins?.discrepancies.length ?? 0})
        </button>

        <button
          type="button"
          className={`pb-2.5 transition-colors border-b-2 ${
            activeTab === 'bank'
              ? 'border-navy-900 text-navy-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('bank')}
        >
          Bank Confirmation Status
        </button>
      </div>

      {/* Tab 1: Overview & Trust Badges */}
      {activeTab === 'overview' && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Claim vs Bank-Confirmed Parameters (L0 Claimed → L2 Bank Confirmed)
            </h2>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs font-semibold uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Parameter Name</th>
                <th className="px-5 py-3">Value</th>
                <th className="px-5 py-3">Trust Level</th>
                <th className="px-5 py-3">Source & Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {caseQuery.isLoading ? (
                <tr>
                  <td colSpan={4} className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </td>
                </tr>
              ) : (
                ins?.fields.map((f) => (
                  <tr key={f.name} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5 font-medium text-slate-700">
                      {f.name.replace(/_/g, ' ').toUpperCase()}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 font-mono">
                      {f.name.includes('paise') ? formatINR(Number(f.value)) : f.value}
                    </td>
                    <td className="px-5 py-3.5">
                      <TrustBadge trust={f.trust} setAt={f.set_at} />
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {f.source ?? 'CBS Reconciliation'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Tab 2: Discrepancies */}
      {activeTab === 'discrepancies' && (
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Detected Discrepancies</h2>
          {ins?.discrepancies.length === 0 ? (
            <p className="text-sm text-slate-500">No open discrepancies detected on this instrument.</p>
          ) : (
            <div className="space-y-3">
              {ins?.discrepancies.map((d) => (
                <div
                  key={d.id}
                  className="rounded-lg border border-rose-200 bg-rose-50/40 p-4 flex items-start justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-rose-800 text-sm">{d.code}</span>
                      <span className="rounded bg-rose-100 px-2 py-0.2 text-xs font-semibold text-rose-700">
                        {d.severity} SEVERITY
                      </span>
                      <span className="text-xs text-slate-400">Status: {d.status}</span>
                    </div>
                    <p className="text-xs text-slate-700">
                      Detected discrepancy on instrument verification audit.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Bank Confirmation */}
      {activeTab === 'bank' && (
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Bank Confirmation Requests</h2>
          {ins?.bank_requests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No bank confirmation request dispatched yet. Click "Request Bank Confirmation" to route to the
              verified nodal contact.
            </div>
          ) : (
            ins?.bank_requests.map((br) => (
              <div key={br.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-700">Request #{br.id.slice(0, 8)}</span>
                  <StatusPill value={br.state} />
                </div>
                <div className="text-xs text-slate-600">
                  <span>Outcome: <strong>{br.outcome ?? 'In Verification'}</strong></span>
                  {br.remarks && <p className="mt-1 text-slate-500">Remarks: {br.remarks}</p>}
                </div>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Modal: Bank Confirmation Request */}
      <Modal
        open={bankModalOpen}
        title="Route Verification to Verified Nodal Directory"
        description="Statutory Bank Confirmation Request"
        onClose={() => setBankModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBankModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRequestBankConfirmation}
              loading={isRequestingBank}
            >
              Dispatch to Nodal Directory Contact
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
            <strong>Anti-Phishing Security Policy:</strong>
            <p>
              Branch contact details printed on the institute's uploaded PDF are strictly bypassed. The
              verification request will be routed directly to AICTE's verified Nodal Bank Officer.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50 space-y-1 text-xs">
            <div className="font-semibold text-slate-800">Verified Nodal Directory Officer:</div>
            <div className="text-slate-600">Bank: Bharat Reserve Bank / HDFC Nodal Cell</div>
            <div className="text-slate-600">Official Channel: Bank Portal Console</div>
          </div>
        </div>
      </Modal>

      {/* Step-Up PIN Modal for Activation */}
      <StepUpModal
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onSubmit={handleActivateWithPin}
        title="Enter Approving Officer Step-Up PIN"
      />

      {/* Quarantine Modal */}
      <Modal
        open={quarantineModalOpen}
        title="Quarantine Instrument for Vigilance Investigation"
        description="Prevent obligation coverage and flag for compliance audit"
        onClose={() => setQuarantineModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setQuarantineModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleQuarantine}>
              Confirm Quarantine
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block text-xs font-semibold text-slate-700">
            Quarantine Reason:
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
              rows={3}
              value={quarantineReason}
              onChange={(e) => setQuarantineReason(e.target.value)}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
