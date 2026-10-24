import type { ReactNode } from 'react';
import { humanizeEnum } from '../api/format';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function Badge({ children, tone = 'neutral', icon }: { children: ReactNode; tone?: BadgeTone; icon?: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{icon}{children}</span>;
}

const stateTones: Record<string, BadgeTone> = {
  ACTIVE: 'success', COVERED: 'success', CONFIRMED: 'success', CLOSED: 'success', ELIGIBLE: 'success', EXECUTED: 'success',
  PENDING_DEPOSIT: 'warning', PARTIALLY_COVERED: 'warning', BANK_PENDING: 'warning', RENEWAL_DUE: 'warning', SCRUTINY: 'warning',
  DISCREPANCY: 'danger', LAPSED: 'danger', REJECTED: 'danger', QUARANTINED: 'danger', INELIGIBLE: 'danger',
  SUBMITTED: 'info', AUTO_CHECKING: 'info', RELEASE_IN_PROGRESS: 'info', RELEASED: 'info',
};

export function StatusPill({ value }: { value: string }) {
  return <Badge tone={stateTones[value] ?? 'neutral'}>{humanizeEnum(value)}</Badge>;
}
