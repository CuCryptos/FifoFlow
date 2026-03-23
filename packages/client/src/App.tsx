import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './contexts/ToastContext';
import { VenueProvider } from './contexts/VenueContext';
import { Layout } from './components/Layout';

const OperatingMemo = lazy(async () => ({ default: (await import('./pages/OperatingMemo')).OperatingMemo }));
const Dashboard = lazy(async () => ({ default: (await import('./pages/Dashboard')).Dashboard }));
const Inventory = lazy(async () => ({ default: (await import('./pages/Inventory')).Inventory }));
const ItemDetail = lazy(async () => ({ default: (await import('./pages/ItemDetail')).ItemDetail }));
const Activity = lazy(async () => ({ default: (await import('./pages/Activity')).Activity }));
const Counts = lazy(async () => ({ default: (await import('./pages/Counts')).Counts }));
const Orders = lazy(async () => ({ default: (await import('./pages/Orders')).Orders }));
const Recipes = lazy(async () => ({ default: (await import('./pages/Recipes')).Recipes }));
const DraftRecipeDetailPage = lazy(async () => ({ default: (await import('./pages/Recipes')).DraftRecipeDetailPage }));
const PromotedRecipeDetailPage = lazy(async () => ({ default: (await import('./pages/Recipes')).PromotedRecipeDetailPage }));
const Reports = lazy(async () => ({ default: (await import('./pages/Reports')).Reports }));
const SnackBar = lazy(() => import('./pages/SnackBar'));
const SignalDetail = lazy(async () => ({ default: (await import('./pages/SignalDetail')).SignalDetail }));
const RecommendationsPage = lazy(async () => ({ default: (await import('./pages/Recommendations')).RecommendationsPage }));
const AllergyAssistant = lazy(async () => ({ default: (await import('./pages/AllergyAssistant')).AllergyAssistant }));
const ProteinUsage = lazy(async () => ({ default: (await import('./pages/ProteinUsage')).ProteinUsage }));

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
                <Route path="/" element={<RoutedPage><OperatingMemo /></RoutedPage>} />
                <Route path="/intelligence/signals/:signalId" element={<RoutedPage><SignalDetail /></RoutedPage>} />
                <Route path="/intelligence/recommendations" element={<RoutedPage><RecommendationsPage /></RoutedPage>} />
                <Route path="/intelligence/recommendations/:recommendationId" element={<RoutedPage><RecommendationsPage /></RoutedPage>} />
                <Route path="/dashboard" element={<RoutedPage><Dashboard /></RoutedPage>} />
                <Route path="/inventory" element={<RoutedPage><Inventory /></RoutedPage>} />
                <Route path="/inventory/:id" element={<RoutedPage><ItemDetail /></RoutedPage>} />
                <Route path="/orders" element={<RoutedPage><Orders /></RoutedPage>} />
                <Route path="/recipes" element={<RoutedPage><Recipes /></RoutedPage>} />
                <Route path="/recipes/drafts/:draftId" element={<RoutedPage><DraftRecipeDetailPage /></RoutedPage>} />
                <Route path="/recipes/promoted/:recipeVersionId" element={<RoutedPage><PromotedRecipeDetailPage /></RoutedPage>} />
                <Route path="/allergy-assistant" element={<RoutedPage><AllergyAssistant /></RoutedPage>} />
                <Route path="/protein-usage" element={<RoutedPage><ProteinUsage /></RoutedPage>} />
                <Route path="/activity" element={<RoutedPage><Activity /></RoutedPage>} />
                <Route path="/counts" element={<RoutedPage><Counts /></RoutedPage>} />
                <Route path="/reports" element={<RoutedPage><Reports /></RoutedPage>} />
                <Route path="/snack-bar" element={<RoutedPage><SnackBar /></RoutedPage>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </VenueProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function RoutedPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteLoadingState />}>
      {children}
    </Suspense>
  );
}

function RouteLoadingState() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Loading workspace</div>
      <div className="mt-3 text-lg font-semibold text-slate-950">Preparing the next operator view.</div>
      <div className="mt-2 text-sm text-slate-600">
        Route-level loading is now split so the app does not ship every workflow upfront.
      </div>
    </div>
  );
}
