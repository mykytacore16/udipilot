import { Download, Plus, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, download, plDate, STATUS, STATUS_ORDER } from '../api.js';
import { StatusBadge, UrgencyBadge, Spinner, Modal, useToast } from '../components/ui.jsx';
import { go } from '../App.jsx';
import { holidays } from '../holidays.js';

export default function Wnioski() {
  const [data, setData] = useState(null);
  const [year, setYear] = useState(null);
  const [view, setView] = useState(() => (window.location.hash.includes('kalendarz') ? 'kalendarz' : 'tabela'));
  const [filter, setFilter] = useState('wszystkie');
  const [q, setQ] = useState('');

  const toast = useToast();
  const [imp, setImp] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    api.get(`/api/wnioski${year ? `?year=${year}` : ''}`).then((d) => { setData(d); if (!year) setYear(d.year); });
  }, [year, reload]);

  const importXlsx = async (file) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/api/wnioski/import', fd);
      setImp({ ...r, name: file.name });
      setReload((x) => x + 1);
    } catch (e) { toast(e.message, 'err'); }
  };

  const items = useMemo(() => {
    if (!data) return [];
    return data.items.filter((w) => {
      if (filter === 'otwarte' && w.status === 'wyslana') return false;
      if (filter === 'pilne' && !['overdue', 'today', 'tomorrow'].includes(w.urgency.level)) return false;
      if (STATUS[filter] && w.status !== filter) return false;
      if (q && !`${w.number} ${w.summary} ${w.requester} ${w.initials} ${w.departments.join(' ')}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [data, filter, q]);

  if (!data) return <div className="empty"><Spinner /></div>;
  const all = data.items;
  const open = all.filter((w) => w.status !== 'wyslana');
  const k = {
    open: open.length,
    overdue: open.filter((w) => w.urgency.level === 'overdue').length,
    urgent: open.filter((w) => ['today', 'tomorrow'].includes(w.urgency.level)).length,
    kwerenda: open.filter((w) => ['kwerenda', 'doprecyzowanie'].includes(w.status)).length,
    done: all.length - open.length,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Rejestr wniosków o udostępnienie informacji publicznej</h1>
          <p>Kolejność od najstarszego do najnowszego. Terminy liczone automatycznie (art. 13 u.d.i.p., art. 57 § 4 KPA).</p>
        </div>
        <div className="row">
          <select value={year || ''} onChange={(e) => setYear(+e.target.value)} title="Rok">
            {data.years.map((y) => <option key={y} value={y}>Rok {y}</option>)}
          </select>
          <label className="btn" title="Wczytaj rejestr w formacie arkusza UMB (XLSX)">
            <Upload /> Import z Excela
            <input type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importXlsx(f); }} />
          </label>
          <button className="btn" onClick={() => download(`/api/wnioski/export.xlsx?year=${data.year}`, null, 'wnioski.xlsx').catch((e) => toast(e.message, 'err'))}><Download /> Eksport do Excela</button>
          <button className="btn primary" onClick={() => go('/nowy')}><Plus /> Nowy wniosek</button>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="l">W toku</div><div className="v">{k.open}</div></div>
        <div className="card kpi red"><div className="l">Po terminie</div><div className="v">{k.overdue}</div></div>
        <div className="card kpi orange"><div className="l">Termin dziś / jutro</div><div className="v">{k.urgent}</div></div>
        <div className="card kpi violet"><div className="l">Kwerenda / doprecyzowanie</div><div className="v">{k.kwerenda}</div></div>
        <div className="card kpi"><div className="l">Zakończone w {data.year}</div><div className="v">{k.done}</div></div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div className="row">
            <div className="segmented">
              <button className={view === 'tabela' ? 'active' : ''} onClick={() => setView('tabela')}>Tabela</button>
              <button className={view === 'kalendarz' ? 'active' : ''} onClick={() => setView('kalendarz')}>Kalendarz</button>
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="wszystkie">Wszystkie</option>
              <option value="otwarte">Tylko w toku</option>
              <option value="pilne">Pilne (po terminie / dziś / jutro)</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <input placeholder="Szukaj: nr, temat, wydział, inicjały…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          </div>
          <div className="legend">
            <span className="l-red">po terminie</span>
            <span className="l-orange">termin dziś</span>
            <span className="l-yellow">termin jutro</span>
            <span className="l-violet">kwerenda / doprecyzowanie</span>
          </div>
        </div>
        {view === 'tabela' ? <Table items={items} /> : <Calendar items={items} year={data.year} />}
      </div>

      {imp && (
        <Modal title={`Import rejestru: ${imp.name}`} onClose={() => setImp(null)} footer={<button className="btn primary" onClick={() => setImp(null)}>OK</button>}>
          <div className="stack">
            <div className="alert ok">Dodano {imp.created} wniosków, zaktualizowano {imp.updated}. Terminy przeliczono zgodnie z art. 13 u.d.i.p. i art. 57 § 4 KPA.</div>
            {imp.warnings.length > 0 && <h3>Wykryte niezgodności ({imp.warnings.length})</h3>}
            {imp.warnings.map((w) => (
              <div key={w.number} className="alert warn small"><b className="mono">{w.number}</b>{w.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Kolumny zgodne z arkuszem UMB „WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ” + status i wydziały.
function Table({ items }) {
  if (!items.length) return <div className="empty">Brak wniosków dla wybranych filtrów.</div>;
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>Lp.</th><th>Numer sprawy</th><th>Wnioskodawca</th><th style={{ minWidth: 240 }}>Przedmiot zapytania</th><th>Data wpływu</th><th>Termin odpowiedzi</th>
            <th>Data odpowiedzi</th><th>Osoba odpowiedzialna</th><th>Pozostało dni</th><th>Status</th><th>Wydziały</th>
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.id} className={`clickable u-${w.urgency.level}`} onClick={() => go(`/wnioski/${w.id}`)}>
              <td className="muted">{w.lp}</td>
              <td><b className="mono" style={{ fontSize: 12 }}>{w.number}</b>{w.import_notes?.length > 0 && <div title={w.import_notes.join('\n')} className="small" style={{ color: 'var(--orange)', cursor: 'help' }}><TriangleAlert /> uwagi ({w.import_notes.length})</div>}</td>
              <td className="small">{w.requester || '—'}</td>
              <td>{w.summary}</td>
              <td>{plDate(w.received_at)}</td>
              <td>
                {w.clarification_received_at && w.sheet_deadline && <div className="small faint" style={{ textDecoration: 'line-through' }}>{plDate(w.sheet_deadline)}</div>}
                <b>{w.status === 'doprecyzowanie' ? 'wstrzymany' : plDate(w.deadline)}</b>
                {w.status === 'kwerenda' && <div className="small" style={{ color: 'var(--violet)' }}>przedłużony</div>}
                {(w.clarification_received_at || w.status === 'doprecyzowanie') && <div className="small" style={{ color: 'var(--violet)' }}>doprecyzowanie wniosku</div>}
              </td>
              <td>{plDate(w.answered_at)}</td>
              <td className="small">{w.initials || '—'}</td>
              <td><UrgencyBadge urgency={w.urgency} /></td>
              <td><StatusBadge status={w.status} /></td>
              <td>{w.departments.map((d) => <span key={d} className="chip" style={{ marginRight: 4 }}>{d}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

function Calendar({ items, year }) {
  const now = new Date();
  const [ym, setYm] = useState(() => (year === now.getFullYear() ? [year, now.getMonth()] : [year, 11]));
  const [y, m] = ym;
  const first = new Date(Date.UTC(y, m, 1));
  const startDow = (first.getUTCDay() + 6) % 7;
  const days = [];
  for (let i = -startDow; i < 42 - startDow; i++) days.push(new Date(Date.UTC(y, m, 1 + i)));
  const iso = (d) => d.toISOString().slice(0, 10);
  const todayIso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
  const hol = { ...holidays(y - 1), ...holidays(y), ...holidays(y + 1) };
  const shift = (d) => { const nm = m + d; setYm([y + Math.floor(nm / 12), ((nm % 12) + 12) % 12]); };

  return (
    <div>
      <div className="spread card-pad" style={{ paddingTop: 10, paddingBottom: 10 }}>
        <button className="btn sm" onClick={() => shift(-1)}>‹ Poprzedni</button>
        <h3>{MONTHS[m]} {y}</h3>
        <button className="btn sm" onClick={() => shift(1)}>Następny ›</button>
      </div>
      <div className="cal">
        {['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map((d) => <div key={d} className="dow">{d}</div>)}
        {days.map((d) => {
          const s = iso(d);
          const dl = items.filter((w) => w.deadline === s);
          const inc = items.filter((w) => w.received_at === s);
          const off = d.getUTCDay() === 0 || d.getUTCDay() === 6 || hol[s];
          return (
            <div key={s} className={`day ${off ? 'off' : ''} ${d.getUTCMonth() !== m ? 'other' : ''} ${s === todayIso ? 'today' : ''}`}>
              <div className="dnum"><span>{d.getUTCDate()}</span>{hol[s] && <span className="hol" title={hol[s]}>{hol[s].slice(0, 14)}</span>}</div>
              {dl.map((w) => (
                <div key={`d${w.id}`} className={`ev deadline ${w.urgency.level}`} title={`Termin: ${w.number} – ${w.summary}`} onClick={() => go(`/wnioski/${w.id}`)}>
                  {w.number} {w.summary}
                </div>
              ))}
              {inc.map((w) => (
                <div key={`i${w.id}`} className="ev in" title={`Wpływ: ${w.number}`} onClick={() => go(`/wnioski/${w.id}`)}>
                  wpływ {w.number}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
