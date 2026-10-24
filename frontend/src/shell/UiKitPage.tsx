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
import { useLanguage } from './language';

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

export function UiKitPage() {
  const { language, t } = useLanguage();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpMessage, setStepUpMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const { pushToast } = useToasts();
  const timelineEvents = [
    { title: t('ui.documentSubmitted'), description: t('ui.documentSubmittedDescription'), date: `${formatDate('2026-10-24', language)} · 10:15`, tone: 'neutral' as const },
    { title: t('ui.bankConfirmationRequested'), description: t('ui.bankConfirmationDescription'), date: `${formatDate('2026-10-24', language)} · 11:02`, tone: 'warning' as const },
    { title: t('ui.bankConfirmed'), description: t('ui.bankConfirmedDescription'), date: `${formatDate('2026-10-24', language)} · 13:45`, tone: 'success' as const },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="page-heading">
        <div>
          <div className="eyebrow">{t('ui.foundation')}</div>
          <h1>{t('ui.title')}</h1>
          <p>{t('ui.description')}</p>
        </div>
        <Badge tone="info" icon={<ShieldCheck size={13} />}>{t('ui.designVersion')}</Badge>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('ui.totalSecured')} value={formatINR(655000000)} trend={t('ui.illustrative')} icon={<ShieldCheck size={18} />} />
        <StatCard label={t('ui.activeInstruments')} value="24" trend={t('ui.acrossInstitutes')} />
        <StatCard label={t('ui.awaitingBank')} value="05" trend={t('ui.needAttention')} tone="warning" />
        <StatCard label={t('ui.recordAccuracy')} value="92.4%" trend={t('ui.bankConfirmedFields')} tone="success" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card title={t('ui.buttonsFeedback')} description={t('ui.buttonsDescription')}>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => pushToast({ title: t('ui.actionComplete'), description: t('ui.successToast'), tone: 'success' })}>{t('ui.primaryAction')}</Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>{t('ui.openModal')}</Button>
            <Button variant="outline" onClick={() => setStepUpOpen(true)}>{t('ui.stepUpAction')}</Button>
            <Button variant="ghost">{t('ui.quietAction')}</Button>
            <Button variant="danger">{t('ui.reject')}</Button>
            <Button disabled>{t('ui.disabled')}</Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {['ACTIVE', 'SUBMITTED', 'BANK_PENDING', 'DISCREPANCY', 'RENEWAL_DUE', 'LAPSED', 'CLOSED'].map((state) => <StatusPill key={state} value={state} />)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="success">{t('ui.verified')}</Badge><Badge tone="warning">{t('ui.needsReview')}</Badge><Badge tone="danger">{t('ui.highRisk')}</Badge><Badge tone="info">{t('ui.information')}</Badge><Badge tone="neutral">{t('ui.draft')}</Badge>
          </div>
        </Card>
        <Card title={t('ui.fieldTrust')} description={t('ui.fieldTrustDescription')}>
          <div className="space-y-3">
            <TrustBadge trust="L0_CLAIMED" source={t('ui.instituteUpload')} evidenceRef="doc/8f3a" setAt={formatDate('2026-10-24', language)} />
            <TrustBadge trust="L1_ATTESTED" source={t('ui.officerReview')} evidenceRef="case/184" setAt={formatDate('2026-10-24', language)} />
            <TrustBadge trust="L2_BANK_CONFIRMED" source="BRB maker + checker" evidenceRef="bank/392" setAt="24 Oct 2026" />
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><Info size={16} className="mr-2 inline text-navy-600" />{t('ui.recordExplainsEvidence')}</div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t('ui.recordsTable')} description={t('ui.recordsTableDescription')}>
          <DataTable<DemoRow>
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'fdr', header: t('ui.fdrNumber'), render: (row) => <span className="font-semibold text-navy-800">{row.fdr}</span> },
              { key: 'amount', header: t('ui.principal'), render: (row) => row.amount },
              { key: 'status', header: t('ui.status'), render: (row) => <StatusPill value={row.state} /> },
              { key: 'trust', header: t('ui.trust'), render: (row) => <TrustBadge trust={row.trust} compact /> },
            ]}
          />
        </Card>
        <Card title={t('ui.navigationTabs')} description={t('ui.tabsDescription')}>
          <Tabs
            tabs={[
              { id: 'summary', label: t('ui.summary'), content: <p className="py-4 text-sm leading-6 text-slate-600">{t('ui.summaryContent')}</p> },
              { id: 'checks', label: t('ui.checks'), content: <p className="py-4 text-sm leading-6 text-slate-600">{t('ui.checksContent')}</p> },
              { id: 'activity', label: t('ui.activity'), content: <p className="py-4 text-sm leading-6 text-slate-600">{t('ui.activityContent')}</p> },
            ]}
          />
          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
            <span className="text-slate-600">{t('ui.viewAudit')}</span><button className="inline-flex items-center gap-1 font-semibold text-navy-700">{t('ui.open')} <ChevronRight size={15} /></button>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t('ui.timelineLoading')} description={t('ui.timelineDescription')}>
          <Timeline events={timelineEvents} />
          <div className="mt-6 space-y-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-10" /><Skeleton className="h-10 w-5/6" /></div>
        </Card>
        <Card title={t('ui.formsUploads')} description={t('ui.formsDescription')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('ui.fdrNumber')} name="fdrNumber" placeholder={t('ui.enterFdr')} hint={t('ui.asPrinted')} />
            <FormField label={t('ui.principal')} name="principal" type="number" placeholder={t('ui.amountPaise')} error={t('ui.positiveAmount')} />
          </div>
          <div className="mt-4">
            <FileDrop accept=".pdf,application/pdf" maxSizeMB={15} fileName={fileName} onFile={(file) => setFileName(file.name)} />
          </div>
          {fileName && <p className="mt-2 text-xs text-slate-500">{t('ui.selected', { file: fileName })}</p>}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t('ui.emptyDate')} description={t('ui.emptyDescription')}>
          <EmptyState title={t('ui.noDiscrepancies')} description={t('ui.noOpenFlags')} icon={<Check size={22} />} action={<Button size="sm" variant="secondary">{t('ui.viewCleared')}</Button>} />
          <p className="mt-4 text-xs text-slate-500">{t('ui.dateExample', { date: formatDate('2026-10-24T10:15:00Z', language) })}</p>
        </Card>
        <Card title={t('ui.responsive')} description={t('ui.responsiveDescription')}>
          <div className="rounded-xl bg-navy-800 p-5 text-white">
            <div className="flex items-start justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">{t('ui.coverage')}</span><p className="mt-2 text-2xl font-bold">{formatINR(450000000)}</p><p className="mt-1 text-xs text-slate-300">{t('ui.confirmedOf', { required: formatINR(600000000) })}</p></div><div className="rounded-xl bg-white/10 p-3"><ShieldCheck size={21} /></div></div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full w-3/4 rounded-full bg-emerald-400" /></div>
            <div className="mt-3 flex justify-between text-xs text-slate-300"><span>{t('ui.covered', { percent: 75 })}</span><span>{t('ui.illustrative')}</span></div>
          </div>
        </Card>
      </div>

      <Modal open={modalOpen} title={t('ui.modalTitle')} description={t('ui.modalDescription')} onClose={() => setModalOpen(false)} footer={<Button onClick={() => setModalOpen(false)}>{t('nav.cancel')}</Button>}>
        <p className="text-sm leading-6 text-slate-600">{t('ui.modalContent')}</p>
      </Modal>
      <StepUpModal open={stepUpOpen} onClose={() => setStepUpOpen(false)} onSubmit={async (pin) => { setStepUpMessage(t('ui.stepUpMessage', { digits: pin.length })); setStepUpOpen(false); }} />
      {stepUpMessage && <div role="status" className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-navy-900 px-4 py-3 text-sm text-white shadow-lg">{stepUpMessage}</div>}
    </div>
  );
}
