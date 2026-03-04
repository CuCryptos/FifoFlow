import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateVenueInput, UpdateVenueInput } from '@fifoflow/shared';

export function useVenues() {
  return useQuery({
    queryKey: ['venues'],
    queryFn: () => api.venues.list(),
  });
}

export function useCreateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVenueInput) => api.venues.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['venues'] }); },
  });
}

export function useUpdateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateVenueInput }) =>
      api.venues.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['venues'] }); },
  });
}

export function useDeleteVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.venues.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['venues'] }); },
  });
}
