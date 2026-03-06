import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { SaveForecastInput } from '@fifoflow/shared';

export function useParseForecast() {
  return useMutation({
    mutationFn: (file: File) => api.forecasts.parse(file),
  });
}

export function useSaveForecast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveForecastInput) => api.forecasts.save(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forecasts'] });
    },
  });
}

export function useForecasts() {
  return useQuery({
    queryKey: ['forecasts'],
    queryFn: () => api.forecasts.list(),
  });
}

export function useForecast(id: number) {
  return useQuery({
    queryKey: ['forecasts', id],
    queryFn: () => api.forecasts.get(id),
    enabled: id > 0,
  });
}

export function useForecastMappings() {
  return useQuery({
    queryKey: ['forecast-mappings'],
    queryFn: () => api.forecasts.listMappings(),
  });
}

export function useSaveForecastMappings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappings: Array<{ product_name: string; venue_id: number }>) =>
      api.forecasts.saveMappings(mappings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forecast-mappings'] });
    },
  });
}
