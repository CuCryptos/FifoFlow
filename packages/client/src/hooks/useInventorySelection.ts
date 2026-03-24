import { useCallback, useMemo, useState } from 'react';

type SelectionSet = Set<number>;

export interface UseInventorySelectionOptions {
  initialSelectedIds?: Iterable<number>;
  visibleIds?: readonly number[];
}

function cloneSelection(ids: Iterable<number>) {
  return new Set(ids);
}

export function useInventorySelection(options: UseInventorySelectionOptions = {}) {
  const { initialSelectedIds, visibleIds = [] } = options;
  const [selectedIds, setSelectedIds] = useState<SelectionSet>(() => cloneSelection(initialSelectedIds ?? []));

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const replaceSelection = useCallback((ids: Iterable<number>) => {
    setSelectedIds(cloneSelection(ids));
  }, []);

  const toggleSelectOne = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const isSelected = useCallback((id: number) => selectedIds.has(id), [selectedIds]);

  const allVisibleSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id)),
    [selectedIds, visibleIds],
  );

  const selectedCount = selectedIds.size;

  const visibleSelectionCount = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)).length,
    [selectedIds, visibleIds],
  );

  const toggleVisibleSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allVisibleAreSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));

      if (allVisibleAreSelected) {
        for (const id of visibleIds) {
          next.delete(id);
        }
        return next;
      }

      for (const id of visibleIds) {
        next.add(id);
      }
      return next;
    });
  }, [visibleIds]);

  return {
    selectedIds,
    selectedCount,
    visibleSelectionCount,
    allVisibleSelected,
    setSelectedIds,
    clearSelection,
    replaceSelection,
    toggleSelectOne,
    isSelected,
    toggleVisibleSelection,
  };
}
