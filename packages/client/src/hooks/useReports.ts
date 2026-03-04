import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useUsageReport(start: string, end: string, groupBy: string = 'day', venueId?: number) {
  return useQuery({
    queryKey: ['reports', 'usage', start, end, groupBy, venueId],
    queryFn: () => api.reports.usage({ start, end, group_by: groupBy, venue_id: venueId }),
  });
}

export function useWasteReport(start: string, end: string, venueId?: number) {
  return useQuery({
    queryKey: ['reports', 'waste', start, end, venueId],
    queryFn: () => api.reports.waste({ start, end, venue_id: venueId }),
  });
}

export function useCostReport(start: string, end: string, groupBy: string = 'category', venueId?: number) {
  return useQuery({
    queryKey: ['reports', 'cost', start, end, groupBy, venueId],
    queryFn: () => api.reports.cost({ start, end, group_by: groupBy, venue_id: venueId }),
  });
}
