import { Check, CircleDashed, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../shell/language';

export type TrustLevel = 'L0_CLAIMED' | 'L1_ATTESTED' | 'L2_BANK_CONFIRMED';

const trustDetails: Record<TrustLevel, { label: string; className: string; icon: typeof CircleDashed }> = {
  L0_CLAIMED: { label: 'Claimed', className: 'trust-l0', icon: CircleDashed },
  L1_ATTESTED: { label: 'Attested', className: 'trust-l1', icon: ShieldCheck },
  L2_BANK_CONFIRMED: { label: 'Bank confirmed', className: 'trust-l2', icon: Check },
};

export function TrustBadge({
  trust,
  source,
  evidenceRef,
  setAt,
  compact = false,
}: {
  trust: TrustLevel;
  source?: string;
  evidenceRef?: string;
  setAt?: string;
  compact?: boolean;
}) {
  const { t, label } = useLanguage();
  const detail = trustDetails[trust];
  const Icon = detail.icon;
  const tooltip = [
    label(trust),
    source && t('trust.source', { source }),
    evidenceRef && t('trust.evidence', { evidence: evidenceRef }),
    setAt && t('trust.set', { date: setAt }),
  ].filter(Boolean).join('\n');
  return (
    <span className={`trust-badge ${detail.className}`} title={tooltip} aria-label={`${label(trust)}${source ? `, ${t('trust.source', { source })}` : ''}`}>
      <Icon size={compact ? 12 : 14} />
      {!compact && <span>{label(trust)}</span>}
    </span>
  );
}
