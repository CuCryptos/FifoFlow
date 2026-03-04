import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateVendorInput, UpdateVendorInput } from '@fifoflow/shared';

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.vendors.list(),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVendorInput) => api.vendors.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); },
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateVendorInput }) =>
      api.vendors.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); },
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.vendors.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); },
  });
}
