import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
  padding?: 'sm' | 'md' | 'none';
}

export function Card({ title, description, action, padding = 'md', className = '', children, ...props }: CardProps) {
  return (
    <section {...props} className={`surface-card ${padding === 'none' ? 'p-0' : padding === 'sm' ? 'p-4' : 'p-5 sm:p-6'} ${className}`}>
      {(title || description || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>{title && <h2 className="section-title">{title}</h2>}{description && <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
