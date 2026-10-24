import { Check, CircleDashed, ShieldCheck } from 'lucide-react';
import { humanizeEnum } from '../api/format';

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
  const detail = trustDetails[trust];
  const Icon = detail.icon;
  const tooltip = [
    detail.label,
    source && `Source: ${source}`,
    evidenceRef && `Evidence: ${evidenceRef}`,
    setAt && `Set: ${setAt}`,
  ].filter(Boolean).join('\n');
  return (
    <span className={`trust-badge ${detail.className}`} title={tooltip} aria-label={`${humanizeEnum(trust)}${source ? `, source ${source}` : ''}`}>
      <Icon size={compact ? 12 : 14} />
      {!compact && <span>{detail.label}</span>}
    </span>
  );
}
