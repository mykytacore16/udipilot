import { AlertTriangle, Bot, Check, Cloud, Cpu, Download, HardDrive, Plug, RefreshCw, Search, Server, Sparkles, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Spinner, useToast } from './ui.jsx';

const ORDER = [
  { id: 'ollama', icon: HardDrive, hint: 'Na komputerze Urzędu. Zalecane.' },
  { id: 'local', icon: Cpu, hint: 'LM Studio, llama.cpp, vLLM, Jan, GPT4All…' },
  { id: 'anthropic', icon: Sparkles, hint: 'Klucz z console.anthropic.com' },
  { id: 'openai', icon: Bot, hint: 'Klucz z platform.openai.com' },
  { id: 'gemini', icon: Cloud, hint: 'Klucz z aistudio.google.com' },
  { id: 'custom', icon: Server, hint: 'Dowolny serwer zgodny z OpenAI' },
];

// Ta sama reguła co na serwerze: ten komputer albo sieć wewnętrzna Urzędu.
export function isLocalUrl(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === 'host.docker.internal') return true;
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) return true;
  if (!host.includes('.') && !host.includes(':')) return true;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const [a, b] = [+m[1], +m[2]]; return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31); }
  return /^f[cd][0-9a-f]{2}:/.test(host);
}

const gb = (n) => (n / 1e9).toFixed(1).replace('.', ',') + ' GB';

