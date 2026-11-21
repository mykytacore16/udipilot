import { useState } from 'react';
import { api, download } from '../api.js';
import { Dropzone, Spinner, useToast } from '../components/ui.jsx';
import AnonymizeView, { AnonList } from '../components/AnonymizeView.jsx';

export default function Anonimizator() {
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');

  const run = async (file) => {
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file); else fd.append('text', paste);
      const r = await api.post('/api/anonymize', fd);
      setDoc({ ...r, entities: r.entities.map((e, i) => ({ ...e, id: `a${i}` })) });
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const exp = (fmt) => download(`/api/anonymize/export.${fmt}`, { text: doc.text, entities: doc.entities }, `dokument.${fmt}`).catch((e) => toast(e.message, 'err'));
  const pending = doc?.entities.filter((e) => e.status === 'suggested').length || 0;
  const byType = doc ? Object.entries(doc.entities.reduce((m, e) => ((m[e.label] = (m[e.label] || 0) + 1), m), {})) : [];

  return (
    <div>
      <div className="page-head">
        <div><h1>Anonimizator dokumentów</h1><p>Dowolny dokument (np. materiał z wydziału, umowa, protokół) → wykrycie danych osobowych i tajemnic → wersja do udostępnienia.</p></div>
        {doc && <button className="btn" onClick={() => setDoc(null)}>Nowy dokument</button>}
      </div>
      {!doc ? (
        <div className="card card-pad stack" style={{ maxWidth: 860 }}>
          <Dropzone onFile={run} busy={busy} />
          <textarea rows={6} placeholder="…lub wklej tekst" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy || !paste.trim()} onClick={() => run(null)}>{busy ? <Spinner /> : '■'} Wykryj dane</button></div>
          <div className="alert info small">
            Wykrywane: imiona i nazwiska (słownik imion + kontekst), PESEL (z sumą kontrolną), NIP, REGON, nr rachunku (IBAN z weryfikacją), telefon, e-mail, adres, kod pocztowy,
            nr dowodu/paszportu, data urodzenia, nr rejestracyjny, nr księgi wieczystej. Osoby pełniące funkcje publiczne są oznaczane z ostrzeżeniem (art. 5 ust. 2 zd. 2).
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="card card-pad spread">
            <div className="row">
              <b>{doc.filename || 'Tekst wklejony'}</b>
              {byType.map(([l, n]) => <span key={l} className="badge">{l}: {n}</span>)}
            </div>
            <div className="row">
              <button className="btn dark" disabled={!pending} onClick={() => setDoc({ ...doc, entities: doc.entities.map((e) => (e.status === 'suggested' ? { ...e, status: 'accepted' } : e)) })}>■ Zaczernij wszystkie ({pending})</button>
              <button className="btn" onClick={() => exp('txt')}>⬇ TXT</button>
              <button className="btn primary" onClick={() => exp('docx')}>⬇ DOCX</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 14 }}>
            <div className="card"><AnonymizeView text={doc.text} entities={doc.entities} onChange={(entities) => setDoc({ ...doc, entities })} /></div>
            <div className="card"><div className="card-head"><h3>Wykryte dane ({doc.entities.length})</h3></div><AnonList entities={doc.entities} onChange={(entities) => setDoc({ ...doc, entities })} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
