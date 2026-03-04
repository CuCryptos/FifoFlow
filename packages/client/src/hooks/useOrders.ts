import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateOrderInput, UpdateOrderInput } from '@fifoflow/shared';

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.orders.get(id),
    enabled: id > 0,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderInput) => api.orders.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateOrderInput }) =>
      api.orders.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'sent' }) =>
      api.orders.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.orders.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}
