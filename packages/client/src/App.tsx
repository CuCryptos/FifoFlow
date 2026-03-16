import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './contexts/ToastContext';
import { VenueProvider } from './contexts/VenueContext';
import { Layout } from './components/Layout';
import { OperatingMemo } from './pages/OperatingMemo';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { ItemDetail } from './pages/ItemDetail';
import { Activity } from './pages/Activity';
import { Counts } from './pages/Counts';
import { Orders } from './pages/Orders';
import { Recipes } from './pages/Recipes';
import { Reports } from './pages/Reports';
import SnackBar from './pages/SnackBar';
import { SignalDetail } from './pages/SignalDetail';
import { RecommendationsPage } from './pages/Recommendations';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10000, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <VenueProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<OperatingMemo />} />
                <Route path="/intelligence/signals/:signalId" element={<SignalDetail />} />
                <Route path="/intelligence/recommendations" element={<RecommendationsPage />} />
                <Route path="/intelligence/recommendations/:recommendationId" element={<RecommendationsPage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/inventory/:id" element={<ItemDetail />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/recipes" element={<Recipes />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/counts" element={<Counts />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/snack-bar" element={<SnackBar />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </VenueProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
