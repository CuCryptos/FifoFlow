import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { SignalDetailContent } from '../components/intelligence/SignalDetailContent';
import { useVenueContext } from '../contexts/VenueContext';
import { useSignalDetail } from '../hooks/useIntelligence';

export function SignalDetail() {
  const params = useParams();
  const signalId = Number(params.signalId);
  const { selectedVenueId } = useVenueContext();
  const safeSignalId = Number.isFinite(signalId) && signalId > 0 ? signalId : null;
  const query = useSignalDetail(safeSignalId, selectedVenueId, 7);

  if (safeSignalId == null) {
    return <InvalidState message="Signal id is invalid." />;
  }

  if (query.isLoading) {
    return <LoadingState message="Loading signal drilldown..." />;
  }

  if (query.error || !query.data) {
    return <InvalidState message={query.error instanceof Error ? query.error.message : 'Signal detail is unavailable.'} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900">
            <ArrowLeft size={16} />
            Back to Operating Memo
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Signal Drilldown</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Inspect the exact evidence, threshold reasoning, and downstream recommendation linkage for this persisted live signal.
          </p>
        </div>
      </div>

      <SignalDetailContent detail={query.data} />
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return <div className="text-sm text-slate-600">{message}</div>;
}

function InvalidState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3 text-amber-700">
        <ShieldAlert size={18} />
        <div className="text-sm font-semibold">{message}</div>
      </div>
      <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-slate-900">
        <ArrowLeft size={16} />
        Return to Operating Memo
      </Link>
    </div>
  );
}
