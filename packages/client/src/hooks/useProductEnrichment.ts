import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export function useProductEnrichmentCatalogs() {
  return useQuery({
    queryKey: ['product-enrichment', 'catalogs'],
    queryFn: () => api.productEnrichment.listCatalogs(),
    staleTime: 60_000,
  });
}

export function useProductEnrichmentItem(itemId: number) {
  return useQuery({
    queryKey: ['product-enrichment', 'items', itemId],
    queryFn: () => api.productEnrichment.getItem(itemId),
    enabled: itemId > 0,
    staleTime: 15_000,
  });
}

export function useProductEnrichmentReviewQueue(venueId?: number) {
  return useQuery({
    queryKey: ['product-enrichment', 'review-queue', venueId ?? null],
    queryFn: () => api.productEnrichment.reviewQueue({ venue_id: venueId }),
    staleTime: 15_000,
  });
}

export function useSyncProductEnrichmentCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { catalogCode: string; data: Parameters<typeof api.productEnrichment.syncCatalog>[1] }) =>
      api.productEnrichment.syncCatalog(input.catalogCode, input.data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'catalogs'] }),
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'review-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['allergens', 'items'] }),
      ]);
    },
  });
}

export function useUpdateProductEnrichmentItemIdentifiers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: number; data: Parameters<typeof api.productEnrichment.updateItemIdentifiers>[1] }) =>
      api.productEnrichment.updateItemIdentifiers(input.itemId, input.data),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'items', variables.itemId] }),
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'review-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['allergens', 'items'] }),
        queryClient.invalidateQueries({ queryKey: ['allergens', 'items', variables.itemId] }),
      ]);
    },
  });
}

export function useMatchProductEnrichmentItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: number; vendor_price_id?: number | null }) =>
      api.productEnrichment.matchItem(input.itemId, { vendor_price_id: input.vendor_price_id, mode: 'auto' }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'items', variables.itemId] }),
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'review-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['items'] }),
      ]);
    },
  });
}

export function useUpdateProductEnrichmentMatchDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      itemId: number;
      matchId: number;
      data: Parameters<typeof api.productEnrichment.updateMatchDecision>[2];
    }) => api.productEnrichment.updateMatchDecision(input.itemId, input.matchId, input.data),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'items', variables.itemId] }),
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'review-queue'] }),
      ]);
    },
  });
}

export function useImportProductEnrichmentAllergens() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: number; data: Parameters<typeof api.productEnrichment.importAllergens>[1] }) =>
      api.productEnrichment.importAllergens(input.itemId, input.data),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'items', variables.itemId] }),
        queryClient.invalidateQueries({ queryKey: ['product-enrichment', 'review-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['allergens', 'items'] }),
        queryClient.invalidateQueries({ queryKey: ['allergens', 'items', variables.itemId] }),
      ]);
    },
  });
}