export default function AiConnect({ onClose, onChanged }) {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [provider, setProvider] = useState('ollama');
  const [form, setForm] = useState({ model: '', baseUrl: '', apiKey: '' });
  const [accepted, setAccepted] = useState(false);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState('');
  const [ollama, setOllama] = useState(null);
  const [scan, setScan] = useState(null); // wykryte lokalne serwery
  const [models, setModels] = useState(null); // modele z serwera pod wpisanym adresem

  useEffect(() => {
    api.get('/api/ai').then((d) => {
      setInfo(d);
      const s = d.settings;
      if (s) {
        setProvider(s.provider);
        setForm({ model: s.model, baseUrl: s.baseUrl, apiKey: '' });
        setAccepted(s.cloudAccepted);
      } else {
        setForm({ model: d.providers.ollama.model, baseUrl: d.providers.ollama.baseUrl, apiKey: '' });
      }
    });
  }, []);

  const loadOllama = () => api.get('/api/ai/ollama').then(setOllama).catch(() => setOllama({ running: false, models: [] }));
  useEffect(() => { loadOllama(); }, []);
  // Postęp pobierania modelu
  useEffect(() => {
    if (ollama?.pull?.state !== 'running') return;
    const t = setTimeout(loadOllama, 1000);
    return () => clearTimeout(t);
  }, [ollama]);

  const runScan = () => { setScan('busy'); api.get('/api/ai/local').then((d) => setScan(d.servers)).catch(() => setScan([])); };
  useEffect(() => { if (provider === 'local' && scan === null) runScan(); }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps
  // pierwszy wykryty serwer wybierany automatycznie, jeśli adres jest pusty
  useEffect(() => {
    if (provider !== 'local' || !Array.isArray(scan) || !scan.length || form.baseUrl) return;
    setForm((f) => ({ ...f, baseUrl: scan[0].baseUrl, model: scan[0].models[0] || '' }));
    setModels(scan[0].models);
  }, [scan]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return <Modal title="Podłącz AI" onClose={onClose}><Spinner /></Modal>;

  const P = info.providers;
  const p = P[provider];
  const saved = info.settings;
  const isCloud = p.needsKey || (!!form.baseUrl && !isLocalUrl(form.baseUrl));
  const pick = (id) => {
    setProvider(id);
    setTest(null);
    const same = saved?.provider === id;
    setForm({ model: same ? saved.model : P[id].model, baseUrl: same ? saved.baseUrl : P[id].baseUrl, apiKey: '' });
    setAccepted(same && saved.cloudAccepted);
    setModels(null);
  };
  const useServer = (sv) => { setForm({ ...form, baseUrl: sv.baseUrl, model: sv.models.includes(form.model) ? form.model : sv.models[0] || '' }); setModels(sv.models); setTest(null); };
  const fetchModels = async () => {
    setBusy('models');
    try {
      const r = await api.post('/api/ai/models', { baseUrl: form.baseUrl, apiKey: form.apiKey });
      setModels(r.models);
      if (!r.ok) toast('Serwer nie odpowiada pod tym adresem', 'err');
      else if (!form.model && r.models[0]) setForm({ ...form, model: r.models[0] });
    } catch (e) { toast(e.message, 'err'); }
    setBusy('');
  };
  const suggestions = provider === 'ollama' ? (ollama?.models || []).map((m) => m.name) : models || [];
  const body = () => ({ provider, ...form, cloudAccepted: accepted });
  const keyStored = saved?.provider === provider && saved.hasKey;
  const bielikReady = ollama?.models?.some((m) => m.name === (form.model || P.ollama.model));

  const runTest = async () => {
    setBusy('test'); setTest(null);
    try { setTest(await api.post('/api/ai/test', body())); } catch (e) { setTest({ ok: false, error: e.message }); }
    setBusy('');
  };
  const save = async () => {
    setBusy('save');
    try {
      await api.put('/api/ai', body());
      toast(`Połączono: ${p.label}`);
      onChanged(); onClose();
    } catch (e) { toast(e.message, 'err'); }
    setBusy('');
  };
  const disconnect = async () => {
    await api.del('/api/ai');
    toast('AI odłączone – tryb offline na regułach');
    onChanged(); onClose();
  };
  const pull = async () => {
    await api.post('/api/ai/ollama/pull', { model: form.model || P.ollama.model });
    loadOllama();
  };

  const pullJob = ollama?.pull;
  const pct = pullJob?.total ? Math.round((pullJob.completed / pullJob.total) * 100) : 0;

  return (
    <Modal
      title="Podłącz AI"
      onClose={onClose}
      footer={<>
        {saved && !saved.fromEnv && <button className="btn danger" onClick={disconnect} style={{ marginRight: 'auto' }}><Unplug /> Odłącz</button>}
        <button className="btn" onClick={runTest} disabled={!!busy}>{busy === 'test' ? <Spinner /> : <Plug />} Sprawdź połączenie</button>
        <button className="btn primary" onClick={save} disabled={!!busy || (isCloud && !accepted)}>{busy === 'save' ? <Spinner /> : <Check />} Zapisz i połącz</button>
      </>}
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Aplikacja działa bez AI (reguły i wyszukiwanie lokalne). Model poprawia styl pism, dzieli trudne wnioski na pytania i wskazuje dodatkowe dane osobowe. Fakty zawsze pochodzą z odpowiedzi wydziałów.
      </p>

      <div className="ai-grid">
        {ORDER.map(({ id, icon: Icon, hint }) => (
          <button key={id} className={`ai-card ${provider === id ? 'on' : ''}`} onClick={() => pick(id)}>
            <Icon />
            <span className="ai-name">{P[id].label}</span>
            <span className="ai-hint">{hint}</span>
            <span className={`ai-tag ${id === 'ollama' || id === 'local' ? 'loc' : id === 'custom' ? '' : 'cloud'}`}>{id === 'ollama' || id === 'local' ? 'Lokalnie' : id === 'custom' ? 'Zależy od adresu' : 'Chmura'}</span>
          </button>
        ))}
      </div>

      {isCloud ? (
        <div className="alert err ai-warn">
          <div><AlertTriangle /> <b>To nie jest model lokalny. Dane opuszczą Urząd.</b></div>
          <div>Treść wniosków i odpowiedzi wydziałów (także dane osobowe przed anonimizacją) będzie wysyłana do zewnętrznego dostawcy{provider === 'anthropic' ? ' (Anthropic, USA)' : provider === 'openai' ? ' (OpenAI, USA)' : provider === 'gemini' ? ' (Google, USA)' : ''}. Może to naruszać RODO, tajemnicę przedsiębiorstwa i zasady bezpieczeństwa informacji Urzędu.</div>
          <div>Używaj wyłącznie do testów na danych fikcyjnych lub po zgodzie Inspektora Ochrony Danych i umowie powierzenia przetwarzania.</div>
          <label className="ai-accept">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            Rozumiem ryzyko i potwierdzam, że dane mogą zostać wysłane poza Urząd
          </label>
        </div>
      ) : (
        <div className="alert ok"><HardDrive /> Model działa na tym komputerze lub w sieci Urzędu – dane nie opuszczają Urzędu.</div>
      )}

      <div className="ai-form">
        {provider === 'ollama' && (
          <div className="ai-ollama">
            {!ollama ? <Spinner /> : !ollama.running ? (
              <div className="alert warn">Ollama nie jest uruchomiona. Zainstaluj ją z <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com</a> (lub uruchom instalator UDIPilot) i kliknij <a href="#" onClick={(e) => { e.preventDefault(); loadOllama(); }}>odśwież</a>.</div>
            ) : bielikReady ? (
              <div className="small"><Check /> Model jest pobrany i gotowy.</div>
            ) : pullJob?.state === 'running' ? (
              <div className="ai-progress">
                <div className="small">Pobieranie modelu… {pullJob.total ? `${pct}% (${gb(pullJob.completed)} z ${gb(pullJob.total)})` : pullJob.status}</div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            ) : (
              <div className="row">
                <span className="small">Model nie jest jeszcze pobrany (ok. 5 GB, jednorazowo).</span>
                <button className="btn sm" onClick={pull}><Download /> Pobierz Bielik</button>
                {pullJob?.state === 'error' && <span className="small" style={{ color: 'var(--red)' }}>{pullJob.error}</span>}
              </div>
            )}
          </div>
        )}
        {provider === 'local' && (
          <div className="ai-scan">
            <div className="spread">
              <span className="small"><b>Wykryte na tym komputerze</b></span>
              <button className="btn sm ghost" onClick={runScan} disabled={scan === 'busy'}>{scan === 'busy' ? <Spinner /> : <RefreshCw />} Szukaj ponownie</button>
            </div>
            {scan === 'busy' || scan === null ? <div className="small muted">Sprawdzam typowe porty (Ollama, LM Studio, llama.cpp, vLLM, Jan…)</div>
              : scan.length === 0 ? <div className="small muted">Nie znaleziono uruchomionego serwera. Włącz serwer w swoim programie (np. LM Studio → Developer → Start Server) i kliknij „Szukaj ponownie” albo wpisz adres poniżej.</div>
              : scan.map((sv) => (
                <button key={sv.baseUrl} className={`ai-server ${form.baseUrl === sv.baseUrl ? 'on' : ''}`} onClick={() => useServer(sv)}>
                  <Cpu /><b>{sv.name}</b><span className="muted">{sv.baseUrl}</span>
                  <span className="muted" style={{ marginLeft: 'auto' }}>{sv.models.length} {sv.models.length === 1 ? 'model' : 'modeli'}</span>
                </button>
              ))}
          </div>
        )}
        {(provider === 'custom' || provider === 'ollama' || provider === 'local') && (
          <label className="field">Adres serwera
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <input style={{ flex: 1 }} value={form.baseUrl} onChange={(e) => { setForm({ ...form, baseUrl: e.target.value }); setModels(null); }} placeholder="http://127.0.0.1:1234/v1" />
              {provider !== 'ollama' && <button type="button" className="btn sm" onClick={fetchModels} disabled={!!busy || !form.baseUrl}>{busy === 'models' ? <Spinner /> : <Search />} Pobierz listę modeli</button>}
            </div>
          </label>
        )}
        {(p.needsKey || provider === 'custom' || provider === 'local') && (
          <label className="field"><span>Klucz API{!p.needsKey && <span className="muted"> (opcjonalnie)</span>} {keyStored && <span className="muted">(zapisany: {saved.key} – zostaw puste, aby nie zmieniać)</span>}</span>
            <input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={keyStored ? '••••••••' : provider === 'anthropic' ? 'sk-ant-…' : provider === 'gemini' ? 'AIza…' : p.needsKey ? 'sk-…' : 'zwykle niepotrzebny'} />
          </label>
        )}
        <label className="field"><span>Model{suggestions.length > 0 && <span className="muted"> · {suggestions.length} dostępnych – kliknij pole, aby wybrać</span>}</span>
          <input list="ai-models" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={p.model || 'nazwa modelu'} />
          <datalist id="ai-models">{suggestions.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        {p.needsKey && <div className="small muted">Klucz jest zapisywany tylko lokalnie (data/settings.json) i nie trafia do repozytorium.</div>}
      </div>

      {test && (
        <div className={`alert ${test.ok ? 'ok' : 'err'}`} style={{ marginTop: 12 }}>
          {test.ok ? <>Połączenie działa · odpowiedź modelu: „{test.reply}” · {(test.ms / 1000).toFixed(1)} s</> : <>Nie udało się połączyć: {test.error}</>}
        </div>
      )}
    </Modal>
  );
}
