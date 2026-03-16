import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, ShieldAlert } from 'lucide-react';
import { RecommendationDetailContent } from '../components/intelligence/RecommendationDetailContent';
import { useVenueContext } from '../contexts/VenueContext';
import { useRecommendationDetail, useRecommendations, useUpdateRecommendationStatus } from '../hooks/useIntelligence';

const STATUS_FILTERS = ['OPEN', 'REVIEWED', 'ACTIVE', 'DISMISSED'] as const;

export function RecommendationsPage() {
  const { selectedVenueId } = useVenueContext();
  const { recommendationId } = useParams();
  const navigate = useNavigate();
  const listQuery = useRecommendations(selectedVenueId, ['OPEN', 'REVIEWED', 'ACTIVE', 'DISMISSED'], 60);
  const selectedId = recommendationId ? Number(recommendationId) : null;
  const detailQuery = useRecommendationDetail(selectedId);
  const updateMutation = useUpdateRecommendationStatus();

  const selectedRecommendation = useMemo(() => {
    if (!selectedId || !listQuery.data?.recommendations) {
      return null;
    }
    return listQuery.data.recommendations.find((item) => Number(item.id) === selectedId) ?? null;
  }, [listQuery.data, selectedId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900">
            <ArrowLeft size={16} />
            Back to Operating Memo
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Recommendation Review</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Review durable operator actions synthesized from live signals, then explicitly move them through the recommendation lifecycle.
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((status) => (
              <span key={status} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                {status}
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {listQuery.isLoading ? <div className="text-sm text-slate-600">Loading recommendations...</div> : null}
            {listQuery.error ? <ErrorBox message={listQuery.error.message} /> : null}
            {listQuery.data?.recommendations.map((recommendation) => {
              const active = Number(recommendation.id) === selectedId;
              return (
                <button
                  key={String(recommendation.id)}
                  type="button"
                  onClick={() => navigate(`/intelligence/recommendations/${recommendation.id}`)}
                  className={`w-full rounded-3xl border p-4 text-left transition ${active ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'}`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className={`rounded-full border px-2.5 py-1 ${active ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                      {recommendation.status}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 ${active ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                      {recommendation.recommendation_type.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-semibold">{recommendation.summary}</div>
                  <div className={`mt-2 text-xs ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                    {recommendation.likely_owner} • {recommendation.evidence_count} evidence refs
                  </div>
                </button>
              );
            })}
            {!listQuery.isLoading && !listQuery.error && (listQuery.data?.recommendations.length ?? 0) === 0 ? (
              <EmptyBox message="No recommendations are available for the selected venue and statuses." />
            ) : null}
          </div>
        </section>

        <section>
          {!selectedId ? (
            <EmptyBox message="Select a recommendation to inspect its evidence, status history, and operator actions." />
          ) : detailQuery.isLoading ? (
            <div className="text-sm text-slate-600">Loading recommendation detail...</div>
          ) : detailQuery.error || !detailQuery.data ? (
            <ErrorBox message={detailQuery.error instanceof Error ? detailQuery.error.message : 'Recommendation detail is unavailable.'} />
          ) : (
            <RecommendationDetailContent
              detail={detailQuery.data}
              statusPending={updateMutation.isPending}
              onStatusChange={(status, notes) => {
                updateMutation.mutate({
                  id: selectedId,
                  status,
                  actor_name: 'Operator UI',
                  notes,
                });
              }}
            />
          )}
          {selectedRecommendation ? (
            <div className="mt-4 flex justify-end">
              <Link
                to={`/intelligence/recommendations/${selectedRecommendation.id}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-slate-900"
              >
                Direct link
                <ExternalLink size={15} />
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function EmptyBox({ message }: { message: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">{message}</div>;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldAlert size={16} />
        {message}
      </div>
    </div>
  );
}
