import { WorkflowPanel } from '../workflow/WorkflowPrimitives';

export function InventoryBatchActions({
  selectedCount,
  bulkCategory,
  onBulkCategoryChange,
  categories,
  bulkVendorId,
  onBulkVendorIdChange,
  bulkVenueId,
  onBulkVenueIdChange,
  bulkStorageAreaId,
  onBulkStorageAreaIdChange,
  vendors,
  venues,
  areas,
  onApplyCategory,
  onApplyVendor,
  onApplyVenue,
  onApplyArea,
  onOpenMerge,
  onOpenDelete,
  isBulkUpdatePending,
  isBulkDeletePending,
}: {
  selectedCount: number;
  bulkCategory: string;
  onBulkCategoryChange: (value: string) => void;
  categories: string[];
  bulkVendorId: string;
  onBulkVendorIdChange: (value: string) => void;
  bulkVenueId: string;
  onBulkVenueIdChange: (value: string) => void;
  bulkStorageAreaId: string;
  onBulkStorageAreaIdChange: (value: string) => void;
  vendors: Array<{ id: number; name: string }>;
  venues: Array<{ id: number; name: string }>;
  areas: Array<{ id: number; name: string }>;
  onApplyCategory: () => void;
  onApplyVendor: () => void;
  onApplyVenue: () => void;
  onApplyArea: () => void;
  onOpenMerge: () => void;
  onOpenDelete: () => void;
  isBulkUpdatePending: boolean;
  isBulkDeletePending: boolean;
}) {
  return (
    <WorkflowPanel
      title="Bulk workflow actions"
      description="Use batch actions to correct ownership and setup gaps directly from the attention queue."
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-text-primary">
          {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bulkCategory}
            onChange={(e) => onBulkCategoryChange(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          >
            <option value="">Reassign category…</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button
            onClick={onApplyCategory}
            disabled={!bulkCategory || isBulkUpdatePending}
            className="rounded-lg bg-accent-indigo px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-indigo-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply Category
          </button>

          <select
            value={bulkVendorId}
            onChange={(e) => onBulkVendorIdChange(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          >
            <option value="">Assign vendor…</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </select>
          <button
            onClick={onApplyVendor}
            disabled={!bulkVendorId || isBulkUpdatePending}
            className="rounded-lg border border-border-emphasis bg-bg-page px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Assign Vendor
          </button>

          <select
            value={bulkVenueId}
            onChange={(e) => onBulkVenueIdChange(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          >
            <option value="">Assign venue…</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>{venue.name}</option>
            ))}
          </select>
          <button
            onClick={onApplyVenue}
            disabled={!bulkVenueId || isBulkUpdatePending}
            className="rounded-lg border border-border-emphasis bg-bg-page px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Assign Venue
          </button>

          <select
            value={bulkStorageAreaId}
            onChange={(e) => onBulkStorageAreaIdChange(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          >
            <option value="">Assign area…</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
          <button
            onClick={onApplyArea}
            disabled={!bulkStorageAreaId || isBulkUpdatePending}
            className="rounded-lg border border-border-emphasis bg-bg-page px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Assign Area
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          {selectedCount >= 2 && (
            <button
              onClick={onOpenMerge}
              className="rounded-lg border border-accent-indigo/30 bg-accent-indigo/10 px-3 py-1.5 text-sm font-medium text-accent-indigo transition-colors hover:bg-accent-indigo/20"
            >
              Merge Selected
            </button>
          )}
          <button
            onClick={onOpenDelete}
            disabled={isBulkDeletePending}
            className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-1.5 text-sm font-medium text-accent-red transition-colors hover:bg-accent-red/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete Selected
          </button>
        </div>
      </div>
    </WorkflowPanel>
  );
}
