import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateTransactionInput } from '@fifoflow/shared';

export function useTransactions(params?: { item_id?: number; type?: string; limit?: number }) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => api.transactions.list(params),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: CreateTransactionInput }) =>
      api.transactions.create(itemId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
