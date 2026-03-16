import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SlideOverProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}

export function SlideOver({ title, subtitle, children, onClose }: SlideOverProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <div className="absolute inset-y-0 right-0 flex w-full justify-end md:max-w-[720px]">
        <div className="flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-[#fcfaf4] shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 md:px-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-300 bg-white p-2 text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
              aria-label="Close detail panel"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
