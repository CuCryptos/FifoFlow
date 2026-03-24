import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import { useAllergenQuery } from '../../hooks/useAllergens';
import type { AllergenReferencePayload, AllergenQueryResponsePayload } from '../../api';

const DEFAULT_QUICK_ALLERGENS = new Set(['milk', 'egg', 'peanut', 'tree_nuts', 'soy', 'wheat', 'fish', 'shellfish', 'sesame']);

export function GuestSafetyQueryPanel({
  allergens,
  venueId,
}: {
  allergens: AllergenReferencePayload[];
  venueId?: number | null;
}) {
  const queryMutation = useAllergenQuery();
  const [question, setQuestion] = useState('What is safe for a dairy allergy?');
  const [selectedCodes, setSelectedCodes] = useState<string[]>(['milk']);
  const [result, setResult] = useState<AllergenQueryResponsePayload | null>(null);

  const quickAllergens = useMemo(
    () => allergens.filter((allergen) => DEFAULT_QUICK_ALLERGENS.has(allergen.code)),
    [allergens],
  );

  const toggleCode = (code: string) => {
    setSelectedCodes((current) => (
      current.includes(code)
        ? current.filter((entry) => entry !== code)
        : [...current, code]
    ));
  };

  const runQuery = () => {
    queryMutation.mutate(
      {
        venue_id: venueId ?? undefined,
        question: question.trim(),
        allergen_codes: selectedCodes,
      },
      {
        onSuccess: (payload) => setResult(payload),
      },
    );
  };

  return (
    <WorkflowPanel
      title="Guest safety query"
      description="Structured, read-only query against item profiles and uploaded chart evidence."
    >
      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Question</label>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            placeholder="What products are safe for a dairy allergy?"
          />
          <div className="mt-3 text-xs leading-5 text-slate-500">
            The backend resolves explicit allergen codes from this question or from the selected chips below.
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Quick allergens</div>
          <div className="flex flex-wrap gap-2">
            {quickAllergens.length > 0 ? quickAllergens.map((allergen) => (
              <button
                key={allergen.code}
                type="button"
                onClick={() => toggleCode(allergen.code)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  selectedCodes.includes(allergen.code)
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {allergen.name}
              </button>
            )) : (
              <div className="text-sm text-slate-500">No quick allergens available from the reference list.</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {selectedCodes.length} allergen code{selectedCodes.length === 1 ? '' : 's'} selected
          </div>
          <button
            type="button"
            onClick={runQuery}
            disabled={queryMutation.isPending || (question.trim().length === 0 && selectedCodes.length === 0)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Search className="h-4 w-4" />
            {queryMutation.isPending ? 'Checking...' : 'Run query'}
          </button>
        </div>

        {queryMutation.isError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {queryMutation.error instanceof Error ? queryMutation.error.message : 'Allergen query failed.'}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resolved allergen codes</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.allergen_codes.map((code) => (
                  <WorkflowStatusPill key={code} tone="slate">{code}</WorkflowStatusPill>
                ))}
              </div>
            </div>

            <QueryResultSection title="Safe" tone="green" items={result.safe} />
            <QueryResultSection title="Ask kitchen" tone="amber" items={result.modifiable} />
            <QueryResultSection title="Avoid" tone="red" items={result.unsafe} />
            <QueryResultSection title="Unknown" tone="slate" items={result.unknown} />
          </div>
        ) : (
          <WorkflowEmptyState
            title="No query run yet"
            body="Run a structured query to classify uploaded chart products for a guest restriction."
          />
        )}
      </div>
    </WorkflowPanel>
  );
}

function QueryResultSection({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'green' | 'amber' | 'red' | 'slate';
  items: AllergenQueryResponsePayload['safe'];
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-950">{title}</div>
        <WorkflowStatusPill tone={tone}>{items.length}</WorkflowStatusPill>
      </div>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-slate-500">No results in this bucket.</div>
        ) : (
          items.map((item) => (
            <article key={`${item.document_id}-${item.product_id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{item.product_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.filename} • page {item.page_number}</div>
                </div>
                <WorkflowStatusPill tone={tone}>{item.source.replaceAll('_', ' ')}</WorkflowStatusPill>
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-700">{item.rationale}</div>
              {item.matched_item_name ? (
                <div className="mt-2 text-xs text-slate-500">Matched item: {item.matched_item_name}</div>
              ) : null}
              {item.relevant_evidence.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {item.relevant_evidence.slice(0, 3).map((evidence, index) => (
                    <div key={`${item.product_id}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      {evidence}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
