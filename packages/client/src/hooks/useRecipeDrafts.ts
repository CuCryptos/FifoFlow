import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpsertRecipeDraftInput } from '@fifoflow/shared';
import { api } from '../api';

export function useRecipeDrafts() {
  return useQuery({
    queryKey: ['recipe-drafts'],
    queryFn: async () => (await api.recipeDrafts.list()).drafts,
  });
}

export function useRecipeDraft(id: number) {
  return useQuery({
    queryKey: ['recipe-drafts', id],
    queryFn: () => api.recipeDrafts.get(id),
    enabled: id > 0,
  });
}

export function useCreateRecipeDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertRecipeDraftInput) => api.recipeDrafts.create(data),
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ['recipe-drafts'] });
      qc.setQueryData(['recipe-drafts', Number(draft.id)], draft);
    },
  });
}

export function useUpdateRecipeDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpsertRecipeDraftInput }) => api.recipeDrafts.update(id, data),
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ['recipe-drafts'] });
      qc.setQueryData(['recipe-drafts', Number(draft.id)], draft);
    },
  });
}

export function useDeleteRecipeDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.recipeDrafts.delete(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['recipe-drafts'] });
      qc.removeQueries({ queryKey: ['recipe-drafts', id] });
    },
  });
}

export function usePromoteRecipeDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string | null }) => api.recipeDrafts.promote(id, { notes }),
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ['recipe-drafts'] });
      qc.invalidateQueries({ queryKey: ['recipe-workflow'] });
      if (result.draft) {
        qc.setQueryData(['recipe-drafts', variables.id], result.draft);
      }
    },
  });
}
