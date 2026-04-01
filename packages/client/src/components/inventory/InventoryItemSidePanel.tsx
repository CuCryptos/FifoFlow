import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { Item, ItemStorage, Transaction, Unit } from '@fifoflow/shared';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import { useItemStorage, useReplaceItemStorage, useUpdateItem } from '../../hooks/useItems';
import { useToast } from '../../contexts/ToastContext';
import { InventoryUnitEconomicsSummary, deriveInventoryUnitEconomics } from './InventoryUnitEconomicsSummary';
import { ItemIdentifierEditor } from '../products/ItemIdentifierEditor';

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

type StorageDraftRow = {
  key: string;
  area_id: string;
  quantity: string;
};

function roundStorageQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildStorageDraftRows(item: Item, rows?: ItemStorage[]): StorageDraftRow[] {
  if (rows && rows.length > 0) {
    return rows.map((row) => ({
      key: `area-${row.area_id}`,
      area_id: String(row.area_id),
      quantity: String(row.quantity),
    }));
  }

  if (item.storage_area_id != null && item.current_qty > 0) {
    return [{
      key: `area-${item.storage_area_id}`,
      area_id: String(item.storage_area_id),
      quantity: String(item.current_qty),
    }];
  }

  return [];
}

function normalizeStorageRows(rows: Array<{ area_id: string | number; quantity: string | number }>) {
  return rows
    .map((row) => ({
      area_id: Number(row.area_id),
      quantity: roundStorageQuantity(Number(row.quantity)),
    }))
    .filter((row) => Number.isFinite(row.area_id) && row.area_id > 0 && Number.isFinite(row.quantity) && row.quantity > 0)
    .sort((a, b) => a.area_id - b.area_id);
}

