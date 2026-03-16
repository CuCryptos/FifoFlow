import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateItemInput, Item, MergeItemsInput, SetItemCountInput, UpdateItemInput } from '@fifoflow/shared';

function applyItemPatch(item: Item, patch: UpdateItemInput): Item {
  return {
    ...item,
    ...patch,
    updated_at: new Date().toISOString(),
  };
}

export function useItems(params?: { search?: string; category?: string; venue_id?: number }) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => api.items.list(params),
  });
}

export function useItem(id: number) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: () => api.items.get(id),
    enabled: id > 0,
  });
}

export function useReorderSuggestions(venueId?: number) {
  return useQuery({
    queryKey: ['items', 'reorder-suggestions', venueId],
    queryFn: () => api.items.reorderSuggestions(venueId),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemInput) => api.items.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateItemInput }) => api.items.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ['items'] });
      const previousLists = qc.getQueriesData<Item[]>({ queryKey: ['items'] });
      const previousDetail = qc.getQueryData<{ item: Item; transactions: any[] }>(['items', id]);

      for (const [queryKey, items] of previousLists) {
        if (!Array.isArray(items)) {
          continue;
        }
        qc.setQueryData<Item[]>(queryKey, items.map((item) => (
          item.id === id ? applyItemPatch(item, data) : item
        )));
      }

      if (previousDetail?.item) {
        qc.setQueryData(['items', id], {
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
        qc.setQueryData(['items', variables.id], context.previousDetail);
      }
    },
    onSuccess: (updated) => {
      qc.setQueryData(['items', updated.id], (current: { item: Item; transactions: any[] } | undefined) => (
        current ? { ...current, item: updated } : current
      ));
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['items', variables.id] });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.items.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); },
  });
}

export function useSetItemCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SetItemCountInput }) => api.items.setCount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); },
  });
}

export function useBulkDeleteItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: number[] }) => api.items.bulkDelete(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useMergeItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MergeItemsInput) => api.items.merge(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
