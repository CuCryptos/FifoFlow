import { useEffect, useState } from 'react';
import { useCreateTransaction } from '../hooks/useTransactions';
import { TRANSACTION_TYPES, TRANSACTION_REASONS } from '@fifoflow/shared';
import { getCompatibleUnits, tryConvertQuantity } from '@fifoflow/shared';
import type { Item } from '@fifoflow/shared';
import type { TransactionType, TransactionReason, Unit } from '@fifoflow/shared';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function TransactionForm({ item }: { item: Item }) {
  const [type, setType] = useState<TransactionType>('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<TransactionReason>('Received');
  const [notes, setNotes] = useState('');
  const [unit, setUnit] = useState<Unit>(item.unit);
  const createTx = useCreateTransaction();
  const packaging = {
    baseUnit: item.unit,
    orderUnit: item.order_unit,
    innerUnit: item.inner_unit,
    qtyPerUnit: item.qty_per_unit,
    itemSizeValue: item.item_size_value,
    itemSizeUnit: item.item_size_unit,
  };
  const unitOptions = getCompatibleUnits(item.unit, packaging);

  useEffect(() => {
    setUnit(item.unit);
  }, [item.id, item.unit]);

  const parsedQty = Number(quantity);
  const hasQty = quantity.trim() !== '' && Number.isFinite(parsedQty) && parsedQty > 0;
  const notesRequired = reason === 'Wasted' || reason === 'Adjustment' || reason === 'Transferred';
  const convertedQty = hasQty
    ? tryConvertQuantity(parsedQty, unit, item.unit, packaging)
    : null;
  const priceUnit = item.inner_unit ?? item.order_unit ?? item.unit;
  const insideUnitPrice =
    item.order_unit_price != null
      ? item.order_unit_price / ((item.qty_per_unit != null && item.qty_per_unit > 0) ? item.qty_per_unit : 1)
      : null;
  const priceUnitFactor = hasQty
    ? tryConvertQuantity(1, unit, priceUnit, packaging)
    : null;
  const estimatedTotalCost =
    hasQty && insideUnitPrice != null && priceUnitFactor != null
      ? parsedQty * priceUnitFactor * insideUnitPrice
      : null;
  const helperText = !hasQty
    ? null
    : convertedQty === null
      ? `Cannot convert ${unit} to ${item.unit} for this item.`
      : unit === item.unit
        ? `Will ${type === 'in' ? 'add' : 'remove'} ${convertedQty} ${item.unit}.`
        : `${parsedQty} ${unit} = ${convertedQty} ${item.unit}.`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTx.mutate(
      {
        itemId: item.id,
        data: {
          type,
          quantity: Number(quantity),
          unit,
          reason,
          notes: notes || null,
        },
      },
      {
        onSuccess: () => {
          setQuantity('');
          setNotes('');
        },
      }
    );
  };

  return (
    <div className="bg-navy-light border border-border rounded-lg p-4">
      <h2 className="text-sm font-medium text-text-secondary mb-3">Log Transaction</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        <div className="flex rounded overflow-hidden border border-border">
          {TRANSACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                type === t
                  ? t === 'in' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          type="number"
          step="any"
          min="0.01"
          placeholder="Qty"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          className="w-24 bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as Unit)}
          className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        >
          {unitOptions.map((optionUnit) => (
            <option key={optionUnit} value={optionUnit}>{optionUnit}</option>
          ))}
        </select>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as TransactionReason)}
          className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        >
          {TRANSACTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          type="text"
          placeholder={notesRequired ? 'Notes (required for this reason)' : 'Notes (optional)'}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          required={notesRequired}
          className="flex-1 min-w-32 bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-green"
        />
        <button
          type="submit"
          disabled={createTx.isPending}
          className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {createTx.isPending ? 'Logging...' : 'Log'}
        </button>
      </form>
      {helperText && (
        <div className={`text-xs mt-2 ${convertedQty === null ? 'text-accent-red' : 'text-text-secondary'}`}>
          {helperText}
          {estimatedTotalCost != null && (
            <span className="ml-2 text-text-primary">
              Est. total: {formatCurrency(estimatedTotalCost)}
            </span>
          )}
        </div>
      )}
      {createTx.error && (
        <div className="text-accent-red text-xs mt-2">{createTx.error.message}</div>
      )}
    </div>
  );
}
