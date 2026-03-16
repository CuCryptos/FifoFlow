import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useOperationalRecipeWorkflow(venueId?: number | null) {
  return useQuery({
    queryKey: ['recipe-workflow', 'operational-summary', venueId ?? 'all'],
    queryFn: () => api.recipeWorkflow.operationalSummary(venueId ?? undefined),
  });
}

export function useOperationalRecipeWorkflowDetail(recipeVersionId?: number | null, venueId?: number | null) {
  return useQuery({
    queryKey: ['recipe-workflow', 'operational-detail', recipeVersionId ?? 'none', venueId ?? 'all'],
    queryFn: () => api.recipeWorkflow.operationalDetail(Number(recipeVersionId), venueId ?? undefined),
    enabled: recipeVersionId != null && recipeVersionId > 0,
  });
}
