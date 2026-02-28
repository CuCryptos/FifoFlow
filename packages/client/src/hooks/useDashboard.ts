import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.dashboard.stats(),
    refetchInterval: 30000,
  });
}
