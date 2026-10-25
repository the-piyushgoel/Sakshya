import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Banknote, CircleAlert, ClipboardCheck, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { formatINR } from '../../api/format';
import { Badge, Button, Card, DataTable, EmptyState, Modal, Skeleton, StatusPill, useToasts } from '../../ui';
import { useAuth } from '../../shell/auth';

type BankOutcome = 'ALL_CLEAR' | 'EXCEPTIONS' | 'NOT_FOUND';
type InboxItem = { id: string; instrument_id: string; fdr_number: string; principal_paise: number; state: string; created_at: string };
type BankChecklistItem = { item_no: number; question: string; answer: boolean | null; remarks?: string | null };
type BankRequestDetail = {
  id: string;
  instrument_id: string;
  bank_id: string;
  state: string;
  outcome?: BankOutcome | null;
  directory_contact: { name: string; email: string; phone: string; is_directory: boolean };
  checklist: BankChecklistItem[];
  instrument: { id: string; fdr_number: string; bank_ifsc: string; principal_paise: number; maturity_date: string; state: string };
  remarks?: string | null;
  created_at: string;
  updated_at: string;
};

function items(value: unknown): InboxItem[] {
  if (Array.isArray(value)) return value as InboxItem[];
  if (typeof value === 'object' && value !== null && 'items' in value && Array.isArray(value.items)) return value.items as InboxItem[];
  throw new Error('The bank inbox API returned an unexpected list response.');
}

