import { Check, Circle, Clock3 } from 'lucide-react';
import { useLanguage } from '../shell/language';

export interface TimelineEvent {
  title: string;
  description?: string;
  date?: string;
  tone?: 'neutral' | 'warning' | 'success' | 'danger';
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const { t } = useLanguage();
  if (events.length === 0) return <p className="py-5 text-sm text-slate-500">{t('timeline.empty')}</p>;
  return (
    <ol className="space-y-0">
      {events.map((event, index) => (
        <li key={`${event.title}-${index}`} className="timeline-item">
          <span className={`timeline-marker timeline-${event.tone ?? 'neutral'}`}>{event.tone === 'success' ? <Check size={12} /> : event.tone === 'warning' ? <Clock3 size={12} /> : <Circle size={8} />}</span>
          {index < events.length - 1 && <span className="timeline-line" />}
          <div className="min-w-0 pb-5"><div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><p className="text-sm font-semibold text-slate-800">{event.title}</p>{event.date && <time className="text-xs text-slate-400">{event.date}</time>}</div>{event.description && <p className="mt-1 text-sm leading-5 text-slate-500">{event.description}</p>}</div>
        </li>
      ))}
    </ol>
  );
}
