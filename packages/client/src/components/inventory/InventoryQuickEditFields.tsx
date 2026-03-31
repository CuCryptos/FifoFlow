import { useEffect, useState } from 'react';
import type { Unit } from '@fifoflow/shared';
import { useUpdateItem } from '../../hooks/useItems';

export type InventoryQuickEditableTextField = 'name';
export type InventoryQuickEditableNumberField = 'current_qty' | 'reorder_level' | 'reorder_qty' | 'qty_per_unit' | 'order_unit_price';
export type InventoryQuickEditableSelectField = 'order_unit' | 'vendor_id';

export function InventoryQuickEditTextField({
  itemId,
  field,
  value,
  label,
  placeholder,
}: {
  itemId: number;
  field: InventoryQuickEditableTextField;
  value: string;
  label: string;
  placeholder?: string;
}) {
  const updateItem = useUpdateItem();
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (!next) {
      setDraft(value);
      setStatus('error');
      window.setTimeout(() => setStatus('idle'), 1800);
      return;
    }
    if (next === value) {
      setStatus('idle');
      return;
    }
    setStatus('saving');
    updateItem.mutate(
      { id: itemId, data: { [field]: next } },
      {
        onSuccess: () => {
          setStatus('saved');
          window.setTimeout(() => setStatus('idle'), 1200);
        },
        onError: () => {
          setDraft(value);
          setStatus('error');
          window.setTimeout(() => setStatus('idle'), 1800);
        },
      },
    );
  };

  return (
    <label className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span>{label}</span>
        {status !== 'idle' && (
          <span className={status === 'saving' ? 'text-amber-700' : status === 'saved' ? 'text-emerald-700' : 'text-rose-700'}>
            {status}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 focus-within:border-slate-400">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              (event.currentTarget as HTMLInputElement).blur();
            }
            if (event.key === 'Escape') {
              setDraft(value);
              setStatus('idle');
              (event.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
          aria-label={label}
        />
      </div>
    </label>
  );
}

export function InventoryQuickEditNumberField({
  itemId,
  field,
  value,
  label,
  suffix,
  step = 'any',
  min = '0',
}: {
  itemId: number;
  field: InventoryQuickEditableNumberField;
  value: number | null;
  label: string;
  suffix?: string;
  step?: string;
  min?: string;
}) {
  const updateItem = useUpdateItem();
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    const parsed = next === '' ? null : Number(next);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setDraft(value == null ? '' : String(value));
      setStatus('error');
      window.setTimeout(() => setStatus('idle'), 1500);
      return;
    }
    if ((value == null ? null : value) === parsed) {
      setStatus('idle');
      return;
    }
    setStatus('saving');
    updateItem.mutate(
      { id: itemId, data: { [field]: parsed } },
      {
        onSuccess: () => {
          setStatus('saved');
          window.setTimeout(() => setStatus('idle'), 1200);
        },
        onError: () => {
          setDraft(value == null ? '' : String(value));
          setStatus('error');
          window.setTimeout(() => setStatus('idle'), 1800);
        },
      },
    );
  };

  return (
    <label className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span>{label}</span>
        {status !== 'idle' && (
          <span className={status === 'saving' ? 'text-amber-700' : status === 'saved' ? 'text-emerald-700' : 'text-rose-700'}>
            {status}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 focus-within:border-slate-400">
        <input
          type="number"
          min={min}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              (event.currentTarget as HTMLInputElement).blur();
            }
            if (event.key === 'Escape') {
              setDraft(value == null ? '' : String(value));
              setStatus('idle');
              (event.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
          aria-label={label}
        />
        {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}

export function InventoryQuickEditSelectField({
  itemId,
  field,
  value,
  label,
  emptyLabel,
  options,
}: {
  itemId: number;
  field: InventoryQuickEditableSelectField;
  value: number | Unit | null;
  label: string;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  const updateItem = useUpdateItem();
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed: number | string | null = raw === ''
      ? null
      : field === 'vendor_id'
        ? Number(raw)
        : raw;
    const current = value == null ? null : value;
    if (current === parsed) {
      return;
    }
    setStatus('saving');
    updateItem.mutate(
      { id: itemId, data: { [field]: parsed } },
      {
        onSuccess: () => {
          setStatus('saved');
          window.setTimeout(() => setStatus('idle'), 1200);
        },
        onError: () => {
          setDraft(value == null ? '' : String(value));
          setStatus('error');
          window.setTimeout(() => setStatus('idle'), 1800);
        },
      },
    );
  };

  return (
    <label className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span>{label}</span>
        {status !== 'idle' && (
          <span className={status === 'saving' ? 'text-amber-700' : status === 'saved' ? 'text-emerald-700' : 'text-rose-700'}>
            {status}
          </span>
        )}
      </div>
      <select
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-900 outline-none focus:border-slate-400"
        aria-label={label}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
