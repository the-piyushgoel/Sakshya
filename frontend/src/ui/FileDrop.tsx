import { useRef, useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { useLanguage } from '../shell/language';

export function FileDrop({
  accept = 'application/pdf',
  maxSizeMB = 15,
  fileName,
  onFile,
  disabled = false,
}: {
  accept?: string;
  maxSizeMB?: number;
  fileName?: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const chooseFile = (file?: File) => {
    if (!file) return;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(t('file.tooLarge', { size: maxSizeMB }));
      return;
    }
    if (accept.includes('pdf') && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError(t('file.pdfOnly'));
      return;
    }
    setError('');
    onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept={accept} className="sr-only" disabled={disabled} onChange={(event) => chooseFile(event.target.files?.[0])} />
      <button type="button" disabled={disabled} className={`file-drop ${dragging ? 'file-drop-active' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <span className="file-drop-icon"><FileUp size={20} /></span>
        <span className="font-semibold text-navy-800">{fileName ?? t('file.choose')}</span>
        <span className="mt-1 text-xs text-slate-500">{t('file.pdfLimit', { size: maxSizeMB })}</span>
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
