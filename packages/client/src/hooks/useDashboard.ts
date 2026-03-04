import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useDashboardStats(venueId?: number) {
  return useQuery({
    queryKey: ['dashboard', 'stats', venueId],
    queryFn: () => api.dashboard.stats(venueId),
    refetchInterval: 30000,
  });
}
