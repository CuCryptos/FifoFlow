import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateRecipeCaptureSessionInput,
  RecalculateRecipeDraftConfidenceInput,
} from '@fifoflow/shared';
import { api } from '../api';

export function useRecipeIntelligenceSessions(params?: { venue_id?: number; status?: 'open' | 'completed' }) {
  return useQuery({
    queryKey: ['recipe-intelligence', 'sessions', params ?? {}],
    queryFn: async () => (await api.recipeIntelligence.listSessions(params)).sessions,
  });
}

export function useRecipeIntelligenceSession(sessionId: number) {
  return useQuery({
    queryKey: ['recipe-intelligence', 'sessions', sessionId],
    queryFn: () => api.recipeIntelligence.getSession(sessionId),
    enabled: sessionId > 0,
  });
}

export function useCreateRecipeCaptureSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecipeCaptureSessionInput) => api.recipeIntelligence.createSession(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions'] });
    },
  });
}

export function useCreateRecipeBlitzSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CreateRecipeCaptureSessionInput, 'capture_mode'> & { name?: string | null }) =>
      api.recipeIntelligence.createBlitzSession(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions'] });
    },
  });
}

export function useRecipeDraftSourceIntelligence(draftId: number) {
  return useQuery({
    queryKey: ['recipe-intelligence', 'draft-source', draftId],
    queryFn: () => api.recipeIntelligence.getDraftSource(draftId),
    enabled: draftId > 0,
  });
}

export function useRecalculateRecipeDraftConfidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, data }: { draftId: number; data: RecalculateRecipeDraftConfidenceInput }) =>
      api.recipeIntelligence.recalculateDraftConfidence(draftId, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['recipe-drafts'] });
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'draft-source', Number(result.draft_id)] });
    },
  });
}

export function useCreateConversationDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.recipeIntelligence.createConversationDrafts,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions'] });
      qc.invalidateQueries({ queryKey: ['recipe-drafts'] });
    },
  });
}

export function useUploadPhotoDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.recipeIntelligence.uploadPhotoDrafts,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions'] });
      qc.invalidateQueries({ queryKey: ['recipe-drafts'] });
    },
  });
}

export function useUploadPrepSheetCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.recipeIntelligence.uploadPrepSheetCapture,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions'] });
      qc.invalidateQueries({ queryKey: ['recipe-drafts'] });
    },
  });
}
