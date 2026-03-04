import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface VenueContextType {
  selectedVenueId: number | null;
  setSelectedVenueId: (id: number | null) => void;
}

const VenueContext = createContext<VenueContextType>({
  selectedVenueId: null,
  setSelectedVenueId: () => {},
});

export function VenueProvider({ children }: { children: ReactNode }) {
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(() => {
    const stored = localStorage.getItem('fifoflow_venue_id');
    return stored ? Number(stored) : null;
  });

  useEffect(() => {
    if (selectedVenueId !== null) {
      localStorage.setItem('fifoflow_venue_id', String(selectedVenueId));
    } else {
      localStorage.removeItem('fifoflow_venue_id');
    }
  }, [selectedVenueId]);

  return (
    <VenueContext.Provider value={{ selectedVenueId, setSelectedVenueId }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenueContext() {
  return useContext(VenueContext);
}
