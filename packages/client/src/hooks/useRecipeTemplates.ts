import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useRecipeTemplates() {
  return useQuery({
    queryKey: ['recipe-templates'],
    queryFn: async () => {
      const response = await api.recipeTemplates.list();
      return response.templates;
    },
  });
}

export function useRecipeTemplate(templateId?: number | null) {
  return useQuery({
    queryKey: ['recipe-templates', templateId ?? 'none'],
    queryFn: () => api.recipeTemplates.get(Number(templateId)),
    enabled: templateId != null && templateId > 0,
  });
}
