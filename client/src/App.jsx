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
          <div className="brand-logo">U</div>
          <div>
            <div className="brand-name">UDIPilot</div>
            <div className="brand-sub">Urząd Miasta Bydgoszczy</div>
          </div>
        </div>
        <nav className="nav">
          <a href="#/" className={active('/')}><span className="ico">🗓</span> Rejestr wniosków</a>
          <a href="#/nowy" className={active('/nowy')}><span className="ico">＋</span> Nowy wniosek</a>
          <a href="#/anonimizator" className={active('/anonimizator')}><span className="ico">■</span> Anonimizator</a>
          <a href="#/wiedza" className={active('/wiedza')}><span className="ico">📚</span> Baza wiedzy</a>
          <a href="#/system" className={active('/system')}><span className="ico">🛡</span> Bezpieczeństwo i AI</a>
        </nav>
        <div className="sidebar-foot">
          <div><span className="dot" style={{ background: llm?.enabled ? (llm.local ? '#4ade80' : '#facc15') : '#4ade80' }} />
            <b>{llm?.enabled ? (llm.local ? 'AI lokalne' : 'AI zewnętrzne (demo)') : 'Tryb offline'}</b></div>
          <div style={{ opacity: .8, marginTop: 4 }}>
            {llm?.enabled ? `Model: ${llm.model}` : 'Reguły + wyszukiwanie lokalne. Dane nie opuszczają Urzędu.'}
          </div>
          <div style={{ opacity: .6, marginTop: 6 }}>Dziś: {status?.today?.split('-').reverse().join('.')}</div>
        </div>
      </aside>
      <main className="main">{page}</main>
    </div>
  );
}
