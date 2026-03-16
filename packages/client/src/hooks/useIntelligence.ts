import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export function useOperatorBrief(venueId?: number | null, days = 7) {
  return useQuery({
    queryKey: ['intelligence', 'operator-brief', venueId ?? 'all', days],
    queryFn: () => api.intelligence.operatorBrief({ venue_id: venueId ?? undefined, days }),
  });
}

export function useRefreshIntelligence(venueId?: number | null, signalLookbackDays = 30, memoWindowDays = 7) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.intelligence.refresh({
      venue_id: venueId ?? undefined,
      signal_lookback_days: signalLookbackDays,
      memo_window_days: memoWindowDays,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intelligence'] });
    },
  });
}

export function useIntelligenceFreshness(venueId?: number | null, days = 7) {
  return useQuery({
    queryKey: ['intelligence', 'freshness', venueId ?? 'all', days],
    queryFn: () => api.intelligence.freshness({ venue_id: venueId ?? undefined, days }),
  });
}

export function useRunIntelligencePack(venueId?: number | null, signalLookbackDays = 30, memoWindowDays = 7) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pack: string) => api.intelligence.runPack(pack, {
      venue_id: venueId ?? undefined,
      signal_lookback_days: signalLookbackDays,
      memo_window_days: memoWindowDays,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intelligence'] });
    },
  });
}

export function useSignalDetail(signalId?: number | null, venueId?: number | null, days = 7) {
  return useQuery({
    queryKey: ['intelligence', 'signal', signalId ?? 'none', venueId ?? 'all', days],
    queryFn: () => api.intelligence.signalDetail(Number(signalId), { venue_id: venueId ?? undefined, days }),
    enabled: signalId != null,
  });
}

export function useRecommendations(venueId?: number | null, statuses?: string[], limit = 50) {
  return useQuery({
    queryKey: ['intelligence', 'recommendations', venueId ?? 'all', statuses?.join(',') ?? 'default', limit],
    queryFn: () => api.intelligence.recommendations({
      venue_id: venueId ?? undefined,
      statuses,
      limit,
    }),
  });
}

export function useRecommendationDetail(recommendationId?: number | null) {
  return useQuery({
    queryKey: ['intelligence', 'recommendation', recommendationId ?? 'none'],
    queryFn: () => api.intelligence.recommendationDetail(Number(recommendationId)),
    enabled: recommendationId != null,
  });
}

export function useUpdateRecommendationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: number; status: string; actor_name?: string; notes?: string }) =>
      api.intelligence.updateRecommendationStatus(input.id, {
        status: input.status,
        actor_name: input.actor_name,
        notes: input.notes,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['intelligence'] });
      void queryClient.setQueryData(['intelligence', 'recommendation', Number(result.recommendation.id)], result);
    },
  });
}
