/**
 * TestHealthCards — list suspected bad tests with sample size + confidence label.
 * Shows "Confidence: low, screening only" when N < 20.
 */
export interface TestHealthCard {
  label: string;
  subject?: string;
  failCount: number;
  attempts: number;
  failRatePct?: number;
  aiClassification?: string;
  knownBad?: boolean;
}

interface TestHealthCardsProps {
  cards: TestHealthCard[];
}

const CONFIDENCE_THRESHOLD = 20;

function confidenceLabel(attempts: number): string {
  if (attempts >= CONFIDENCE_THRESHOLD) return "Confidence: medium";
  if (attempts >= 5) return "Confidence: low, screening only";
  return "Confidence: very low (sample too small)";
}

function confidenceTone(attempts: number): string {
  if (attempts >= CONFIDENCE_THRESHOLD) return "text-stone-600";
  return "text-amber-700";
}

export function TestHealthCards({ cards }: TestHealthCardsProps) {
  if (cards.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-6 text-center">
        <p className="text-sm font-medium text-ink mb-1">No bad tests flagged</p>
        <p className="text-xs text-stone-500">
          The Brain hasn't flagged any tests for review in your subject scope.
        </p>
      </section>
    );
  }
  return (
    <section className="grid gap-2 grid-cols-1 sm:grid-cols-2" aria-label="Test health">
      {cards.map((card) => {
        const failRate =
          card.failRatePct ??
          (card.attempts > 0
            ? Math.round((card.failCount / card.attempts) * 100)
            : null);
        return (
          <article
            key={card.label}
            className="rounded-lg border border-stone-200 bg-white p-3 space-y-2"
          >
            <header className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink truncate">
                  {card.label}
                </h3>
                {card.subject ? (
                  <p className="text-[11px] text-stone-500">{card.subject}</p>
                ) : null}
              </div>
              {card.knownBad ? (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-red-50 text-red-800 border-red-200">
                  Known bad
                </span>
              ) : null}
            </header>
            <dl className="grid grid-cols-2 gap-y-1 gap-x-3 text-xs">
              <dt className="text-stone-500">Fail rate</dt>
              <dd className="text-stone-800 tabular-nums text-right">
                {failRate === null ? "—" : `${failRate}%`}
              </dd>
              <dt className="text-stone-500">Attempts</dt>
              <dd className="text-stone-800 tabular-nums text-right">
                {card.attempts}
              </dd>
              {card.aiClassification ? (
                <>
                  <dt className="text-stone-500">AI</dt>
                  <dd className="text-stone-700 text-right truncate">
                    {card.aiClassification}
                  </dd>
                </>
              ) : null}
            </dl>
            <p className={`text-[11px] italic ${confidenceTone(card.attempts)}`}>
              {confidenceLabel(card.attempts)}
            </p>
          </article>
        );
      })}
    </section>
  );
}
