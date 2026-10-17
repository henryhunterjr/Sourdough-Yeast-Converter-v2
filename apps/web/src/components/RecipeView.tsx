import { analyze, ROUND, type Recipe, type Analysis } from '@bgb/dough-core';
import type { Strings } from '../i18n';

const pct = (n: number) => `${ROUND.pct(n)}%`;
const g = (n: number) => `${ROUND.grams(n)}g`;

export function Stats({ a, s }: { a: Analysis; s: Strings }) {
  return (
    <div className="stats">
      <div className="stat"><b>{pct(a.hydration)}</b><span>{s.hydration}</span></div>
      <div className="stat"><b>{g(a.totalFlour)}</b><span>{s.flour}</span></div>
      <div className="stat"><b>{pct(a.saltPct)}</b><span>{s.salt}</span></div>
      {a.leavening !== 'yeast' && <div className="stat"><b>{pct(a.prefermentedFlourPct)}</b><span>{s.pff}</span></div>}
      {a.sugarPct > 0 && <div className="stat"><b>{pct(a.sugarPct)}</b><span>{s.sugar}</span></div>}
      {a.fatPct > 0 && <div className="stat"><b>{pct(a.fatPct)}</b><span>{s.fat}</span></div>}
    </div>
  );
}

export function RecipeView({ recipe, s, highlightChanges, showSteps = true }: { recipe: Recipe; s: Strings; highlightChanges?: boolean; showSteps?: boolean }) {
  const a = analyze(recipe);
  return (
    <>
      <Stats a={a} s={s} />
      {recipe.components.filter(c => c.ingredients.length > 0).map((c, i) => (
        <div className="section" key={i}>
          <h3>{c.name}<span className="kind">{s.kinds[c.kind]}</span></h3>
          <div>
            {c.ingredients.map((ing, j) => (
              <div className={`ing${ing.isReference ? ' ref' : ''}${highlightChanges && !ing.original ? ' changed' : ''}`} key={j}>
                <div className="g">{g(ing.grams)}</div>
                <div className="n">
                  {ing.name}{ing.isReference && <span className="o">{s.ref}</span>}
                  {ing.original && (
                    <span className="o">{ing.original.text}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {showSteps && recipe.steps.length > 0 && (
        <div className="section">
          <h3>{s.method}</h3>
          <ol className="steps">
            {recipe.steps.map((st, i) => (
              <li key={i} className={st.changed === 'edited' || st.changed === 'added' ? st.changed : ''}>
                {st.text}
                {st.changed === 'edited' && <span className="tag">{s.edited}</span>}
                {st.changed === 'added' && <span className="tag">{s.added}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {!!recipe.sourceNotes?.length && <details className="transcript"><summary>{s.sourceNotes}</summary>{recipe.sourceNotes.map((note, i) => <pre className="plain" key={i}>{note}</pre>)}</details>}
    </>
  );
}
