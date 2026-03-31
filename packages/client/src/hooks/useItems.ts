import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateItemInput, Item, ItemStorage, MergeItemsInput, ReplaceItemStorageInput, SetItemCountInput, UpdateItemInput } from '@fifoflow/shared';

export type InventoryItemsQueryParams = {
  search?: string;
  category?: string;
  venue_id?: number;
};

type ItemDetailCache = { item: Item; transactions: any[] };

const ITEMS_QUERY_KEY = ['items'] as const;
const TRANSACTIONS_QUERY_KEY = ['transactions'] as const;
const DASHBOARD_QUERY_KEY = ['dashboard'] as const;

function applyItemPatch(item: Item, patch: UpdateItemInput): Item {
  return {
    ...item,
    ...patch,
    updated_at: new Date().toISOString(),
  };
}

function patchItemListsInCache(queryClient: ReturnType<typeof useQueryClient>, itemId: number, patch: UpdateItemInput) {
  const previousLists = queryClient.getQueriesData<Item[]>({ queryKey: ITEMS_QUERY_KEY });

  for (const [queryKey, items] of previousLists) {
    if (!Array.isArray(items)) {
      continue;
    }
    queryClient.setQueryData<Item[]>(queryKey, items.map((item) => (
      item.id === itemId ? applyItemPatch(item, patch) : item
    )));
  }

  return previousLists;
}

export function useItems(params?: InventoryItemsQueryParams) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, params] as const,
    queryFn: () => api.items.list(params),
  });
}

export function useItem(id: number) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, id] as const,
    queryFn: () => api.items.get(id),
    enabled: id > 0,
  });
}

export function useItemStorage(itemId: number) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, itemId, 'storage'] as const,
    queryFn: () => api.items.listStorage(itemId),
    enabled: itemId > 0,
  });
}

export function useReorderSuggestions(venueId?: number) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, 'reorder-suggestions', venueId] as const,
    queryFn: () => api.items.reorderSuggestions(venueId),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemInput) => api.items.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY }); },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateItemInput }) => api.items.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ITEMS_QUERY_KEY });
      const previousLists = patchItemListsInCache(qc, id, data);
      const previousDetail = qc.getQueryData<ItemDetailCache>([...ITEMS_QUERY_KEY, id] as const);

      if (previousDetail?.item) {
        qc.setQueryData<ItemDetailCache>([...ITEMS_QUERY_KEY, id] as const, {
          ...previousDetail,
          item: applyItemPatch(previousDetail.item, data),
        });
      }

      return { previousLists, previousDetail, id };
    },
    onError: (_error, variables, context) => {
      context?.previousLists?.forEach(([queryKey, data]) => {
        qc.setQueryData(queryKey, data);
      });
      if (context?.previousDetail) {
        qc.setQueryData([...ITEMS_QUERY_KEY, variables.id] as const, context.previousDetail);
      }
    },
    onSuccess: (updated) => {
      qc.setQueryData<ItemDetailCache | undefined>([...ITEMS_QUERY_KEY, updated.id] as const, (current) => (
        current ? { ...current, item: updated } : current
      ));
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...ITEMS_QUERY_KEY, variables.id] as const });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.items.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY }); },
  });
}

export function useReplaceItemStorage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: ReplaceItemStorageInput }) =>
      api.items.replaceStorage(itemId, data),
    onSuccess: (result, variables) => {
      qc.setQueryData<ItemStorage[]>([...ITEMS_QUERY_KEY, variables.itemId, 'storage'] as const, result.rows);
      qc.setQueryData<ItemDetailCache | undefined>([...ITEMS_QUERY_KEY, variables.itemId] as const, (current) => (
        current ? { ...current, item: result.item } : current
      ));
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...ITEMS_QUERY_KEY, variables.itemId] as const });
      qc.invalidateQueries({ queryKey: [...ITEMS_QUERY_KEY, variables.itemId, 'storage'] as const });
    },
  });
}

export function useSetItemCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SetItemCountInput }) => api.items.setCount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}

export function useBulkUpdateItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      ids: number[];
      updates: {
        category?: string;
        vendor_id?: number | null;
        venue_id?: number | null;
        storage_area_id?: number | null;
      };
    }) => api.items.bulkUpdate(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY }); },
  });
}

export function useBulkDeleteItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: number[] }) => api.items.bulkDelete(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}

export function useMergeItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MergeItemsInput) => api.items.merge(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
      qc.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
    },
  });
}
