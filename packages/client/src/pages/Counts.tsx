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
        <h1 className="text-2xl font-semibold text-text-primary">Count Sessions</h1>
      </div>

      {!openSession ? (
        <div className="bg-bg-card rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-text-primary mb-4">Open New Session</h2>
          <form onSubmit={submitCreateSession} className="grid md:grid-cols-[2fr_2fr_3fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Session Name</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Weekly count - Bar"
                className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Count Template</label>
              <select
                value={sessionTemplateCategory}
                onChange={(e) => setSessionTemplateCategory(e.target.value as Category | '')}
                className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
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
              <label className="block text-xs font-medium text-text-muted mb-1">Notes (optional)</label>
              <input
                type="text"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
              />
            </div>
            <button
              type="submit"
              disabled={createSession.isPending}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-50 transition-colors"
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
          <div className="bg-bg-card rounded-xl shadow-sm p-5 border-l-4 border-accent-green flex flex-wrap gap-4 justify-between items-start">
            <div>
              <h2 className="text-base font-semibold text-text-primary mb-4">Open Session</h2>
              <p className="text-text-primary font-medium">{openSession.name}</p>
              <p className="text-xs text-text-muted mt-1">
                Template: {openSession.template_category ?? 'All Inventory Items'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Opened {new Date(openSession.opened_at).toLocaleString()}
              </p>
              {openSession.notes && (
                <p className="text-xs text-text-muted mt-1">{openSession.notes}</p>
              )}
            </div>
            <div className="min-w-56">
              <div className="text-sm text-text-secondary">
                Progress: <span className="text-text-primary">{countedItems}/{totalChecklistItems}</span>
                {totalChecklistItems > 0 && <span className="text-text-muted"> ({progressPercent}%)</span>}
              </div>
              <div className="h-2.5 rounded-full bg-border mt-2 overflow-hidden">
                <div
                  className="h-full bg-accent-green rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-xs text-text-muted mt-2">
                Remaining: <span className="text-text-primary">{remainingItems}</span>
              </div>
            </div>
          </div>

          <div className="bg-bg-card rounded-xl shadow-sm p-5">
            <h3 className="text-base font-semibold text-text-primary mb-4">Record Item Count</h3>
            <form onSubmit={submitRecordEntry} className="grid md:grid-cols-[2fr_1fr_3fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Item</label>
                <select
                  value={entryItemId}
                  onChange={(e) => setEntryItemId(e.target.value)}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
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
                <label className="block text-xs font-medium text-text-muted mb-1">Counted Qty</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={entryCountedQty}
                  onChange={(e) => setEntryCountedQty(e.target.value)}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={entryNotes}
                  onChange={(e) => setEntryNotes(e.target.value)}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                />
              </div>
              <button
                type="submit"
                disabled={recordEntry.isPending || pendingChecklist.length === 0}
                className="bg-accent-amber text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {recordEntry.isPending ? 'Saving...' : 'Add Count'}
              </button>
            </form>
            {selectedChecklistItem && (
              <div className="text-xs text-text-muted mt-2">
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

          <div className="bg-bg-card rounded-xl shadow-sm p-5">
            <h3 className="text-base font-semibold text-text-primary mb-4">Session Checklist</h3>
            {checklist && checklist.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg-table-header">
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Status</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Item</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Current Qty</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Counted Qty</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Delta</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Counted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklist.map((item) => (
                      <tr key={item.item_id} className="border-b border-border hover:bg-bg-hover transition-colors">
                        <td className="py-2 pr-4">
                          <span className={item.counted
                            ? 'text-xs px-2 py-0.5 rounded-md bg-badge-green-bg text-badge-green-text font-medium'
                            : 'text-xs px-2 py-0.5 rounded-md bg-badge-amber-bg text-badge-amber-text font-medium'
                          }>
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

          <div className="bg-bg-card rounded-xl shadow-sm p-5">
            <h3 className="text-base font-semibold text-text-primary mb-4">Session Entries</h3>
            {entries && entries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg-table-header">
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Item</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Previous</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Counted</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Delta</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Notes</th>
                      <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-border hover:bg-bg-hover transition-colors">
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

          <div className="bg-bg-card rounded-xl shadow-sm p-5">
            <h3 className="text-base font-semibold text-text-primary mb-4">Close Session</h3>
            <form onSubmit={submitCloseSession} className="space-y-3">
              <div className="flex-1 min-w-60">
                <label className="block text-xs font-medium text-text-muted mb-1">Close Notes (optional)</label>
                <input
                  type="text"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
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
                <div className="text-xs text-text-muted">
                  {remainingItems > 0
                    ? `This session still has ${remainingItems} uncounted items.`
                    : 'All items counted. Session can be closed normally.'}
                </div>
                <button
                  type="submit"
                  disabled={closeSession.isPending || (remainingItems > 0 && !forceClose)}
                  className="bg-accent-red text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
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

      <div className="bg-bg-card rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold text-text-primary mb-4">Session History</h2>
        {sessions && sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-table-header">
                  <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Name</th>
                  <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Template</th>
                  <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Status</th>
                  <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Opened</th>
                  <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-left">Closed</th>
                  <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Completion</th>
                  <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Remaining</th>
                  <th className="py-2.5 pr-4 font-medium text-xs uppercase tracking-wide text-text-secondary text-right">Total Variance</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-b border-border hover:bg-bg-hover transition-colors">
                    <td className="py-2 pr-4 text-text-primary">{session.name}</td>
                    <td className="py-2 pr-4 text-text-secondary">
                      {session.template_category ?? 'All Inventory'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={session.status === 'open' ? 'text-accent-green' : 'text-text-muted'}>
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
