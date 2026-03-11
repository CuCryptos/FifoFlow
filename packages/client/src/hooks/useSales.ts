import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateSaleInput } from '@fifoflow/shared';

export function useSales(params?: { start_date?: string; end_date?: string; item_id?: number }) {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: () => api.sales.list(params),
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSaleInput) => api.sales.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['salesSummary'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['allItemStorage'] });
    },
  });
}

export function useSalesSummary(params?: { start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ['salesSummary', params],
    queryFn: () => api.sales.summary(params),
  });
}
