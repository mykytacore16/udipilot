import { AlertTriangle, BookOpen, CalendarDays, Cpu, EyeOff, FilePlus2, Landmark, Plug, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from './api.js';
import Wnioski from './pages/Wnioski.jsx';
import NowyWniosek from './pages/NowyWniosek.jsx';
import Sprawa from './pages/Sprawa.jsx';
import Anonimizator from './pages/Anonimizator.jsx';
import BazaWiedzy from './pages/BazaWiedzy.jsx';
import OSystemie from './pages/OSystemie.jsx';
import AiConnect from './components/AiConnect.jsx';

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const h = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return hash;
}

export const go = (path) => { window.location.hash = path; };

export default function App() {
  const hash = useHash();
  const [status, setStatus] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    api.get('/api/status').then(setStatus).catch(() => {});
  }, [hash, rev]);
  useEffect(() => {
    api.get('/api/departments').then(setDepartments).catch(() => {});
  }, [hash]);

  const path = hash.replace(/^#/, '');
  let page;
  const m = path.match(/^\/wnioski\/(\d+)/);
  if (m) page = <Sprawa id={+m[1]} departments={departments} llm={status?.llm} />;
  else if (path.startsWith('/nowy')) page = <NowyWniosek departments={departments} />;
  else if (path.startsWith('/anonimizator')) page = <Anonimizator llm={status?.llm} />;
  else if (path.startsWith('/wiedza')) page = <BazaWiedzy departments={departments} />;
  else if (path.startsWith('/system')) page = <OSystemie status={status} />;
  else page = <Wnioski />;

  const active = (p) => (p === '/' ? path === '/' || path.startsWith('/wnioski') : path.startsWith(p)) ? 'active' : '';
  const llm = status?.llm;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><Landmark /></div>
          <div>
            <div className="brand-name">UDIPilot</div>
            <div className="brand-sub">Urząd Miasta Bydgoszczy</div>
          </div>
        </div>
        <nav className="nav">
          <a href="#/" className={active('/')}><CalendarDays /> Rejestr wniosków</a>
          <a href="#/nowy" className={active('/nowy')}><FilePlus2 /> Nowy wniosek</a>
          <a href="#/anonimizator" className={active('/anonimizator')}><EyeOff /> Anonimizator</a>
          <a href="#/wiedza" className={active('/wiedza')}><BookOpen /> Baza wiedzy</a>
          <a href="#/system" className={active('/system')}><ShieldCheck /> Bezpieczeństwo i AI</a>
        </nav>
        <div className={`sidebar-foot ${llm?.enabled && !llm.local ? 'cloud' : ''}`}>
          <div className="foot-title">{llm?.enabled && !llm.local ? <AlertTriangle /> : <Cpu />} {llm?.enabled ? (llm.local ? 'AI lokalne' : 'AI w chmurze') : 'AI nie jest podłączone'}<span className="dot" style={{ background: !llm?.enabled ? '#c7c7cc' : llm.local ? '#30d158' : '#ff3b30' }} /></div>
          <div className="foot-text">
            {llm?.enabled ? llm.model.replace(/^.*\//, '').replace(/-instruct.*$/, '') : 'Działa tryb offline: reguły i wyszukiwanie lokalne'}
          </div>
          <div className="foot-text">{!llm?.enabled || llm.local ? 'Dane nie opuszczają Urzędu' : 'Uwaga: dane są wysyłane poza Urząd'}</div>
          {llm?.enabled
            ? <button className="btn sm foot-btn" onClick={() => setAiOpen(true)}><Plug /> Zmień model AI</button>
            : <button className="btn primary sm foot-btn" onClick={() => setAiOpen(true)}><Plug /> Podłącz AI</button>}
          <div className="foot-date">{status?.today?.split('-').reverse().join('.')}</div>
        </div>
      </aside>
      <main className="main">{page}</main>
      {aiOpen && <AiConnect onClose={() => setAiOpen(false)} onChanged={() => setRev((r) => r + 1)} />}
    </div>
  );
}
