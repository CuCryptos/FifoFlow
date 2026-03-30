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

export function useDeleteRecipeIntelligenceSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api.recipeIntelligence.deleteSession(sessionId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions'] });
      qc.removeQueries({ queryKey: ['recipe-intelligence', 'sessions', result.session_id] });
    },
  });
}

export function useDeleteRecipeIntelligenceCaptureInput() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inputId: number) => api.recipeIntelligence.deleteCaptureInput(inputId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions'] });
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions', result.recipe_capture_session_id] });
    },
  });
}

export function useRecipeDraftSourceIntelligence(draftId: number, venueId?: number | null) {
  return useQuery({
    queryKey: ['recipe-intelligence', 'draft-source', draftId, venueId ?? null],
    queryFn: () => api.recipeIntelligence.getDraftSource(draftId, { venue_id: venueId ?? null }),
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

export function useDeleteRecipeIntelligencePrepSheetCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (captureId: number) => api.recipeIntelligence.deletePrepSheetCapture(captureId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'sessions'] });
    },
  });
}

export function useRecipeIntelligenceItemAliases(itemId: number) {
  return useQuery({
    queryKey: ['recipe-intelligence', 'item-aliases', itemId],
    queryFn: () => api.recipeIntelligence.listItemAliases(itemId),
    enabled: itemId > 0,
  });
}

export function useAddRecipeIntelligenceItemAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: { alias: string; alias_type: 'chef_slang' | 'vendor_name' | 'common_name' | 'abbreviation' | 'menu_name' | 'component_name' } }) =>
      api.recipeIntelligence.addItemAlias(itemId, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'item-aliases', result.item_id] });
    },
  });
}

export function useDeleteRecipeIntelligenceItemAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, aliasId }: { itemId: number; aliasId: number }) =>
      api.recipeIntelligence.deleteItemAlias(itemId, aliasId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'item-aliases', result.item_id] });
    },
  });
}

export function useRecipeIntelligenceRecipeAliases(recipeId: number) {
  return useQuery({
    queryKey: ['recipe-intelligence', 'recipe-aliases', recipeId],
    queryFn: () => api.recipeIntelligence.listRecipeAliases(recipeId),
    enabled: recipeId > 0,
  });
}

export function useAddRecipeIntelligenceRecipeAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, data }: { recipeId: number; data: { alias: string; alias_type: 'chef_slang' | 'abbreviation' | 'old_name' | 'component_name' } }) =>
      api.recipeIntelligence.addRecipeAlias(recipeId, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'recipe-aliases', result.recipe_id] });
    },
  });
}

export function useDeleteRecipeIntelligenceRecipeAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, aliasId }: { recipeId: number; aliasId: number }) =>
      api.recipeIntelligence.deleteRecipeAlias(recipeId, aliasId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['recipe-intelligence', 'recipe-aliases', result.recipe_id] });
    },
  });
}
