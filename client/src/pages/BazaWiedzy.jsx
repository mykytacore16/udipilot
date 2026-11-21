import { useEffect, useState } from 'react';
import { api, plDate } from '../api.js';
import { Dropzone, Modal, Spinner, useToast } from '../components/ui.jsx';
import { SimilarList } from './shared.jsx';

const KINDS = { archiwum: 'Archiwalna odpowiedź', ustawa: 'Akt prawny', zarzadzenie: 'Zarządzenie / procedura', inne: 'Inny dokument' };

export default function BazaWiedzy({ departments }) {
  const toast = useToast();
  const [docs, setDocs] = useState(null);
  const [tab, setTab] = useState('archiwum');
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [form, setForm] = useState({ kind: 'archiwum', title: '', departments: '', number: '', date: '' });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);

  const load = () => api.get('/api/knowledge').then(setDocs);
  useEffect(() => { load(); }, []);

  const upload = async (file) => {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      fd.append('file', file);
      await api.post('/api/knowledge', fd);
      toast('Dokument dodany do bazy wiedzy – od razu dostępny w wyszukiwaniu');
      setForm({ ...form, title: '', number: '' });
      load();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const importJson = async (file) => {
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post('/api/knowledge/import', fd);
      toast(`Zaimportowano ${r.imported} archiwalnych odpowiedzi`);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const search = async () => setRes(await api.get(`/api/knowledge/search?q=${encodeURIComponent(q)}`));

  if (!docs) return <div className="empty"><Spinner /></div>;
  const list = docs.filter((d) => (tab === 'archiwum' ? d.kind === 'archiwum' : d.kind !== 'archiwum'));

  return (
    <div>
      <div className="page-head">
        <div><h1>Baza wiedzy</h1><p>Na tych dokumentach system „uczy się”: archiwalne odpowiedzi podpowiadają podobne sprawy i wydziały, akty prawne – podstawy prawne.</p></div>
      </div>
      <div className="grid-main">
        <div className="card">
          <div className="tabs">
            <button className={tab === 'archiwum' ? 'active' : ''} onClick={() => setTab('archiwum')}>Archiwum odpowiedzi <span className="badge count">{docs.filter((d) => d.kind === 'archiwum').length}</span></button>
            <button className={tab === 'prawo' ? 'active' : ''} onClick={() => setTab('prawo')}>Akty prawne i procedury <span className="badge count">{docs.filter((d) => d.kind !== 'archiwum').length}</span></button>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Rodzaj</th><th>Nr</th><th>Tytuł</th><th>Wydziały</th><th>Data</th><th /></tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id} className="clickable" onClick={async () => setView(await api.get(`/api/knowledge/${d.id}`))}>
                    <td><span className="badge">{KINDS[d.kind]}</span>{d.source_wniosek_id && <span className="badge green" style={{ marginLeft: 4 }}>z systemu</span>}</td>
                    <td className="mono">{d.number || '—'}</td>
                    <td>{d.title}</td>
                    <td>{d.departments.map((x) => <span key={x} className="chip" style={{ marginRight: 3 }}>{x}</span>)}</td>
                    <td>{plDate(d.date)}</td>
                    <td><button className="btn ghost sm danger" onClick={async (e) => { e.stopPropagation(); if (confirm('Usunąć dokument z bazy wiedzy?')) { await api.del(`/api/knowledge/${d.id}`); load(); } }}>Usuń</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad stack">
            <h3>Dodaj dokument</h3>
            <label className="field">Rodzaj
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">Tytuł (opcjonalnie)<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            {form.kind === 'archiwum' && (
              <div className="grid-2">
                <label className="field">Nr sprawy<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
                <label className="field">Wydziały (kody)<input placeholder="np. WGK, WOŚ" value={form.departments} onChange={(e) => setForm({ ...form, departments: e.target.value })} /></label>
              </div>
            )}
            <Dropzone onFile={upload} busy={busy} label="Wgraj PDF / DOCX / TXT" hint={form.kind === 'archiwum' ? 'W pliku oddziel wniosek od odpowiedzi linią „ODPOWIEDŹ:”' : 'np. tekst ustawy z ISAP, zarządzenie Prezydenta'} />
            <div className="faint small">Import hurtowy archiwum (JSON: number, date, title, departments, question, answer):</div>
            <input type="file" accept=".json" onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
          </div>

          <div className="card card-pad stack">
            <h3>Test wyszukiwania</h3>
            <div className="row"><input className="grow" placeholder="np. wycinka drzew, termin, kwerenda" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} /><button className="btn" onClick={search}>Szukaj</button></div>
            {res && (
              <>
                <h4>Archiwum</h4>
                <SimilarList items={res.archive} />
                <h4>Przepisy</h4>
                {res.law.map((l, i) => <div key={i} className="small" style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}><b>{l.title}</b><div className="pre muted">{l.excerpt}</div></div>)}
                {!res.law.length && <div className="faint small">Brak trafień.</div>}
              </>
            )}
          </div>
        </div>
      </div>
      {view && (
        <Modal title={view.title} onClose={() => setView(null)}>
          {view.question && <><h4>Wniosek</h4><div className="pre small" style={{ marginBottom: 12 }}>{view.question}</div><h4>Odpowiedź</h4><div className="pre small">{view.answer}</div></>}
          {!view.question && <div className="pre small">{view.text}</div>}
        </Modal>
      )}
    </div>
  );
}
