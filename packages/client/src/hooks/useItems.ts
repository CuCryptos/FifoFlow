import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateItemInput, SetItemCountInput, UpdateItemInput } from '@fifoflow/shared';

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); },
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
    mutationFn: (data: { ids: number[]; updates: { category: string } }) => api.items.bulkUpdate(data),
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
