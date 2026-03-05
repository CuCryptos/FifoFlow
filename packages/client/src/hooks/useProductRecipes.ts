import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { SetProductRecipeInput, CalculateOrderInput } from '@fifoflow/shared';

export function useProductRecipes(venueId?: number) {
  return useQuery({
    queryKey: ['product-recipes', venueId],
    queryFn: () => api.productRecipes.list(venueId),
  });
}

export function useSetProductRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ venueId, data }: { venueId: number; data: SetProductRecipeInput }) =>
      api.productRecipes.set(venueId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product-recipes'] }); },
  });
}

export function useDeleteProductRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.productRecipes.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product-recipes'] }); },
  });
}

export function useCalculateOrder() {
  return useMutation({
    mutationFn: (data: CalculateOrderInput) => api.productRecipes.calculate(data),
  });
}
