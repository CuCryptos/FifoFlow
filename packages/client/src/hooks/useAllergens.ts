import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type AllergenQueryInput } from '../api';

export type AllergenStatus = 'contains' | 'may_contain' | 'free_of' | 'unknown';
export type AllergenConfidence = 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown';

export interface AllergenItemFilters {
  search?: string;
  status?: AllergenStatus;
  confidence?: AllergenConfidence;
  needs_review?: boolean;
  vendor_id?: number;
  venue_id?: number;
}

export function useAllergenReference() {
  return useQuery({
    queryKey: ['allergens', 'reference'],
    queryFn: () => api.allergens.reference(),
    staleTime: 60_000,
  });
}

export function useAllergenItems(filters: AllergenItemFilters = {}) {
  return useQuery({
    queryKey: ['allergens', 'items', filters],
    queryFn: () => api.allergens.listItems(filters),
    staleTime: 30_000,
  });
}

export function useAllergenItem(itemId: number) {
  return useQuery({
    queryKey: ['allergens', 'items', itemId],
    queryFn: () => api.allergens.getItem(itemId),
    enabled: itemId > 0,
    staleTime: 30_000,
  });
}

export function useAllergenDocument(documentId: number) {
  return useQuery({
    queryKey: ['allergens', 'documents', documentId],
    queryFn: () => api.allergens.getDocument(documentId),
    enabled: documentId > 0,
    staleTime: 30_000,
  });
}

export function useAllergenReviewQueue() {
  return useQuery({
    queryKey: ['allergens', 'review-queue'],
    queryFn: () => api.allergens.reviewQueue(),
    staleTime: 15_000,
  });
}

export function useAllergenQuery() {
  return useMutation({
    mutationFn: (input: AllergenQueryInput) => api.allergens.query(input),
  });
}
