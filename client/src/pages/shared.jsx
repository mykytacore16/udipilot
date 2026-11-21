import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { plDate } from '../api.js';
import { RelBar } from '../components/ui.jsx';
import { go } from '../App.jsx';

export function SimilarList({ items }) {
  const [open, setOpen] = useState(null);
  if (!items?.length) return <div className="empty small">Brak podobnych spraw w archiwum.</div>;
  return items.map((s, i) => (
    <div key={i} className="similar">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <b>{s.number}</b> <span className="faint small">{plDate(s.date)}</span>
          {s.recent && <span className="badge blue" style={{ marginLeft: 6 }}>ostatni rok</span>}
          <div style={{ marginTop: 2 }}>{s.title}</div>
        </div>
        <div className="small faint" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <RelBar value={s.relevance} /> {s.relevance}%
        </div>
      </div>
      <div className="row small" style={{ gap: 4, marginTop: 4 }}>
        {s.departments.map((d) => <span key={d} className="chip">{d}</span>)}
        <span className="faint">wspólne: {s.matched.slice(0, 5).join(', ')}</span>
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <button className="btn ghost sm" onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Zwiń' : 'Pokaż odpowiedź'}</button>
        {s.wniosekId && <button className="btn ghost sm" onClick={() => go(`/wnioski/${s.wniosekId}`)}>Otwórz sprawę <ArrowRight /></button>}
      </div>
      {open === i && (
        <div className="small" style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 10, marginTop: 4 }}>
          <div className="faint" style={{ marginBottom: 4 }}>Pytanie:</div><div className="pre">{s.question}</div>
          <div className="faint" style={{ margin: '8px 0 4px' }}>Udzielona odpowiedź:</div><div className="pre">{s.answer}</div>
        </div>
      )}
    </div>
  ));
}

export function HintsList({ hints }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Wskazówki prawne</h3></div>
      <div className="card-pad stack" style={{ gap: 8 }}>
        {!hints?.length && <div className="alert ok small">Wygląda na zwykły wniosek o informację prostą – standardowe udostępnienie (art. 10 ust. 1, art. 13 ust. 1).</div>}
        {hints?.map((h, i) => (
          <div key={i} className="alert warn small">
            <b>{h.label}</b> <span className="faint">({h.basis})</span>
            <div>{h.why}</div>
            <div className="faint">Wykryto: „{h.trigger}”</div>
          </div>
        ))}
        <div className="faint small">Wskazówki są pomocnicze – kwalifikację prawną zawsze potwierdza urzędnik.</div>
      </div>
    </div>
  );
}
