import type { ReactNode } from 'react';

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-5 py-9 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-navy-50 text-navy-700">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
