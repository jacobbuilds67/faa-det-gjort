import { useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Context, NamedEntity, Task } from '../domain/model';
import { parseQuickTask } from '../domain/quickAdd';

export function QuickAdd({
  ctx,
  locations,
  categories,
  onReview,
}: {
  ctx: Context;
  locations: NamedEntity[];
  categories: NamedEntity[];
  onReview: (task: Task) => void;
}) {
  const [text, setText] = useState('');
  const result = useMemo(
    () => (text.trim() ? parseQuickTask(text, ctx, locations, categories) : null),
    [text, ctx, locations, categories],
  );
  return (
    <section className="quick-add" aria-labelledby="quick-add-title">
      <div className="quick-add-heading">
        <span><Sparkles size={17} /></span>
        <div>
          <h2 id="quick-add-title">Skriv opgaven, som du tænker den</h2>
          <p>Fx “Vask bilen hjemme, 45 minutter, hver uge”. Du gennemser altid resultatet før gemning.</p>
        </div>
      </div>
      <div className="quick-add-form">
        <label>
          <span className="sr-only">Hurtig opgave</span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Hvad skal gøres, hvor og hvor længe?"
            maxLength={300}
          />
        </label>
        <button
          className="button secondary"
          disabled={!result || !result.task.title || !result.task.locationIds.length}
          onClick={() => result && onReview(result.task)}
        >
          Gennemse <ArrowRight size={16} />
        </button>
      </div>
      {result && (
        <div className="quick-add-result" aria-live="polite">
          <strong>{result.task.title || 'Titel mangler'}</strong>
          <div>{result.detected.map((value) => <span key={value}>{value}</span>)}</div>
          {result.warnings.map((warning) => <p className="quick-warning" key={warning}>{warning}</p>)}
        </div>
      )}
    </section>
  );
}
