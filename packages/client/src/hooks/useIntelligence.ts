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