export function InventoryItemSidePanel({
  item,
  transactions,
  areas,
  vendors,
  venues,
  categories,
}: {
  item: Item;
  transactions: Transaction[];
  areas: Array<{ id: number; name: string }>;
  vendors: Array<{ id: number; name: string }>;
  venues: Array<{ id: number; name: string }>;
  categories: string[];
}) {
  type InventoryItemPanelDraft = {
    name: string;
    category: Item['category'];
    vendor_id: string;
    venue_id: string;
    storage_area_id: string;
    unit: '' | Unit;
    reorder_level: string;
    reorder_qty: string;
    order_unit: '' | Unit;
    qty_per_unit: string;
    inner_unit: '' | Unit;
    item_size_value: string;
    item_size_unit: '' | Unit;
    order_unit_price: string;
  };
  type DraftField = keyof InventoryItemPanelDraft;
  type FieldSaveState = 'idle' | 'saving' | 'saved' | 'rolled_back';
  const emptyFieldStates = (): Record<DraftField, FieldSaveState> => ({
    name: 'idle',
    category: 'idle',
    vendor_id: 'idle',
    venue_id: 'idle',
    storage_area_id: 'idle',
    unit: 'idle',
    reorder_level: 'idle',
    reorder_qty: 'idle',
    order_unit: 'idle',
    qty_per_unit: 'idle',
    inner_unit: 'idle',
    item_size_value: 'idle',
    item_size_unit: 'idle',
    order_unit_price: 'idle',
  });
  const emptySavedAt = (): Record<DraftField, number | null> => ({
    name: null,
    category: null,
    vendor_id: null,
    venue_id: null,
    storage_area_id: null,
    unit: null,
    reorder_level: null,
    reorder_qty: null,
    order_unit: null,
    qty_per_unit: null,
    inner_unit: null,
    item_size_value: null,
    item_size_unit: null,
    order_unit_price: null,
  });

  const updateItem = useUpdateItem();
  const itemStorageQuery = useItemStorage(item.id);
  const replaceItemStorage = useReplaceItemStorage();
  const { toast } = useToast();
  const [draft, setDraft] = useState<InventoryItemPanelDraft>({
    name: item.name,
    category: item.category,
    vendor_id: item.vendor_id == null ? '' : String(item.vendor_id),
    venue_id: item.venue_id == null ? '' : String(item.venue_id),
    storage_area_id: item.storage_area_id == null ? '' : String(item.storage_area_id),
    unit: item.unit,
    reorder_level: item.reorder_level == null ? '' : String(item.reorder_level),
    reorder_qty: item.reorder_qty == null ? '' : String(item.reorder_qty),
    order_unit: item.order_unit ?? '',
    qty_per_unit: item.qty_per_unit == null ? '' : String(item.qty_per_unit),
    inner_unit: item.inner_unit ?? '',
    item_size_value: item.item_size_value == null ? '' : String(item.item_size_value),
    item_size_unit: item.item_size_unit ?? '',
    order_unit_price: item.order_unit_price == null ? '' : String(item.order_unit_price),
  });
  const [fieldStates, setFieldStates] = useState<Record<DraftField, FieldSaveState>>(emptyFieldStates);
  const [fieldSavedAt, setFieldSavedAt] = useState<Record<DraftField, number | null>>(emptySavedAt);
  const [groupBanner, setGroupBanner] = useState<{
    identity: { tone: 'success' | 'error'; message: string } | null;
    assignments: { tone: 'success' | 'error'; message: string } | null;
    ordering: { tone: 'success' | 'error'; message: string } | null;
  }>({
    identity: null,
    assignments: null,
    ordering: null,
  });
  const [fieldRollbackReasons, setFieldRollbackReasons] = useState<Record<DraftField, string | null>>({
    name: null,
    category: null,
    vendor_id: null,
    venue_id: null,
    storage_area_id: null,
    unit: null,
    reorder_level: null,
    reorder_qty: null,
    order_unit: null,
    qty_per_unit: null,
    inner_unit: null,
    item_size_value: null,
    item_size_unit: null,
    order_unit_price: null,
  });
  const [storageDraftRows, setStorageDraftRows] = useState<StorageDraftRow[]>(() => buildStorageDraftRows(item));
  const [storageBanner, setStorageBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setDraft({
      name: item.name,
      category: item.category,
      vendor_id: item.vendor_id == null ? '' : String(item.vendor_id),
      venue_id: item.venue_id == null ? '' : String(item.venue_id),
      storage_area_id: item.storage_area_id == null ? '' : String(item.storage_area_id),
      unit: item.unit,
      reorder_level: item.reorder_level == null ? '' : String(item.reorder_level),
      reorder_qty: item.reorder_qty == null ? '' : String(item.reorder_qty),
      order_unit: item.order_unit ?? '',
      qty_per_unit: item.qty_per_unit == null ? '' : String(item.qty_per_unit),
      inner_unit: item.inner_unit ?? '',
      item_size_value: item.item_size_value == null ? '' : String(item.item_size_value),
      item_size_unit: item.item_size_unit ?? '',
      order_unit_price: item.order_unit_price == null ? '' : String(item.order_unit_price),
    });
    setFieldStates(emptyFieldStates());
    setFieldSavedAt(emptySavedAt());
    setGroupBanner({
      identity: null,
      assignments: null,
      ordering: null,
    });
    setFieldRollbackReasons({
      name: null,
      category: null,
      vendor_id: null,
      venue_id: null,
      storage_area_id: null,
      unit: null,
      reorder_level: null,
      reorder_qty: null,
      order_unit: null,
      qty_per_unit: null,
      inner_unit: null,
      item_size_value: null,
      item_size_unit: null,
      order_unit_price: null,
    });
    setStorageBanner(null);
  }, [item]);

  useEffect(() => {
    setStorageDraftRows(buildStorageDraftRows(item, itemStorageQuery.data));
    setStorageBanner(null);
  }, [item.id, item.storage_area_id, item.current_qty, itemStorageQuery.data]);

  useEffect(() => {
    const timers: number[] = [];
    (['identity', 'assignments', 'ordering'] as const).forEach((key) => {
      if (groupBanner[key]?.tone === 'success') {
        const timer = window.setTimeout(() => {
          setGroupBanner((current) => (
            current[key]?.tone === 'success'
              ? { ...current, [key]: null }
              : current
          ));
        }, 5000);
        timers.push(timer);
      }
    });
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [groupBanner]);

  useEffect(() => {
    if (storageBanner?.tone !== 'success') {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setStorageBanner((current) => (current?.tone === 'success' ? null : current));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [storageBanner]);

  const vendorName = vendors.find((vendor) => vendor.id === item.vendor_id)?.name ?? 'Unassigned';
  const venueName = venues.find((venue) => venue.id === item.venue_id)?.name ?? 'Unassigned';
  const areaName = areas.find((area) => area.id === item.storage_area_id)?.name ?? 'Unassigned';
  const storageSourceRows = buildStorageDraftRows(item, itemStorageQuery.data);
  const normalizedStorageSourceRows = normalizeStorageRows(storageSourceRows);
  const normalizedStorageDraftRows = normalizeStorageRows(storageDraftRows);
  const storageDraftTotal = normalizedStorageDraftRows.reduce((sum, row) => sum + row.quantity, 0);
  const storageDraftDirty = JSON.stringify(normalizedStorageSourceRows) !== JSON.stringify(normalizedStorageDraftRows);
  const storageSelectedAreaIds = storageDraftRows
    .map((row) => Number(row.area_id))
    .filter((areaId) => Number.isFinite(areaId) && areaId > 0);
  const duplicateStorageAreaIds = storageSelectedAreaIds.filter((areaId, index) => storageSelectedAreaIds.indexOf(areaId) !== index);
  const storageHasDuplicateAreas = duplicateStorageAreaIds.length > 0;
  const storageHasBlankArea = storageDraftRows.some((row) => row.area_id === '');
  const storageHasInvalidQuantity = storageDraftRows.some((row) => row.quantity === '' || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 0);
  const reorderStatus = item.reorder_level != null && item.current_qty <= item.reorder_level ? 'Needs reorder' : 'In range';
  const totalValue = item.order_unit_price != null ? item.order_unit_price * item.current_qty : null;
  const currentEconomics = deriveInventoryUnitEconomics({
    baseUnit: item.unit,
    orderUnit: item.order_unit,
    orderUnitPrice: item.order_unit_price,
    qtyPerUnit: item.qty_per_unit,
    innerUnit: item.inner_unit,
    itemSizeValue: item.item_size_value,
    itemSizeUnit: item.item_size_unit,
  });
  const assignmentFields: DraftField[] = ['category', 'vendor_id', 'venue_id'];
  const identityFields: DraftField[] = ['name'];
  const orderingFields: DraftField[] = ['unit', 'reorder_level', 'reorder_qty', 'order_unit', 'qty_per_unit', 'inner_unit', 'item_size_value', 'item_size_unit', 'order_unit_price'];
  const changedFields = (Object.entries(draft) as Array<[DraftField, string]>)
    .filter(([field, value]) => {
      switch (field) {
        case 'name':
          return value.trim() !== item.name;
        case 'category':
          return value !== item.category;
        case 'vendor_id':
          return value !== (item.vendor_id == null ? '' : String(item.vendor_id));
        case 'venue_id':
          return value !== (item.venue_id == null ? '' : String(item.venue_id));
        case 'storage_area_id':
          return value !== (item.storage_area_id == null ? '' : String(item.storage_area_id));
        case 'unit':
          return value !== item.unit;
        case 'reorder_level':
          return value !== (item.reorder_level == null ? '' : String(item.reorder_level));
        case 'reorder_qty':
          return value !== (item.reorder_qty == null ? '' : String(item.reorder_qty));
        case 'order_unit':
          return value !== (item.order_unit ?? '');
        case 'qty_per_unit':
          return value !== (item.qty_per_unit == null ? '' : String(item.qty_per_unit));
        case 'inner_unit':
          return value !== (item.inner_unit ?? '');
        case 'item_size_value':
          return value !== (item.item_size_value == null ? '' : String(item.item_size_value));
        case 'item_size_unit':
          return value !== (item.item_size_unit ?? '');
        case 'order_unit_price':
          return value !== (item.order_unit_price == null ? '' : String(item.order_unit_price));
        default:
          return false;
      }
    })
    .map(([field]) => field);
  const assignmentChangedFields = assignmentFields.filter((field) => changedFields.includes(field));
  const identityChangedFields = identityFields.filter((field) => changedFields.includes(field));
  const orderingChangedFields = orderingFields.filter((field) => changedFields.includes(field));
  const identityFieldStates = Object.fromEntries(identityFields.map((field) => [field, fieldStates[field]])) as Record<DraftField, FieldSaveState>;
  const assignmentFieldStates = Object.fromEntries(assignmentFields.map((field) => [field, fieldStates[field]])) as Record<DraftField, FieldSaveState>;
  const orderingFieldStates = Object.fromEntries(orderingFields.map((field) => [field, fieldStates[field]])) as Record<DraftField, FieldSaveState>;

  const addStorageRow = () => {
    const nextArea = areas.find((area) => !storageSelectedAreaIds.includes(area.id));
    setStorageDraftRows((current) => [
      ...current,
      {
        key: `draft-${Date.now()}-${current.length}`,
        area_id: nextArea ? String(nextArea.id) : '',
        quantity: '',
      },
    ]);
  };

  const updateStorageRow = (key: string, patch: Partial<StorageDraftRow>) => {
    setStorageDraftRows((current) => current.map((row) => (
      row.key === key ? { ...row, ...patch } : row
    )));
  };

  const removeStorageRow = (key: string) => {
    setStorageDraftRows((current) => current.filter((row) => row.key !== key));
  };

  const saveStorageRows = () => {
    if (storageHasBlankArea || storageHasDuplicateAreas || storageHasInvalidQuantity) {
      setStorageBanner({
        tone: 'error',
        message: 'Fix duplicate areas and empty or invalid quantities before saving area balances.',
      });
      return;
    }

    setStorageBanner(null);
    replaceItemStorage.mutate(
      {
        itemId: item.id,
        data: {
          rows: storageDraftRows.map((row) => ({
            area_id: Number(row.area_id),
            quantity: Number(row.quantity),
          })),
        },
      },
      {
        onSuccess: () => {
          setStorageBanner({
            tone: 'success',
            message: 'Area balances saved.',
          });
          toast('Area balances saved.', 'success');
        },
        onError: (error) => {
          const reason = error instanceof Error ? error.message : 'Unable to save area balances';
          setStorageBanner({
            tone: 'error',
            message: reason,
          });
          toast(reason, 'error');
        },
      },
    );
  };

  const buildPatchForFields = (fields: DraftField[]) => {
    const patch: Record<string, string | number | null> = {};
    fields.forEach((field) => {
      switch (field) {
        case 'name':
          patch.name = draft.name.trim();
          break;
        case 'category':
          patch.category = draft.category;
          break;
        case 'vendor_id':
          patch.vendor_id = draft.vendor_id ? Number(draft.vendor_id) : null;
          break;
        case 'venue_id':
          patch.venue_id = draft.venue_id ? Number(draft.venue_id) : null;
          break;
        case 'storage_area_id':
          patch.storage_area_id = draft.storage_area_id ? Number(draft.storage_area_id) : null;
          break;
        case 'unit':
          patch.unit = draft.unit as Unit;
          break;
        case 'reorder_level':
          patch.reorder_level = draft.reorder_level === '' ? null : Number(draft.reorder_level);
          break;
        case 'reorder_qty':
          patch.reorder_qty = draft.reorder_qty === '' ? null : Number(draft.reorder_qty);
          break;
        case 'order_unit':
          patch.order_unit = draft.order_unit === '' ? null : draft.order_unit;
          break;
        case 'qty_per_unit':
          patch.qty_per_unit = draft.qty_per_unit === '' ? null : Number(draft.qty_per_unit);
          break;
        case 'inner_unit':
          patch.inner_unit = draft.inner_unit === '' ? null : draft.inner_unit;
          break;
        case 'item_size_value':
          patch.item_size_value = draft.item_size_value === '' ? null : Number(draft.item_size_value);
          break;
        case 'item_size_unit':
          patch.item_size_unit = draft.item_size_unit === '' ? null : draft.item_size_unit;
          break;
        case 'order_unit_price':
          patch.order_unit_price = draft.order_unit_price === '' ? null : Number(draft.order_unit_price);
          break;
      }
    });
    return patch;
  };

  const saveFieldGroup = (fields: DraftField[], label: string, groupKey: 'identity' | 'assignments' | 'ordering') => {
    const fieldsToSave = fields.filter((field) => changedFields.includes(field));
    if (fieldsToSave.length === 0) {
      return;
    }
    setGroupBanner((current) => ({
      ...current,
      [groupKey]: null,
    }));
    setFieldStates((current) => {
      const next = { ...current };
      fieldsToSave.forEach((field) => {
        next[field] = 'saving';
      });
      return next;
    });
    setFieldRollbackReasons((current) => {
      const next = { ...current };
      fieldsToSave.forEach((field) => {
        next[field] = null;
      });
      return next;
    });
    updateItem.mutate(
      {
        id: item.id,
        data: buildPatchForFields(fieldsToSave),
      },
      {
        onSuccess: () => {
          const savedAt = Date.now();
          setFieldStates((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = 'saved';
            });
            return next;
          });
          setFieldSavedAt((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = savedAt;
            });
            return next;
          });
          setGroupBanner((current) => ({
            ...current,
            [groupKey]: {
              tone: 'success',
              message: `${label} saved.`,
            },
          }));
          toast(`${label} saved.`, 'success');
          window.setTimeout(() => {
            setFieldStates((current) => {
              const next = { ...current };
              fieldsToSave.forEach((field) => {
                if (next[field] === 'saved') {
                  next[field] = 'idle';
                }
              });
              return next;
            });
          }, 1800);
        },
        onError: (error) => {
          const reason = error instanceof Error ? error.message : 'Unable to save item changes';
          setFieldStates((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = 'rolled_back';
            });
            return next;
          });
          setFieldRollbackReasons((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = reason;
            });
            return next;
          });
          window.setTimeout(() => {
            setFieldStates((current) => {
              const next = { ...current };
              fieldsToSave.forEach((field) => {
                if (next[field] === 'rolled_back') {
                  next[field] = 'idle';
                }
              });
              return next;
            });
          }, 2200);
          setGroupBanner((current) => ({
            ...current,
            [groupKey]: {
              tone: 'error',
              message: `${label} rolled back. ${reason}`,
            },
          }));
          toast(reason, 'error');
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DetailTile label="Category" value={item.category} />
        <DetailTile label="On Hand" value={`${item.current_qty} ${item.unit}`} />
        <DetailTile label="Vendor" value={vendorName} />
        <DetailTile label="Venue" value={venueName} />
        <DetailTile label="Primary Area" value={areaName} />
        <DetailTile label="Reorder Status" value={reorderStatus} />
      </div>

      <ItemIdentifierEditor itemId={item.id} item={item} compact />

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Item identity</div>
            <div className="mt-1 text-sm text-slate-600">Rename the inventory item here. The drawer title updates from the same saved record.</div>
          </div>
          <div className="flex items-center gap-3">
            <FieldStateSummary changedCount={identityChangedFields.length} fieldStates={identityFieldStates} />
            <button
              type="button"
              onClick={() => saveFieldGroup(identityFields, 'Item name', 'identity')}
              disabled={updateItem.isPending || identityChangedFields.length === 0 || draft.name.trim().length === 0}
              className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {updateItem.isPending ? 'Saving...' : identityChangedFields.length === 0 ? 'No changes' : 'Save name'}
            </button>
          </div>
        </div>
        {groupBanner.identity && (
          <StickyGroupBanner
            tone={groupBanner.identity.tone}
            message={groupBanner.identity.message}
            onDismiss={() => setGroupBanner((current) => ({ ...current, identity: null }))}
          />
        )}
        <div className="mt-3">
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Product name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.name)}`}
            />
            <FieldStateHint state={fieldStates.name} dirty={changedFields.includes('name')} savedAt={fieldSavedAt.name} rollbackReason={fieldRollbackReasons.name} />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assignments</div>
            <div className="mt-1 text-sm text-slate-600">Save ownership and stocking assignments separately from ordering setup.</div>
          </div>
          <div className="flex items-center gap-3">
            <FieldStateSummary changedCount={assignmentChangedFields.length} fieldStates={assignmentFieldStates} />
            <button
              type="button"
              onClick={() => saveFieldGroup(assignmentFields, 'Assignments', 'assignments')}
              disabled={updateItem.isPending || assignmentChangedFields.length === 0}
              className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {updateItem.isPending ? 'Saving...' : assignmentChangedFields.length === 0 ? 'No changes' : 'Save assignments'}
            </button>
          </div>
        </div>
        {groupBanner.assignments && (
          <StickyGroupBanner
            tone={groupBanner.assignments.tone}
            message={groupBanner.assignments.message}
            onDismiss={() => setGroupBanner((current) => ({ ...current, assignments: null }))}
          />
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Category</span>
            <select
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as Item['category'] }))}
              className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.category)}`}
            >
              {(categories.length > 0 ? categories : CATEGORIES).map((categoryOption) => (
                <option key={categoryOption} value={categoryOption}>{categoryOption}</option>
              ))}
            </select>
            <FieldStateHint state={fieldStates.category} dirty={changedFields.includes('category')} savedAt={fieldSavedAt.category} rollbackReason={fieldRollbackReasons.category} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Vendor</span>
            <select
              value={draft.vendor_id}
              onChange={(event) => setDraft((current) => ({ ...current, vendor_id: event.target.value }))}
              className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.vendor_id)}`}
            >
              <option value="">Unassigned</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
            <FieldStateHint state={fieldStates.vendor_id} dirty={changedFields.includes('vendor_id')} savedAt={fieldSavedAt.vendor_id} rollbackReason={fieldRollbackReasons.vendor_id} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Venue</span>
            <select
              value={draft.venue_id}
              onChange={(event) => setDraft((current) => ({ ...current, venue_id: event.target.value }))}
              className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.venue_id)}`}
            >
              <option value="">Unassigned</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
            <FieldStateHint state={fieldStates.venue_id} dirty={changedFields.includes('venue_id')} savedAt={fieldSavedAt.venue_id} rollbackReason={fieldRollbackReasons.venue_id} />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Area balances</div>
            <div className="mt-1 text-sm text-slate-600">Split this item across multiple storage locations. Saved area balances roll up into the on-hand total automatically.</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-slate-500">
              <div>Saved total: <span className="font-semibold text-slate-900">{item.current_qty} {item.unit}</span></div>
              <div>Draft total: <span className="font-semibold text-slate-900">{roundStorageQuantity(storageDraftTotal)} {item.unit}</span></div>
            </div>
            <button
              type="button"
              onClick={saveStorageRows}
              disabled={replaceItemStorage.isPending || !storageDraftDirty || storageHasBlankArea || storageHasDuplicateAreas || storageHasInvalidQuantity}
              className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {replaceItemStorage.isPending ? 'Saving...' : storageDraftDirty ? 'Save area balances' : 'No changes'}
            </button>
          </div>
        </div>
        {storageBanner && (
          <StickyGroupBanner
            tone={storageBanner.tone}
            message={storageBanner.message}
            onDismiss={() => setStorageBanner(null)}
          />
        )}
        <div className="mt-3 space-y-3">
          {itemStorageQuery.isLoading && storageDraftRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Loading saved area balances...
            </div>
          ) : storageDraftRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              No storage locations yet. Add one or more areas like `2277 Bar Cage` and `SOH Bar Cage`, then save to roll them into the item total.
            </div>
          ) : (
            storageDraftRows.map((row, index) => {
              const rowAreaId = Number(row.area_id);
              const rowDuplicate = row.area_id !== '' && duplicateStorageAreaIds.includes(rowAreaId);
              const availableAreas = areas.filter((area) => area.id === rowAreaId || !storageSelectedAreaIds.includes(area.id));
              return (
                <div key={row.key} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <label className="space-y-1 text-sm">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Storage location {index + 1}</span>
                    <select
                      value={row.area_id}
                      onChange={(event) => updateStorageRow(row.key, { area_id: event.target.value })}
                      className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${rowDuplicate ? 'border border-amber-300 bg-amber-50' : 'border border-slate-200 bg-white'}`}
                    >
                      <option value="">Choose area</option>
                      {availableAreas.map((area) => (
                        <option key={area.id} value={area.id}>{area.name}</option>
                      ))}
                    </select>
                    <div className={`text-xs ${rowDuplicate ? 'text-amber-700' : 'text-slate-500'}`}>
                      {rowDuplicate ? 'This area is already assigned above.' : 'Each area can only appear once.'}
                    </div>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quantity in area</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={row.quantity}
                      onChange={(event) => updateStorageRow(row.key, { quantity: event.target.value })}
                      className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${row.quantity === '' || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 0 ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}
                    />
                    <div className="text-xs text-slate-500">Tracked in {item.unit}.</div>
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => removeStorageRow(row.key)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Zero-quantity rows are removed on save, and the first saved area becomes the primary display area.
          </div>
          <button
            type="button"
            onClick={addStorageRow}
            disabled={areas.length === 0}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
          >
            Add storage location
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tracking and purchasing setup</div>
            <div className="mt-1 text-sm text-slate-600">Set the counted unit, the purchase pack, and the measurable content recipes rely on. Save this separately from ownership assignments.</div>
          </div>
          <div className="flex items-center gap-3">
            <FieldStateSummary changedCount={orderingChangedFields.length} fieldStates={orderingFieldStates} />
            <button
              type="button"
              onClick={() => saveFieldGroup(orderingFields, 'Tracking and purchasing setup', 'ordering')}
              disabled={updateItem.isPending || orderingChangedFields.length === 0}
              className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {updateItem.isPending ? 'Saving...' : orderingChangedFields.length === 0 ? 'No changes' : 'Save unit economics'}
            </button>
          </div>
        </div>
        {groupBanner.ordering && (
          <StickyGroupBanner
            tone={groupBanner.ordering.tone}
            message={groupBanner.ordering.message}
            onDismiss={() => setGroupBanner((current) => ({ ...current, ordering: null }))}
          />
        )}
        <div className="mt-3">
          <InventoryUnitEconomicsSummary
            compact
            input={{
              baseUnit: draft.unit,
              orderUnit: draft.order_unit,
              orderUnitPrice: draft.order_unit_price,
              qtyPerUnit: draft.qty_per_unit,
              innerUnit: draft.inner_unit,
              itemSizeValue: draft.item_size_value,
              itemSizeUnit: draft.item_size_unit,
            }}
          />
        </div>
        <div className="mt-4 grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Count and reorder controls</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tracking unit</span>
                <select
                  value={draft.unit}
                  onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value as Unit }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.unit)}`}
                >
                  {UNITS.map((unitOption) => (
                    <option key={unitOption} value={unitOption}>{unitOption}</option>
                  ))}
                </select>
                <FieldStateHint state={fieldStates.unit} dirty={changedFields.includes('unit')} savedAt={fieldSavedAt.unit} rollbackReason={fieldRollbackReasons.unit} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reorder level</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.reorder_level}
                  onChange={(event) => setDraft((current) => ({ ...current, reorder_level: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.reorder_level)}`}
                />
                <FieldStateHint state={fieldStates.reorder_level} dirty={changedFields.includes('reorder_level')} savedAt={fieldSavedAt.reorder_level} rollbackReason={fieldRollbackReasons.reorder_level} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reorder qty</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.reorder_qty}
                  onChange={(event) => setDraft((current) => ({ ...current, reorder_qty: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.reorder_qty)}`}
                />
                <FieldStateHint state={fieldStates.reorder_qty} dirty={changedFields.includes('reorder_qty')} savedAt={fieldSavedAt.reorder_qty} rollbackReason={fieldRollbackReasons.reorder_qty} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Purchase pack</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Purchase unit</span>
                <select
                  value={draft.order_unit}
                  onChange={(event) => setDraft((current) => ({ ...current, order_unit: event.target.value as '' | Unit }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.order_unit)}`}
                >
                  <option value="">Missing</option>
                  {UNITS.map((unitOption) => (
                    <option key={unitOption} value={unitOption}>{unitOption}</option>
                  ))}
                </select>
                <FieldStateHint state={fieldStates.order_unit} dirty={changedFields.includes('order_unit')} savedAt={fieldSavedAt.order_unit} rollbackReason={fieldRollbackReasons.order_unit} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Case / pack price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.order_unit_price}
                  onChange={(event) => setDraft((current) => ({ ...current, order_unit_price: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.order_unit_price)}`}
                />
                <FieldStateHint state={fieldStates.order_unit_price} dirty={changedFields.includes('order_unit_price')} savedAt={fieldSavedAt.order_unit_price} rollbackReason={fieldRollbackReasons.order_unit_price} />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Counted units in each purchase</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.qty_per_unit}
                  onChange={(event) => setDraft((current) => ({ ...current, qty_per_unit: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.qty_per_unit)}`}
                />
                <FieldStateHint state={fieldStates.qty_per_unit} dirty={changedFields.includes('qty_per_unit')} savedAt={fieldSavedAt.qty_per_unit} rollbackReason={fieldRollbackReasons.qty_per_unit} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Individual counted unit</span>
                <select
                  value={draft.inner_unit}
                  onChange={(event) => setDraft((current) => ({ ...current, inner_unit: event.target.value as '' | Unit }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.inner_unit)}`}
                >
                  <option value="">Use tracking unit</option>
                  {UNITS.map((unitOption) => (
                    <option key={unitOption} value={unitOption}>{unitOption}</option>
                  ))}
                </select>
                <FieldStateHint state={fieldStates.inner_unit} dirty={changedFields.includes('inner_unit')} savedAt={fieldSavedAt.inner_unit} rollbackReason={fieldRollbackReasons.inner_unit} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Measurable content for recipes and usage</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Content per counted unit</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.item_size_value}
                  onChange={(event) => setDraft((current) => ({ ...current, item_size_value: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.item_size_value)}`}
                />
                <FieldStateHint state={fieldStates.item_size_value} dirty={changedFields.includes('item_size_value')} savedAt={fieldSavedAt.item_size_value} rollbackReason={fieldRollbackReasons.item_size_value} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Measurable unit</span>
                <select
                  value={draft.item_size_unit}
                  onChange={(event) => setDraft((current) => ({ ...current, item_size_unit: event.target.value as '' | Unit }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.item_size_unit)}`}
                >
                  <option value="">Missing</option>
                  {UNITS.map((unitOption) => (
                    <option key={unitOption} value={unitOption}>{unitOption}</option>
                  ))}
                </select>
                <FieldStateHint state={fieldStates.item_size_unit} dirty={changedFields.includes('item_size_unit')} savedAt={fieldSavedAt.item_size_unit} rollbackReason={fieldRollbackReasons.item_size_unit} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current live unit economics</div>
        <div className="mt-3">
          <InventoryUnitEconomicsSummary
            compact
            input={{
              baseUnit: item.unit,
              orderUnit: item.order_unit,
              orderUnitPrice: item.order_unit_price,
              qtyPerUnit: item.qty_per_unit,
              innerUnit: item.inner_unit,
              itemSizeValue: item.item_size_value,
              itemSizeUnit: item.item_size_unit,
            }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DetailTile label="Tracked in" value={item.unit} />
          <DetailTile label="Reorder status" value={reorderStatus} />
          <DetailTile label="Estimated inventory value" value={formatCurrency(totalValue)} />
          <DetailTile label="Recipe usage support" value={currentEconomics.measurableUnit ? `Yes • ${currentEconomics.measurableUnit}` : 'Limited'} />
        </div>
        <div className="mt-4">
          <Link
            to={`/inventory/${item.id}`}
            className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white hover:text-slate-950"
          >
            Open full item page
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recent activity</div>
        <div className="mt-3 space-y-2">
          {transactions.length === 0 ? (
            <div className="text-sm text-slate-600">No transactions recorded for this item yet.</div>
          ) : (
            transactions.slice(0, 8).map((transaction: Transaction) => (
              <div key={transaction.id} className="rounded-xl bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900">
                    {transaction.type === 'in' ? '+' : '-'}{transaction.quantity} {item.unit}
                  </div>
                  <div className="text-xs text-slate-500">{new Date(transaction.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {transaction.reason}
                  {transaction.notes ? ` • ${transaction.notes}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value == null ? '—' : String(value)}</div>
    </div>
  );
}

function fieldClassName(state: 'idle' | 'saving' | 'saved' | 'rolled_back'): string {
  if (state === 'saving') return 'border-amber-300 bg-amber-50';
  if (state === 'saved') return 'border-emerald-300 bg-emerald-50';
  if (state === 'rolled_back') return 'border-rose-300 bg-rose-50';
  return 'border-slate-200 bg-slate-50';
}

function FieldStateHint({
  state,
  dirty,
  savedAt,
  rollbackReason,
}: {
  state: 'idle' | 'saving' | 'saved' | 'rolled_back';
  dirty: boolean;
  savedAt: number | null;
  rollbackReason: string | null;
}) {
  if (state === 'idle' && !dirty && savedAt == null) return null;
  const text = state === 'saving'
    ? 'Saving...'
    : state === 'saved'
      ? 'Saved'
      : state === 'rolled_back'
        ? `Rolled back${rollbackReason ? `: ${rollbackReason}` : ''}`
        : dirty
          ? 'Unsaved change'
          : `Last saved ${formatFieldSavedAt(savedAt)}`;
  const className = state === 'saving'
    ? 'text-amber-700'
    : state === 'saved'
      ? 'text-emerald-700'
      : state === 'rolled_back'
        ? 'text-rose-700'
        : dirty
          ? 'text-slate-600'
          : 'text-slate-500';

  return <div className={`text-[11px] font-medium ${className}`}>{text}</div>;
}

function formatFieldSavedAt(savedAt: number | null): string {
  if (savedAt == null) {
    return 'recently';
  }
  return new Date(savedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function FieldStateSummary({
  changedCount,
  fieldStates,
}: {
  changedCount: number;
  fieldStates: Record<string, 'idle' | 'saving' | 'saved' | 'rolled_back'>;
}) {
  const states = Object.values(fieldStates);
  if (states.includes('saving')) {
    return <span className="text-xs font-medium text-amber-700">Saving updated fields...</span>;
  }
  if (states.includes('rolled_back')) {
    return <span className="text-xs font-medium text-rose-700">Some fields rolled back after a failed save.</span>;
  }
  if (states.includes('saved')) {
    return <span className="text-xs font-medium text-emerald-700">Updated fields saved.</span>;
  }
  return (
    <span className="text-xs text-slate-500">
      {changedCount > 0 ? `${changedCount} unsaved field${changedCount === 1 ? '' : 's'}` : 'No unsaved changes'}
    </span>
  );
}

function StickyGroupBanner({
  tone,
  message,
  onDismiss,
}: {
  tone: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-3 flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-full border border-current/20 px-2 py-0.5 text-xs font-medium transition hover:bg-white/40"
        aria-label="Dismiss save status"
      >
        Dismiss
      </button>
    </div>
  );
}
