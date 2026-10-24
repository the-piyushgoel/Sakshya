import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function StatCard({
  label,
  value,
  trend,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  trend?: string;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  return (
    <section className={`stat-card stat-${tone}`}>
      <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-slate-500">{label}</p>{icon && <span className="stat-icon">{icon}</span>}</div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-navy-900">{value}</p>
      {trend && <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">{tone === 'success' ? <ArrowUpRight size={13} className="text-emerald-600" /> : tone === 'danger' ? <ArrowDownRight size={13} className="text-red-600" /> : null}{trend}</p>}
    </section>
  );
}
