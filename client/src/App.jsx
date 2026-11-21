import { BookOpen, CalendarDays, Cpu, EyeOff, FilePlus2, Landmark, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from './api.js';
import Wnioski from './pages/Wnioski.jsx';
import NowyWniosek from './pages/NowyWniosek.jsx';
import Sprawa from './pages/Sprawa.jsx';
import Anonimizator from './pages/Anonimizator.jsx';
import BazaWiedzy from './pages/BazaWiedzy.jsx';
import OSystemie from './pages/OSystemie.jsx';

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
  useEffect(() => {
    api.get('/api/status').then(setStatus).catch(() => {});
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
        <div className="sidebar-foot">
          <div className="foot-title"><Cpu /> {llm?.enabled ? (llm.local ? 'AI lokalne' : 'AI zewnętrzne (demo)') : 'Tryb offline'}<span className="dot" style={{ background: llm?.enabled && !llm.local ? '#ff9f0a' : '#30d158' }} /></div>
          <div className="foot-text">
            {llm?.enabled ? llm.model.replace(/^.*\//, '').replace(/-instruct.*$/, '') : 'Reguły i wyszukiwanie lokalne'}
          </div>
          <div className="foot-text">Dane nie opuszczają Urzędu</div>
          <div className="foot-date">{status?.today?.split('-').reverse().join('.')}</div>
        </div>
      </aside>
      <main className="main">{page}</main>
    </div>
  );
}