export function LiveBankConsole() {
  const { user } = useAuth();
  const { pushToast } = useToasts();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [answers, setAnswers] = useState<Record<number, boolean | null>>({});
  const [exceptionNotes, setExceptionNotes] = useState<Record<number, string>>({});
  const [outcome, setOutcome] = useState<BankOutcome>('ALL_CLEAR');
  const [remarks, setRemarks] = useState('');
  const [decision, setDecision] = useState<'AUTHORISE' | 'RETURN' | null>(null);

  const inboxQuery = useQuery({
    queryKey: ['bank', 'inbox'],
    queryFn: async () => items(await api.get<unknown>('/bank/inbox')),
  });
  const inbox = inboxQuery.data ?? [];
  const selectedItem = inbox.find((item) => item.id === selectedId) ?? inbox[0];
  const requestQuery = useQuery({
    queryKey: ['bank', 'request', selectedItem?.id],
    queryFn: () => api.get<BankRequestDetail>(`/bank/requests/${encodeURIComponent(selectedItem!.id)}`),
    enabled: Boolean(selectedItem?.id),
  });
  const request = requestQuery.data;
  const isMaker = user?.roles.includes('BANK_MAKER') ?? false;
  const isChecker = user?.roles.includes('BANK_CHECKER') ?? false;
  const hasNoAnswer = (request?.checklist ?? []).some((item) => (answers[item.item_no] ?? item.answer) === false);

  const invalidateBank = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['bank', 'inbox'] }),
      queryClient.invalidateQueries({ queryKey: ['bank', 'request'] }),
      queryClient.invalidateQueries({ queryKey: ['officer', 'queue'] }),
      queryClient.invalidateQueries({ queryKey: ['institute'] }),
    ]);
  };
  const actionMutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api.post<unknown>(path, body),
    onSuccess: invalidateBank,
  });
  const act = async (path: string, body: unknown, success: string) => {
    try {
      await actionMutation.mutateAsync({ path, body });
      pushToast({ title: success, tone: 'success' });
      setDecision(null);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error('Bank action failed');
      pushToast({
        title: cause.message,
        description: error instanceof ApiError ? `Request failed (${error.status}).` : 'The bank action could not be completed.',
        tone: 'error',
        code: error instanceof ApiError ? error.code : undefined,
      });
    }
  };

  const submitMaker = async () => {
    if (!request) return;
    const checklist = request.checklist.map((item) => {
      const answer = answers[item.item_no] ?? item.answer;
      return {
        item_no: item.item_no,
        question: item.question,
        answer,
        remarks: answer === false ? exceptionNotes[item.item_no] ?? item.remarks ?? '' : '',
      };
    });
    const finalOutcome = hasNoAnswer && outcome === 'ALL_CLEAR' ? 'EXCEPTIONS' : outcome;
    if (finalOutcome === 'EXCEPTIONS' && checklist.some((item) => item.answer === false && !item.remarks.trim())) {
      pushToast({ title: 'Add a remark for each “No” answer.', tone: 'warning' });
      return;
    }
    await act(`/bank/requests/${request.id}/maker-submit`, { checklist, outcome: finalOutcome, remarks }, 'Maker checklist submitted');
  };

  const submitChecker = async () => {
    if (!request || !decision) return;
    await act(`/bank/requests/${request.id}/checker-decision`, {
      decision,
      remarks: decision === 'RETURN' ? remarks : undefined,
    }, decision === 'AUTHORISE' ? 'Bank confirmation authorised' : 'Checklist returned to maker');
  };

  return (
    <div className="space-y-5">
      <div className="page-heading"><div><span className="eyebrow">BANK WORKSPACE · LIVE API</span><h1>Bank Console</h1><p>Verify a fixed deposit through a maker checklist and an independent checker.</p></div><Badge tone="info"><span className="inline-flex items-center gap-1"><Banknote size={13} /> {user?.bank_id ?? 'Assigned bank'}</span></Badge></div>
      {inboxQuery.isLoading && <Card><Skeleton className="h-8 w-full" /><Skeleton className="mt-3 h-32 w-full" /></Card>}
      {inboxQuery.isError && <Card className="border-red-200 bg-red-50"><p role="alert" className="text-sm text-red-800">{inboxQuery.error.message}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void inboxQuery.refetch()}>Retry</Button></Card>}
      {!inboxQuery.isLoading && !inboxQuery.isError && <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.7fr)]">
        <Card title="Request inbox" description={`${inboxQuery.data?.length ?? 0} requests assigned to your bank`}>
          <DataTable rows={inbox} rowKey={(item) => item.id} emptyMessage="No confirmation requests are assigned to this bank." columns={[
            { key: 'request', header: 'FDR / request', render: (item) => <button type="button" className="text-left font-semibold text-navy-800 hover:underline" onClick={() => setSelectedId(item.id)}>{item.fdr_number}<span className="mt-1 block font-mono text-xs font-normal text-slate-500">{item.id}</span></button> },
            { key: 'amount', header: 'Principal', render: (item) => formatINR(item.principal_paise) },
            { key: 'status', header: 'State', render: (item) => <StatusPill value={item.state} /> },
            { key: 'open', header: '', render: (item) => <Button variant="ghost" size="sm" onClick={() => setSelectedId(item.id)}>Open <ArrowRight size={13} /></Button> },
          ]} />
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong>Bank-scoped inbox.</strong> The API only returns requests assigned to this user’s bank. Institute-supplied contacts do not affect routing.</div>
        </Card>

        {selectedItem ? <Card title="Request detail" description={`Request ${selectedItem.id}`} action={request && <StatusPill value={request.state} />}>
          {requestQuery.isLoading && <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-48 w-full" /></div>}
          {requestQuery.isError && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{requestQuery.error.message}<Button className="ml-3" size="sm" variant="outline" onClick={() => void requestQuery.refetch()}>Retry</Button></div>}
          {request && <>
            <div className="grid gap-3 rounded-xl bg-navy-50/70 p-4 sm:grid-cols-2">
              <div><p className="text-xs text-slate-500">FDR number</p><p className="mt-1 font-mono font-semibold">{request.instrument.fdr_number}</p></div>
              <div><p className="text-xs text-slate-500">IFSC</p><p className="mt-1 font-semibold">{request.instrument.bank_ifsc}</p></div>
              <div><p className="text-xs text-slate-500">Principal</p><p className="mt-1 font-semibold">{formatINR(request.instrument.principal_paise)}</p></div>
              <div><p className="text-xs text-slate-500">Maturity</p><p className="mt-1 font-semibold">{request.instrument.maturity_date}</p></div>
            </div>
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><p className="font-semibold">Directory contact · {request.directory_contact.name}</p><p className="mt-1">{request.directory_contact.email} · {request.directory_contact.phone}</p></div>
            <div className="mt-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold">12-point verification checklist</h3><p className="mt-1 text-xs text-slate-500">Use bank records for each answer; a “No” requires an explanation.</p></div>{request.outcome && <Badge tone={request.outcome === 'ALL_CLEAR' ? 'success' : 'warning'}>{request.outcome.replaceAll('_', ' ')}</Badge>}</div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100"><table className="data-table min-w-[720px]"><thead><tr><th>Question</th><th>Result</th><th>Exception note</th></tr></thead><tbody>{request.checklist.map((item) => {
              const answer = answers[item.item_no] ?? item.answer;
              return <tr key={item.item_no} className={answer === false ? 'bg-red-50' : ''}>
                <td><span className="mr-2 text-xs text-slate-400">{String(item.item_no).padStart(2, '0')}</span>{item.question}</td>
                <td><select aria-label={`${item.item_no}. ${item.question}`} disabled={!isMaker || request.state === 'CONFIRMED'} className={`input-control min-w-24 py-2 ${answer === false ? 'border-red-300 bg-red-50 text-red-800' : ''}`} value={answer === null || answer === undefined ? '' : answer ? 'yes' : 'no'} onChange={(event) => setAnswers((current) => ({ ...current, [item.item_no]: event.target.value === '' ? null : event.target.value === 'yes' }))}><option value="">Not checked</option><option value="yes">Yes</option><option value="no">No</option></select></td>
                <td>{answer === false ? <input className="input-control min-w-48 py-2" disabled={!isMaker} value={exceptionNotes[item.item_no] ?? item.remarks ?? ''} onChange={(event) => setExceptionNotes((current) => ({ ...current, [item.item_no]: event.target.value }))} placeholder="Required for exception" /> : item.remarks || '—'}</td>
              </tr>;
            })}</tbody></table></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {isMaker && <fieldset><legend className="field-label">Bank outcome</legend><div className="mt-2 flex flex-wrap gap-2">{(['ALL_CLEAR', 'EXCEPTIONS', 'NOT_FOUND'] as const).map((value) => <label key={value} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${outcome === value ? 'border-navy-500 bg-navy-50' : 'border-slate-200'}`}><input type="radio" name="bank-outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />{value.replaceAll('_', ' ')}</label>)}</div></fieldset>}
              <label className="field-label">Remarks<textarea className="input-control mt-1.5 min-h-20" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder={isMaker ? 'Bank maker remarks' : 'Checker remarks'} /></label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
              {isMaker && <Button leftIcon={<ClipboardCheck size={15} />} disabled={actionMutation.isPending || request.state === 'CONFIRMED'} onClick={() => void submitMaker()}>Submit maker checklist</Button>}
              {isChecker && <><Button variant="secondary" leftIcon={<ShieldCheck size={15} />} disabled={actionMutation.isPending || request.state !== 'MAKER_SUBMITTED'} onClick={() => setDecision('AUTHORISE')}>Authorise</Button><Button variant="outline" leftIcon={<RotateCcw size={15} />} disabled={actionMutation.isPending || request.state !== 'MAKER_SUBMITTED'} onClick={() => setDecision('RETURN')}>Return to maker</Button></>}
              {isMaker && <Button variant="outline" leftIcon={<LockKeyhole size={15} />} onClick={() => pushToast({ title: 'Checker access is restricted to the checker role.', description: 'Maker and checker must be different users.', tone: 'warning', code: 'SOD_VIOLATION' })}>Maker / checker separation</Button>}
            </div>
            {hasNoAnswer && <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><CircleAlert size={16} className="mt-0.5 shrink-0" /><p><strong>Exception detected.</strong> “No” answers must include a bank remark and produce an exception outcome.</p></div>}
          </>}
        </Card> : <Card><EmptyState title="Select a bank request" description="Choose a request from your bank inbox to review it." /></Card>}
      </div>}
      <Modal open={decision !== null} title={decision === 'AUTHORISE' ? 'Authorise bank response' : 'Return checklist to maker'} description="The API enforces the maker-checker separation rule." onClose={() => setDecision(null)} footer={<><Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button><Button disabled={actionMutation.isPending || !request || decision === 'RETURN' && !remarks.trim()} onClick={() => void submitChecker()}>Confirm decision</Button></>}>
        <p className="text-sm text-slate-600">{decision === 'AUTHORISE' ? 'Authorise this maker-submitted checklist. The backend will upgrade trust only for an all-clear result.' : 'Return the checklist to the maker with remarks.'}</p>
        {decision === 'RETURN' && !remarks.trim() && <p className="mt-2 text-xs text-red-700">A return note is required.</p>}
      </Modal>
      <BankReleaseLetters />
    </div>
  );
}

type BankLetter = {
  letter_id: string;
  fdr_number: string;
  institute_name: string;
  principal_paise: number;
  aicte_share_paise: number;
  status: string;
  utr?: string | null;
  executed_at?: string | null;
};

const fixtureLetter: BankLetter = {
  letter_id: 'letter-arya-term-2026',
  fdr_number: 'FDR-ARYA-401928',
  institute_name: 'Aryabhatta College of Engineering',
  principal_paise: 450000000,
  aicte_share_paise: 0,
  status: 'ISSUED',
};

function parseLetters(value: unknown): BankLetter[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value as BankLetter[];
  if (typeof value === 'object' && value !== null && 'items' in value && Array.isArray(value.items)) {
    return value.items as BankLetter[];
  }
  throw new Error('The bank letters API returned an unexpected list response.');
}

function toPaise(rupees: string): number | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(rupees);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

function toRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function BankReleaseLetters() {
  const { user, authBypassed } = useAuth();
  const { pushToast } = useToasts();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [makerOpen, setMakerOpen] = useState(false);
  const [checkerDecision, setCheckerDecision] = useState<'AUTHORISE' | 'RETURN' | null>(null);
  const [utr, setUtr] = useState('');
  const [principal, setPrincipal] = useState(toRupees(fixtureLetter.principal_paise));
  const [aicteShare, setAicteShare] = useState(toRupees(fixtureLetter.aicte_share_paise));
  const [executionDate, setExecutionDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [previewMaker, setPreviewMaker] = useState('');
  const [previewChanges, setPreviewChanges] = useState<Record<string, Partial<BankLetter>>>({});

  const lettersQuery = useQuery({
    queryKey: ['bank', 'release-letters'],
    queryFn: async () => parseLetters(await api.get<unknown>('/bank/letters')),
    enabled: !authBypassed,
  });
  const letters = (authBypassed ? [fixtureLetter] : lettersQuery.data ?? [])
    .map((letter) => ({ ...letter, ...previewChanges[letter.letter_id] }));
  const selected = letters.find((letter) => letter.letter_id === selectedId) ?? letters[0];
  const isMaker = user?.roles.includes('BANK_MAKER') ?? false;
  const isChecker = user?.roles.includes('BANK_CHECKER') ?? false;
  const executionSubmitted = Boolean(selected?.utr);
  const canSubmitMaker = Boolean(selected && isMaker && selected.status === 'ISSUED' && !executionSubmitted);
  const canSubmitChecker = Boolean(selected && isChecker && selected.status === 'ISSUED' && executionSubmitted);

  const actionMutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api.post<unknown>(path, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank', 'release-letters'] }),
  });

  const submitMaker = async () => {
    if (!selected) return;
    const principalPaise = toPaise(principal);
    const aictePaise = toPaise(aicteShare);
    if (utr.trim().length < 6 || principalPaise === null || aictePaise === null || !executionDate) {
      pushToast({ title: 'Enter a valid UTR, amounts and execution date.', tone: 'warning' });
      return;
    }
    if (authBypassed) {
      setPreviewMaker(user?.username ?? 'preview_bank_maker');
      setPreviewChanges((current) => ({ ...current, [selected.letter_id]: { utr: utr.trim().toUpperCase() } }));
      setMakerOpen(false);
      pushToast({ title: 'Maker execution submitted', description: 'Fixture preview only — no backend record was changed.', tone: 'info' });
      return;
    }
    try {
      await actionMutation.mutateAsync({
        path: `/bank/letters/${encodeURIComponent(selected.letter_id)}/execute-maker`,
        body: { utr: utr.trim(), principal_paise: principalPaise, aicte_share_paise: aictePaise, execution_date: executionDate },
      });
      setPreviewChanges((current) => ({ ...current, [selected.letter_id]: { utr: utr.trim().toUpperCase() } }));
      setMakerOpen(false);
      pushToast({ title: 'Maker execution submitted', tone: 'success' });
    } catch (error) {
      pushToast({ title: error instanceof Error ? error.message : 'Maker execution failed', tone: 'error', code: error instanceof ApiError ? error.code : undefined });
    }
  };

  const submitChecker = async () => {
    if (!selected || !checkerDecision) return;
    if (checkerDecision === 'RETURN' && !remarks.trim()) {
      pushToast({ title: 'Add a return reason before submitting.', tone: 'warning' });
      return;
    }
    if (authBypassed) {
      if (previewMaker && previewMaker === user?.username) {
        pushToast({ title: 'Maker and checker must be different users.', description: 'Code: SOD_VIOLATION · Fixture preview', tone: 'error', code: 'SOD_VIOLATION' });
        return;
      }
      setPreviewChanges((current) => ({
        ...current,
        [selected.letter_id]: checkerDecision === 'AUTHORISE'
          ? { status: 'EXECUTED' }
          : { utr: null },
      }));
      setCheckerDecision(null);
      setRemarks('');
      pushToast({ title: checkerDecision === 'AUTHORISE' ? 'Execution authorised' : 'Execution returned to maker', description: 'Fixture preview only — no backend record was changed.', tone: 'info' });
      return;
    }
    try {
      await actionMutation.mutateAsync({
        path: `/bank/letters/${encodeURIComponent(selected.letter_id)}/execute-checker`,
        body: { decision: checkerDecision, remarks: remarks.trim() || undefined },
      });
      setPreviewChanges((current) => ({
        ...current,
        [selected.letter_id]: checkerDecision === 'AUTHORISE'
          ? { status: 'EXECUTED', utr: selected.utr }
          : { utr: null },
      }));
      setCheckerDecision(null);
      setRemarks('');
      pushToast({ title: checkerDecision === 'AUTHORISE' ? 'Execution authorised' : 'Execution returned to maker', tone: 'success' });
    } catch (error) {
      pushToast({ title: error instanceof Error ? error.message : 'Checker decision failed', tone: 'error', code: error instanceof ApiError ? error.code : undefined });
    }
  };

  return (
    <Card title="Release letters · bank execution" description="Record the UTR and payment breakdown as maker, then authorise it with an independent checker." action={authBypassed && <Badge tone="warning">Fixture preview</Badge>}>
      {!authBypassed && lettersQuery.isLoading && <Skeleton className="h-20 w-full" />}
      {!authBypassed && lettersQuery.isError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{lettersQuery.error.message}<Button className="ml-3" size="sm" variant="outline" onClick={() => void lettersQuery.refetch()}>Retry</Button></div>}
      {!authBypassed && !lettersQuery.isLoading && !lettersQuery.isError && letters.length === 0 && <EmptyState title="No release letters" description="Issued letters for your bank will appear here." />}
      {letters.length > 0 && <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <DataTable rows={letters} rowKey={(letter) => letter.letter_id} emptyMessage="No bank letters." columns={[
          { key: 'letter', header: 'Institute / FDR', render: (letter) => <button type="button" className="text-left font-semibold text-navy-800 hover:underline" onClick={() => setSelectedId(letter.letter_id)}>{letter.institute_name}<span className="mt-1 block font-mono text-xs font-normal text-slate-500">{letter.fdr_number}</span></button> },
          { key: 'status', header: 'Status', render: (letter) => <StatusPill value={letter.status} /> },
        ]} />
        {selected && <div className="rounded-xl border border-slate-100 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-navy-900">{selected.institute_name}</h3><p className="mt-1 font-mono text-xs text-slate-500">{selected.fdr_number} · {selected.letter_id}</p></div><StatusPill value={selected.status} /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Principal</p><p className="mt-1 font-semibold">{formatINR(selected.principal_paise)}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">AICTE share</p><p className="mt-1 font-semibold">{formatINR(selected.aicte_share_paise)}</p></div></div>
          {selected.utr && <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm"><strong>Maker UTR:</strong> <span className="font-mono">{selected.utr}</span><p className="mt-1 text-xs text-slate-600">{selected.executed_at ? `Execution confirmed ${selected.executed_at}` : 'Awaiting independent checker authorisation.'}</p></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {canSubmitMaker && <Button onClick={() => { setUtr(''); setPrincipal(toRupees(selected.principal_paise)); setAicteShare(toRupees(selected.aicte_share_paise)); setExecutionDate(''); setMakerOpen(true); }}>Enter execution details</Button>}
            {canSubmitChecker && <><Button onClick={() => setCheckerDecision('AUTHORISE')}>Authorise execution</Button><Button variant="outline" onClick={() => setCheckerDecision('RETURN')}>Return to maker</Button></>}
            {selected.status === 'EXECUTED' && <Badge tone="success">Execution complete · replay prevented</Badge>}
            {!canSubmitMaker && !canSubmitChecker && selected.status !== 'EXECUTED' && <p className="self-center text-xs text-slate-500">Available actions depend on your bank role and the letter state.</p>}
          </div>
        </div>}
      </div>}
      <Modal open={makerOpen} title="Submit bank execution" description="Enter the bank remittance details. Values are checked against the signed release letter." onClose={() => setMakerOpen(false)} footer={<><Button variant="secondary" onClick={() => setMakerOpen(false)}>Cancel</Button><Button disabled={actionMutation.isPending} onClick={() => void submitMaker()}>Submit as maker</Button></>}>
        <div className="space-y-3">
          <label className="field-label">UTR<input className="input-control mt-1.5" value={utr} onChange={(event) => setUtr(event.target.value)} minLength={6} required /></label>
          <label className="field-label">Principal (₹)<input className="input-control mt-1.5" type="number" min="0" step="0.01" value={principal} onChange={(event) => setPrincipal(event.target.value)} required /></label>
          <label className="field-label">AICTE share (₹)<input className="input-control mt-1.5" type="number" min="0" step="0.01" value={aicteShare} onChange={(event) => setAicteShare(event.target.value)} required /></label>
          <label className="field-label">Execution date<input className="input-control mt-1.5" type="date" value={executionDate} onChange={(event) => setExecutionDate(event.target.value)} required /></label>
        </div>
      </Modal>
      <Modal open={checkerDecision !== null} title={checkerDecision === 'AUTHORISE' ? 'Authorise execution' : 'Return execution to maker'} description="The checker must be a different user from the maker; replayed execution is rejected." onClose={() => setCheckerDecision(null)} footer={<><Button variant="secondary" onClick={() => setCheckerDecision(null)}>Cancel</Button><Button variant={checkerDecision === 'AUTHORISE' ? 'primary' : 'danger'} disabled={actionMutation.isPending || checkerDecision === 'RETURN' && !remarks.trim()} onClick={() => void submitChecker()}>{checkerDecision === 'AUTHORISE' ? 'Authorise' : 'Return to maker'}</Button></>}>
        <label className="field-label">Checker remarks<textarea className="input-control mt-1.5 min-h-20" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder={checkerDecision === 'RETURN' ? 'Required: explain what the maker must correct' : 'Optional checker remarks'} /></label>
      </Modal>
    </Card>
  );
}
