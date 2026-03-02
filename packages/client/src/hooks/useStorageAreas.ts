import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateStorageAreaInput, UpdateStorageAreaInput } from '@fifoflow/shared';

export function useStorageAreas() {
  return useQuery({
    queryKey: ['storageAreas'],
    queryFn: () => api.storageAreas.list(),
  });
}

export function useCreateStorageArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStorageAreaInput) => api.storageAreas.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storageAreas'] }); },
  });
}

export function useUpdateStorageArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateStorageAreaInput }) =>
      api.storageAreas.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storageAreas'] }); },
  });
}

export function useDeleteStorageArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.storageAreas.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storageAreas'] }); },
  });
}

export function useAllItemStorage() {
  return useQuery({
    queryKey: ['itemStorage'],
    queryFn: () => api.items.listAllStorage(),
  });
}

export function useItemStorage(itemId: number) {
  return useQuery({
    queryKey: ['itemStorage', itemId],
    queryFn: () => api.items.listStorage(itemId),
  });
}
