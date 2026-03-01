import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES } from '@fifoflow/shared';
import type { Category } from '@fifoflow/shared';
import {
  useCloseCountSession,
  useCountSessionChecklist,
  useCountSessionEntries,
  useCountSessions,
  useCreateCountSession,
  useOpenCountSession,
  useRecordCountEntry,
} from '../hooks/useCountSessions';

function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, '');
}

export function Counts() {
  const { data: sessions } = useCountSessions();
  const { data: openSession } = useOpenCountSession();
  const { data: entries } = useCountSessionEntries(openSession?.id);
  const { data: checklist } = useCountSessionChecklist(openSession?.id);

  const createSession = useCreateCountSession();
  const recordEntry = useRecordCountEntry();
  const closeSession = useCloseCountSession();

  const [sessionName, setSessionName] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionTemplateCategory, setSessionTemplateCategory] = useState<Category | ''>('');
  const [entryItemId, setEntryItemId] = useState('');
  const [entryCountedQty, setEntryCountedQty] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [forceClose, setForceClose] = useState(false);

  const pendingChecklist = useMemo(
    () => (checklist ?? []).filter((item) => !item.counted),
    [checklist],
  );
  const countedChecklist = useMemo(
    () => (checklist ?? []).filter((item) => item.counted),
    [checklist],
  );
  const selectableItemIds = useMemo(
    () => new Set(pendingChecklist.map((item) => item.item_id)),
    [pendingChecklist],
  );
  const selectedChecklistItem = useMemo(
    () => pendingChecklist.find((item) => item.item_id === Number(entryItemId)),
    [entryItemId, pendingChecklist],
  );

  const totalChecklistItems = checklist?.length ?? 0;
  const countedItems = countedChecklist.length;
  const remainingItems = pendingChecklist.length;
  const progressPercent = totalChecklistItems > 0
    ? Math.round((countedItems / totalChecklistItems) * 100)
    : 0;

  useEffect(() => {
    if (!openSession) {
      setEntryItemId('');
      return;
    }
    if (pendingChecklist.length === 0) {
      setEntryItemId('');
      return;
    }
    if (!entryItemId || !selectableItemIds.has(Number(entryItemId))) {
      setEntryItemId(String(pendingChecklist[0].item_id));
    }
  }, [openSession, pendingChecklist, entryItemId, selectableItemIds]);

  const submitCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) return;
    createSession.mutate(
      {
        name: sessionName.trim(),
        template_category: sessionTemplateCategory || null,
        notes: sessionNotes.trim() || null,
      },
      {
        onSuccess: () => {
          setSessionName('');
          setSessionNotes('');
          setSessionTemplateCategory('');
        },
      },
    );
  };

  const submitRecordEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openSession) return;
    const itemId = Number(entryItemId);
    const countedQty = Number(entryCountedQty);
    if (!Number.isFinite(itemId) || itemId <= 0) return;
    if (!Number.isFinite(countedQty) || countedQty < 0) return;

    recordEntry.mutate(
      {
        sessionId: openSession.id,
        data: {
          item_id: itemId,
          counted_qty: countedQty,
          notes: entryNotes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setEntryItemId('');
          setEntryCountedQty('');
          setEntryNotes('');
        },
      },
    );
  };

  const submitCloseSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openSession) return;
    closeSession.mutate(
      {
        sessionId: openSession.id,
        data: {
          notes: closeNotes.trim() || null,
          ...(forceClose ? { force_close: true } : {}),
        },
      },
      {
        onSuccess: () => {
          setCloseNotes('');
          setForceClose(false);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Count Sessions</h1>
      </div>

      {!openSession ? (
        <div className="bg-navy-light border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-text-secondary mb-3">Open New Session</h2>
          <form onSubmit={submitCreateSession} className="grid md:grid-cols-[2fr_2fr_3fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Session Name</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Weekly count - Bar"
                className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Count Template</label>
              <select
                value={sessionTemplateCategory}
                onChange={(e) => setSessionTemplateCategory(e.target.value as Category | '')}
                className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
              >
                <option value="">All Inventory Items</option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Notes (optional)</label>
              <input
                type="text"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
              />
            </div>
            <button
              type="submit"
              disabled={createSession.isPending}
              className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {createSession.isPending ? 'Opening...' : 'Open Session'}
            </button>
          </form>
          {createSession.error && (
            <div className="text-accent-red text-xs mt-2">{createSession.error.message}</div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-navy-light border border-border rounded-lg p-4 flex flex-wrap gap-4 justify-between items-start">
            <div>
              <h2 className="text-sm font-medium text-text-secondary">Open Session</h2>
              <p className="text-text-primary mt-1">{openSession.name}</p>
              <p className="text-xs text-text-secondary mt-1">
                Template: {openSession.template_category ?? 'All Inventory Items'}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                Opened {new Date(openSession.opened_at).toLocaleString()}
              </p>
              {openSession.notes && (
                <p className="text-xs text-text-secondary mt-1">{openSession.notes}</p>
              )}
            </div>
            <div className="min-w-56">
              <div className="text-sm text-text-secondary">
                Progress: <span className="text-text-primary">{countedItems}/{totalChecklistItems}</span>
                {totalChecklistItems > 0 && <span className="text-text-secondary"> ({progressPercent}%)</span>}
              </div>
              <div className="h-2 rounded bg-navy mt-2 overflow-hidden">
                <div
                  className="h-full bg-accent-green transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-xs text-text-secondary mt-2">
                Remaining: <span className="text-text-primary">{remainingItems}</span>
              </div>
            </div>
          </div>

          <div className="bg-navy-light border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Record Item Count</h3>
            <form onSubmit={submitRecordEntry} className="grid md:grid-cols-[2fr_1fr_3fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Item</label>
                <select
                  value={entryItemId}
                  onChange={(e) => setEntryItemId(e.target.value)}
                  className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
                  required
                >
                  <option value="">Select item...</option>
                  {pendingChecklist.map((item) => (
                    <option key={item.item_id} value={item.item_id}>
                      {item.item_name} ({formatQty(item.current_qty)} {item.item_unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Counted Qty</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={entryCountedQty}
                  onChange={(e) => setEntryCountedQty(e.target.value)}
                  className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={entryNotes}
                  onChange={(e) => setEntryNotes(e.target.value)}
                  className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
                />
              </div>
              <button
                type="submit"
                disabled={recordEntry.isPending || pendingChecklist.length === 0}
                className="bg-accent-amber text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {recordEntry.isPending ? 'Saving...' : 'Add Count'}
              </button>
            </form>
            {selectedChecklistItem && (
              <div className="text-xs text-text-secondary mt-2">
                Current stock: {formatQty(selectedChecklistItem.current_qty)} {selectedChecklistItem.item_unit}
              </div>
            )}
            {pendingChecklist.length === 0 && (
              <div className="text-xs text-accent-green mt-2">All checklist items are counted.</div>
            )}
            {recordEntry.error && (
              <div className="text-accent-red text-xs mt-2">{recordEntry.error.message}</div>
            )}
          </div>

          <div className="bg-navy-light border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Session Checklist</h3>
            {checklist && checklist.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-secondary border-b border-border">
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Item</th>
                      <th className="py-2 pr-4 font-medium text-right">Current Qty</th>
                      <th className="py-2 pr-4 font-medium text-right">Counted Qty</th>
                      <th className="py-2 pr-4 font-medium text-right">Delta</th>
                      <th className="py-2 pr-4 font-medium">Counted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklist.map((item) => (
                      <tr key={item.item_id} className="border-b border-border/50">
                        <td className="py-2 pr-4">
                          <span className={item.counted ? 'text-accent-green' : 'text-accent-amber'}>
                            {item.counted ? 'COUNTED' : 'PENDING'}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-text-primary">{item.item_name}</td>
                        <td className="py-2 pr-4 text-right text-text-primary">
                          {formatQty(item.current_qty)} {item.item_unit}
                        </td>
                        <td className="py-2 pr-4 text-right text-text-primary">
                          {item.counted_qty === null ? '\u2014' : `${formatQty(item.counted_qty)} ${item.item_unit}`}
                        </td>
                        <td className="py-2 pr-4 text-right text-text-primary">
                          {item.delta === null ? '\u2014' : formatQty(item.delta)}
                        </td>
                        <td className="py-2 pr-4 text-text-secondary">
                          {item.counted_at ? new Date(item.counted_at).toLocaleString() : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">
                No checklist items found for this session.
              </div>
            )}
          </div>

          <div className="bg-navy-light border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Session Entries</h3>
            {entries && entries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-secondary border-b border-border">
                      <th className="py-2 pr-4 font-medium">Item</th>
                      <th className="py-2 pr-4 font-medium text-right">Previous</th>
                      <th className="py-2 pr-4 font-medium text-right">Counted</th>
                      <th className="py-2 pr-4 font-medium text-right">Delta</th>
                      <th className="py-2 pr-4 font-medium">Notes</th>
                      <th className="py-2 pr-4 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-text-primary">{entry.item_name}</td>
                        <td className="py-2 pr-4 text-right text-text-primary">
                          {formatQty(entry.previous_qty)} {entry.item_unit}
                        </td>
                        <td className="py-2 pr-4 text-right text-text-primary">
                          {formatQty(entry.counted_qty)} {entry.item_unit}
                        </td>
                        <td className="py-2 pr-4 text-right text-text-primary">{formatQty(entry.delta)}</td>
                        <td className="py-2 pr-4 text-text-secondary">{entry.notes ?? '\u2014'}</td>
                        <td className="py-2 pr-4 text-text-secondary">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">No entries yet.</div>
            )}
          </div>

          <div className="bg-navy-light border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Close Session</h3>
            <form onSubmit={submitCloseSession} className="space-y-3">
              <div className="flex-1 min-w-60">
                <label className="block text-xs text-text-secondary mb-1">Close Notes (optional)</label>
                <input
                  type="text"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={forceClose}
                  onChange={(e) => setForceClose(e.target.checked)}
                  className="accent-accent-red"
                />
                Force close with remaining uncounted items
              </label>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-text-secondary">
                  {remainingItems > 0
                    ? `This session still has ${remainingItems} uncounted items.`
                    : 'All items counted. Session can be closed normally.'}
                </div>
                <button
                  type="submit"
                  disabled={closeSession.isPending || (remainingItems > 0 && !forceClose)}
                  className="bg-accent-red text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {closeSession.isPending ? 'Closing...' : 'Close Session'}
                </button>
              </div>
            </form>
            {closeSession.error && (
              <div className="text-accent-red text-xs mt-2">{closeSession.error.message}</div>
            )}
          </div>
        </div>
      )}

      <div className="bg-navy-light border border-border rounded-lg p-4">
        <h2 className="text-sm font-medium text-text-secondary mb-3">Session History</h2>
        {sessions && sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary border-b border-border">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Template</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Opened</th>
                  <th className="py-2 pr-4 font-medium">Closed</th>
                  <th className="py-2 pr-4 font-medium text-right">Completion</th>
                  <th className="py-2 pr-4 font-medium text-right">Remaining</th>
                  <th className="py-2 pr-4 font-medium text-right">Total Variance</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-text-primary">{session.name}</td>
                    <td className="py-2 pr-4 text-text-secondary">
                      {session.template_category ?? 'All Inventory'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={session.status === 'open' ? 'text-accent-green' : 'text-text-secondary'}>
                        {session.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-text-secondary">{new Date(session.opened_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-text-secondary">
                      {session.closed_at ? new Date(session.closed_at).toLocaleString() : '\u2014'}
                    </td>
                    <td className="py-2 pr-4 text-right text-text-primary">
                      {session.template_items_count > 0
                        ? `${session.counted_items_count}/${session.template_items_count}`
                        : String(session.entries_count)}
                    </td>
                    <td className="py-2 pr-4 text-right text-text-primary">{session.remaining_items_count}</td>
                    <td className="py-2 pr-4 text-right text-text-primary">{session.total_variance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-text-secondary">No sessions yet.</div>
        )}
      </div>
    </div>
  );
}
