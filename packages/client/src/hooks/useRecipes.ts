import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateRecipeInput, UpdateRecipeInput } from '@fifoflow/shared';

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: () => api.recipes.list(),
  });
}

export function useRecipe(id: number) {
  return useQuery({
    queryKey: ['recipes', id],
    queryFn: () => api.recipes.get(id),
    enabled: id > 0,
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecipeInput) => api.recipes.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recipes'] }); },
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRecipeInput }) =>
      api.recipes.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recipes'] }); },
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.recipes.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recipes'] }); },
  });
}
