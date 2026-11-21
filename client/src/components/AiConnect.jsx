import { AlertTriangle, Bot, Check, Cloud, Download, HardDrive, Plug, Server, Sparkles, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Spinner, useToast } from './ui.jsx';

const ORDER = [
  { id: 'ollama', icon: HardDrive, hint: 'Na komputerze Urzędu. Zalecane.' },
  { id: 'anthropic', icon: Sparkles, hint: 'Klucz z console.anthropic.com' },
  { id: 'openai', icon: Bot, hint: 'Klucz z platform.openai.com' },
  { id: 'gemini', icon: Cloud, hint: 'Klucz z aistudio.google.com' },
  { id: 'custom', icon: Server, hint: 'vLLM, LM Studio, PLLuM…' },
];

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

  if (!info) return <Modal title="Podłącz AI" onClose={onClose}><Spinner /></Modal>;

  const P = info.providers;
  const p = P[provider];
  const saved = info.settings;
  const isCloud = provider === 'anthropic' || (provider === 'custom' ? !/localhost|127\.0\.0\.1|\[::1\]|\.local\b|:11434/.test(form.baseUrl) : !p.local);
  const pick = (id) => {
    setProvider(id);
    setTest(null);
    const same = saved?.provider === id;
    setForm({ model: same ? saved.model : P[id].model, baseUrl: same ? saved.baseUrl : P[id].baseUrl, apiKey: '' });
    setAccepted(same && saved.cloudAccepted);
  };
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
            <span className={`ai-tag ${id === 'ollama' ? 'loc' : id === 'custom' ? '' : 'cloud'}`}>{id === 'ollama' ? 'Lokalnie' : id === 'custom' ? 'Zależy od adresu' : 'Chmura'}</span>
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
        <div className="alert ok"><HardDrive /> Model działa na tym komputerze – dane nie opuszczają Urzędu.</div>
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
        {(provider === 'custom' || provider === 'ollama') && (
          <label className="field">Adres serwera
            <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="http://127.0.0.1:8000/v1" />
          </label>
        )}
        {(p.needsKey || provider === 'custom') && (
          <label className="field">Klucz API {keyStored && <span className="muted">(zapisany: {saved.key} – zostaw puste, aby nie zmieniać)</span>}
            <input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={keyStored ? '••••••••' : provider === 'anthropic' ? 'sk-ant-…' : provider === 'gemini' ? 'AIza…' : 'sk-…'} />
          </label>
        )}
        <label className="field">Model
          <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={p.model} />
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
