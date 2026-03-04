import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateVendorPriceInput, UpdateVendorPriceInput } from '@fifoflow/shared';

export function useVendorPrices(itemId: number) {
  return useQuery({
    queryKey: ['vendorPrices', itemId],
    queryFn: () => api.vendorPrices.list(itemId),
  });
}

export function useCreateVendorPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: CreateVendorPriceInput }) =>
      api.vendorPrices.create(itemId, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['vendorPrices', variables.itemId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useUpdateVendorPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, id, data }: { itemId: number; id: number; data: UpdateVendorPriceInput }) =>
      api.vendorPrices.update(itemId, id, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['vendorPrices', variables.itemId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useDeleteVendorPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, id }: { itemId: number; id: number }) =>
      api.vendorPrices.delete(itemId, id),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['vendorPrices', variables.itemId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
