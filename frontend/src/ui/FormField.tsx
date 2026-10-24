import type { InputHTMLAttributes, ReactNode } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  suffix?: ReactNode;
}

export function FormField({ label, hint, error, suffix, className = '', id, name, ...inputProps }: FormFieldProps) {
  const inputId = id ?? name ?? label.toLowerCase().replace(/\s+/g, '-');
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="field-label">{label}</label>
      <div className="relative mt-1.5">
        <input {...inputProps} id={inputId} name={name} aria-invalid={Boolean(error)} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined} className={`input-control ${suffix ? 'pr-16' : ''} ${className}`} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{suffix}</span>}
      </div>
      {hint && <p id={hintId} className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
