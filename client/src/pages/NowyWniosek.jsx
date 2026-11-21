import { useState } from 'react';
import { api, plDate } from '../api.js';
import { Dropzone, DeptPicker, Spinner, useToast } from '../components/ui.jsx';
import { SimilarList, HintsList } from './shared.jsx';
import { go } from '../App.jsx';

const todayIso = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10); };

export default function NowyWniosek({ departments }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [received, setReceived] = useState(todayIso());
  const [a, setA] = useState(null);
  const [saving, setSaving] = useState(false);

  const analyze = async (file) => {
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file); else fd.append('text', paste);
      fd.append('received_at', received);
      const res = await api.post('/api/wnioski/analyze', fd);
      setA({ ...res, initials: '' });
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const c = await api.post('/api/wnioski', {
        text: a.text, filename: a.filename, received_at: a.received_at, initials: a.initials, summary: a.summary,
        meta: a.meta, questions: a.questions, classification: a.classification, number: a.number || undefined,
      });
      toast(`Zarejestrowano wniosek ${c.wniosek.number}`);
      go(`/wnioski/${c.wniosek.id}`);
    } catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  };

  const upd = (patch) => setA((x) => ({ ...x, ...patch }));
  const updQ = (i, patch) => setA((x) => ({ ...x, questions: x.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));

  if (!a) {
    return (
      <div style={{ maxWidth: 860 }}>
        <div className="page-head"><div><h1>Nowy wniosek</h1><p>Wgraj wniosek (PDF / Word) – system wyodrębni pytania, policzy termin, wskaże wydziały i podobne sprawy.</p></div></div>
        <div className="card card-pad stack">
          <label className="field" style={{ maxWidth: 220 }}>Data wpływu wniosku
            <input type="date" value={received} onChange={(e) => setReceived(e.target.value)} />
          </label>
          <Dropzone onFile={analyze} busy={busy} />
          <div className="muted small" style={{ textAlign: 'center' }}>— albo wklej treść wniosku (np. z e-maila) —</div>
          <textarea rows={7} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Treść wniosku…" />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" disabled={busy || paste.trim().length < 15} onClick={() => analyze(null)}>{busy ? <Spinner /> : '⚡'} Analizuj tekst</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>Weryfikacja nowego wniosku</h1><p>Sprawdź i popraw propozycje systemu. Nic nie zostanie zapisane ani wysłane bez Twojej akceptacji.</p></div>
        <div className="row">
          <button className="btn" onClick={() => setA(null)}>← Wróć</button>
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? <Spinner /> : '✓'} Zarejestruj wniosek</button>
        </div>
      </div>
      <div className="grid-main">
        <div className="stack">
          <div className="card card-pad stack">
            <div className="spread"><h2>Dane wniosku</h2>{a.filename && <span className="badge">📄 {a.filename}</span>}</div>
            <div className="grid-2">
              <label className="field">Wnioskodawca<input value={a.meta.requester || ''} onChange={(e) => upd({ meta: { ...a.meta, requester: e.target.value } })} /></label>
              <label className="field">Kontakt (e-mail)<input value={a.meta.email || ''} onChange={(e) => upd({ meta: { ...a.meta, email: e.target.value } })} /></label>
              <label className="field">Nr wniosku<input placeholder="nadawany automatycznie" value={a.number || ''} onChange={(e) => upd({ number: e.target.value })} /></label>
              <label className="field">Inicjały osoby prowadzącej<input value={a.initials} maxLength={4} onChange={(e) => upd({ initials: e.target.value.toUpperCase() })} /></label>
            </div>
            <label className="field">Krótki opis tematu<input value={a.summary || ''} onChange={(e) => upd({ summary: e.target.value })} /></label>
            <div className="alert info">
              <b>Termin odpowiedzi: {plDate(a.deadline)}</b>
              {a.deadline_explanation.map((x, i) => <div key={i} className="small">{x}</div>)}
              <div className="small">Forma udostępnienia wskazana we wniosku: <b>{a.meta.delivery}</b>{a.meta.requestDate ? ` · data na wniosku: ${plDate(a.meta.requestDate)}` : ''}</div>
            </div>
            {a.pii > 0 && <div className="alert warn small">Wniosek zawiera {a.pii} fragment(y) z danymi osobowymi – zostaną zaproponowane do anonimizacji w odpowiedzi.</div>}
          </div>

          <div className="card card-pad stack">
            <div className="spread"><h2>Pytania wnioskodawcy ({a.questions.length})</h2>{a.aiUsed && <span className="badge violet">podział: AI</span>}</div>
            <p className="muted small">Każde pytanie trafia do właściwego wydziału – w projekcie odpowiedzi system sprawdzi, czy na każde pytanie jest odpowiedź.</p>
            {a.questions.map((q, i) => (
              <div key={i} className="qrow">
                <div className="qno">{q.no}</div>
                <div className="stack" style={{ gap: 8 }}>
                  <textarea rows={2} value={q.text} onChange={(e) => updQ(i, { text: e.target.value })} />
                  <DeptPicker value={q.departments} departments={departments} suggestions={q.suggestions} onChange={(v) => updQ(i, { departments: v })} />
                  {q.suggestions[0] && <div className="faint small">Dlaczego {q.suggestions[0].code}: {q.suggestions[0].reasons.join(' · ')}</div>}
                </div>
              </div>
            ))}
            <div className="row">
              <button className="btn sm" onClick={() => setA((x) => ({ ...x, questions: [...x.questions, { no: x.questions.length + 1, text: '', departments: [], suggestions: [] }] }))}>+ Dodaj pytanie</button>
              {a.questions.length > 1 && <button className="btn sm ghost" onClick={() => setA((x) => ({ ...x, questions: x.questions.slice(0, -1) }))}>− Usuń ostatnie</button>}
            </div>
          </div>

          <details className="card card-pad">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Treść wniosku (odczytana z pliku)</summary>
            <div className="pre small" style={{ marginTop: 10 }}>{a.text}</div>
          </details>
        </div>

        <div className="stack">
          <HintsList hints={a.classification.hints} />
          <div className="card">
            <div className="card-head"><h3>Podobne sprawy z archiwum</h3></div>
            <div className="card-pad" style={{ paddingTop: 4 }}><SimilarList items={a.similar} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
