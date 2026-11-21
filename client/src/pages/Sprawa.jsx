import { ArrowRight, Check, ChevronLeft, CircleCheck, CircleHelp, ClipboardCopy, Download, EyeOff, FileText, Hourglass, Mail, Save, Send, Sparkles, TriangleAlert, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, download, plDate, STATUS } from '../api.js';
import { DeptPicker, Dropzone, Modal, Spinner, StatusBadge, UrgencyBadge, useToast } from '../components/ui.jsx';
import AnonymizeView, { AnonList } from '../components/AnonymizeView.jsx';
import { HintsList, SimilarList } from './shared.jsx';
import { go } from '../App.jsx';
import LetterEditor from '../components/LetterEditor.jsx';

let docSeq = 0;

const TYPES = [
  ['udostepnienie', 'Udostępnienie informacji', 'art. 10 ust. 1, art. 13 ust. 1'],
  ['przedluzenie', 'Zawiadomienie o przedłużeniu (kwerenda)', 'art. 13 ust. 2'],
  ['doprecyzowanie', 'Wezwanie do doprecyzowania wniosku', 'termin biegnie od doprecyzowania'],
  ['przetworzona', 'Wezwanie – informacja przetworzona', 'art. 3 ust. 1 pkt 1'],
  ['bip', 'Odesłanie do BIP', 'art. 10 ust. 1'],
  ['nie_ip', 'To nie jest informacja publiczna', 'art. 1 ust. 1, art. 6'],
  ['odmowa', 'Decyzja o odmowie', 'art. 16 w zw. z art. 5 ust. 2'],
];
const STEPS = [['nowy', 'Wpłynął'], ['w_wydzialach', 'Zapytania do wydziałów'], ['kwerenda', 'Kwerenda'], ['przygotowana', 'Odpowiedź przygotowana'], ['wyslana', 'Wysłana']];

export default function Sprawa({ id, departments, llm }) {
  const toast = useToast();
  const [c, setC] = useState(null);
  const [tab, setTab] = useState('pytania');
  const [modal, setModal] = useState(null);

  const load = () => api.get(`/api/wnioski/${id}`).then(setC).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, [id]);

  const call = async (fn, okMsg) => {
    try {
      const r = await fn();
      if (r?.wniosek) setC((prev) => ({ ...prev, ...r }));
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) { toast(e.message, 'err'); }
  };

  if (!c) return <div className="empty"><Spinner /></div>;
  const w = c.wniosek;
  const assigned = [...new Set(c.questions.flatMap((q) => q.departments))];
  const pending = c.entities.filter((e) => e.status === 'suggested').length;

  return (
    <div>
      <div className="row small" style={{ marginBottom: 10 }}><a href="#/" className="back"><ChevronLeft /> Rejestr wniosków</a></div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="row" style={{ gap: 8 }}>
              <h1>Wniosek {w.number}</h1>
              <StatusBadge status={w.status} />
              {w.filename && <span className="badge"><FileText /> {w.filename}</span>}
            </div>
            <div style={{ fontSize: 15, marginTop: 6 }}>{w.summary}</div>
            <div className="muted small" style={{ marginTop: 4 }}>
              {w.requester || 'Wnioskodawca nieustalony'}{w.requester_contact ? ` · ${w.requester_contact}` : ''} · wpływ {plDate(w.received_at)} · forma odpowiedzi: {w.delivery || '—'} · osoba odpowiedzialna: <b>{w.initials || '—'}</b>
            </div>
          </div>
          <div className={`deadline-box ${w.urgency.level}`}>
            <div className="small muted">{w.status === 'kwerenda' ? 'Termin przedłużony do' : 'Termin odpowiedzi'}</div>
            <div className="big" title={w.deadline_explanation.join('\n')}>{plDate(w.deadline)}</div>
            <UrgencyBadge urgency={w.urgency} />
            {w.status === 'wyslana' && <div className="small muted">Wysłano: {plDate(w.answered_at)}</div>}
          </div>
        </div>
        <div className="stepper">
          {STEPS.map(([s, l]) => {
            const order = ['nowy', 'w_wydzialach', 'kwerenda', 'przygotowana', 'wyslana'];
            const ci = order.indexOf(w.status === 'doprecyzowanie' ? 'nowy' : w.status);
            const si = order.indexOf(s);
            let cls = si < ci || w.status === 'wyslana' ? 'done' : si === ci ? 'cur' : '';
            // Kwerenda jest opcjonalna: gdy sprawa poszła dalej bez przedłużenia – etap pominięty, linia ciągła.
            const skipped = s === 'kwerenda' && !w.extension_until && ci > si;
            if (skipped) cls = 'done skip';
            if (s === 'kwerenda' && w.extension_until && ci >= si) cls = ci === si ? 'cur' : 'done';
            return <div key={s} className={`step ${cls}`}>{l}{s === 'kwerenda' && w.extension_until ? ` (do ${plDate(w.extension_until)})` : skipped ? ' – pominięta' : ''}</div>;
          })}
        </div>
        {w.import_notes?.length > 0 && (
          <div className="alert warn small" style={{ marginTop: 14 }}>
            <b>Uwagi z importu arkusza rejestru:</b>
            {w.import_notes.map((n, i) => <div key={i}>• {n}</div>)}
          </div>
        )}
        {w.status === 'doprecyzowanie' && (
          <div className="alert info small" style={{ marginTop: 14 }}>
            Wezwano do doprecyzowania wniosku{w.clarification_requested_at ? ` (${plDate(w.clarification_requested_at)})` : ''}. Termin na odpowiedź jest wstrzymany i biegnie na nowo od dnia otrzymania doprecyzowania.
          </div>
        )}
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          {w.status === 'doprecyzowanie'
            ? <button className="btn primary" onClick={() => setModal('doprec-in')}><Check /> Wpłynęło doprecyzowanie</button>
            : w.status !== 'wyslana' && <button className="btn" onClick={() => setModal('doprec')}><CircleHelp /> Wezwij do doprecyzowania</button>}
          {w.status !== 'wyslana' && <button className="btn" onClick={() => setModal('kwerenda')}><Hourglass /> Kwerenda / przedłuż termin</button>}
          {w.status !== 'wyslana' && <button className="btn" onClick={() => setModal('sent')}><Send /> Oznacz jako wysłaną</button>}
        </div>
      </div>

      <div className="grid-main" style={['projekt', 'anon'].includes(tab) ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
        <div className="card">
          <div className="tabs">
            <button className={tab === 'pytania' ? 'active' : ''} onClick={() => setTab('pytania')}>1. Wniosek i wydziały</button>
            <button className={tab === 'odpowiedzi' ? 'active' : ''} onClick={() => setTab('odpowiedzi')}>2. Odpowiedzi <span className="badge count">{c.responses.length}</span></button>
            <button className={tab === 'projekt' ? 'active' : ''} onClick={() => setTab('projekt')}>3. Projekt pisma {c.draft && (c.verification?.ok ? <span className="badge green count"><Check /></span> : <span className="badge orange count">!</span>)}</button>
            <button className={tab === 'anon' ? 'active' : ''} onClick={() => setTab('anon')}>4. Anonimizacja i eksport {pending > 0 && <span className="badge count">{pending}</span>}</button>
            <button className={tab === 'historia' ? 'active' : ''} onClick={() => setTab('historia')}>Historia</button>
          </div>
          <div className="card-pad">
            {tab === 'pytania' && <TabPytania c={c} departments={departments} call={call} assigned={assigned} />}
            {tab === 'odpowiedzi' && <TabOdpowiedzi c={c} departments={departments} call={call} assigned={assigned} />}
            {tab === 'projekt' && <TabProjekt c={c} call={call} llm={llm} toNext={() => setTab('anon')} />}
            {tab === 'anon' && <TabAnon c={c} call={call} llm={llm} />}
            {tab === 'historia' && (
              <div className="hist">
                {c.history.map((h) => <div key={h.id}><span className="faint mono">{h.at}</span> · <b>{h.action}</b>{h.details ? <span className="muted"> – {h.details}</span> : null}</div>)}
              </div>
            )}
          </div>
        </div>
        <div className="stack">
          <HintsList hints={w.hints} />
          <div className="card">
            <div className="card-head"><h3>Podobne sprawy z archiwum</h3><span className="faint small">{c.similar.length}</span></div>
            <div className="card-pad" style={{ paddingTop: 4 }}><SimilarList items={c.similar} /></div>
          </div>
        </div>
      </div>

      {(modal === 'doprec' || modal === 'doprec-in') && (
        <DateModal
          title={modal === 'doprec' ? 'Wezwanie do doprecyzowania wniosku' : 'Wpłynęło doprecyzowanie wniosku'}
          text={modal === 'doprec'
            ? 'Termin na udostępnienie informacji zostanie wstrzymany do czasu doprecyzowania. Treść wezwania wygenerujesz w zakładce 3 („Wezwanie do doprecyzowania wniosku”).'
            : 'Termin 14 dni zostanie policzony od nowa od daty otrzymania doprecyzowania (z przesunięciem z sobót i świąt).'}
          label={modal === 'doprec' ? 'Data wezwania' : 'Data wpływu doprecyzowania'}
          onClose={() => setModal(null)}
          onSave={async (date) => {
            const url = modal === 'doprec' ? `/api/wnioski/${id}/doprecyzowanie` : `/api/wnioski/${id}/doprecyzowanie/wplynelo`;
            const r = await call(() => api.post(url, { date }), modal === 'doprec' ? 'Status: doprecyzowanie wniosku – termin wstrzymany' : 'Termin przeliczony od daty doprecyzowania');
            if (r) setModal(null);
          }}
        />
      )}
      {modal === 'kwerenda' && <KwerendaModal w={w} onClose={() => setModal(null)} onSave={async (b) => { const r = await call(() => api.post(`/api/wnioski/${id}/kwerenda`, b), 'Termin przedłużony – przygotuj zawiadomienie dla wnioskodawcy (zakładka 3).'); if (r) setModal(null); }} />}
      {modal === 'sent' && <SentModal pending={pending} hasDraft={!!c.draft} onClose={() => setModal(null)} onSave={async (date) => { const r = await call(() => api.post(`/api/wnioski/${id}/sent`, { date }), 'Oznaczono jako wysłaną. Odpowiedź trafiła do archiwum wiedzy.'); if (r) setModal(null); }} />}
    </div>
  );
}

// ---------------- TAB 1 ----------------
function TabPytania({ c, departments, call, assigned }) {
  const [reqText, setReqText] = useState(null);
  const id = c.wniosek.id;
  const save = (qid, deps) => call(() => api.put(`/api/wnioski/${id}/questions`, { questions: c.questions.map((q) => ({ id: q.id, departments: q.id === qid ? deps : q.departments })) }));
  const showReq = async (code) => { const r = await api.get(`/api/wnioski/${id}/department-request/${code}`); setReqText({ code, text: r.text }); };

  return (
    <div className="stack">
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Treść wniosku</summary>
        <div className="pre small card-pad" style={{ background: 'var(--surface-2)', borderRadius: 8, marginTop: 8 }}>{c.wniosek.text}</div>
      </details>
      <h3>Pytania i właściwe wydziały</h3>
      {c.questions.map((q) => (
        <div key={q.id} className="qrow">
          <div className="qno">{q.no}</div>
          <div className="stack" style={{ gap: 8 }}>
            <div>{q.text}</div>
            <DeptPicker value={q.departments} departments={departments} suggestions={q.suggestions} onChange={(v) => save(q.id, v)} />
          </div>
        </div>
      ))}
      <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <h3>Zapytania do wydziałów</h3>
          <button className="btn primary sm" disabled={!assigned.length} onClick={() => call(() => api.post(`/api/wnioski/${id}/departments-notified`, { codes: assigned }), 'Status: zapytania przekazane do wydziałów')}><Check /> Oznacz: zapytania przekazane</button>
        </div>
        <p className="muted small" style={{ marginBottom: 8 }}>System przygotowuje treść zapytania z listą pytań i terminem wewnętrznym. Wysyłka odbywa się poza systemem (e-mail / EZD) – UDIPilot niczego nie wysyła samodzielnie.</p>
        <div className="row">
          {assigned.map((code) => <button key={code} className="btn sm" onClick={() => showReq(code)}><Mail /> Treść zapytania do {code}</button>)}
          {!assigned.length && <span className="faint small">Przypisz wydziały do pytań.</span>}
        </div>
      </div>
      {reqText && (
        <Modal title={`Zapytanie do ${reqText.code}`} onClose={() => setReqText(null)} footer={<button className="btn primary" onClick={() => { navigator.clipboard.writeText(reqText.text); setReqText(null); }}><ClipboardCopy /> Kopiuj do schowka</button>}>
          <textarea rows={14} defaultValue={reqText.text} className="mono" />
        </Modal>
      )}
    </div>
  );
}

// ---------------- TAB 2 ----------------
function TabOdpowiedzi({ c, departments, call, assigned }) {
  const id = c.wniosek.id;
  const [dept, setDept] = useState(assigned.find((d) => !c.responses.some((r) => r.department === d)) || assigned[0] || '');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(null);

  const send = async (file) => {
    if (!dept) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('department', dept);
    if (file) fd.append('file', file); else fd.append('text', text);
    const r = await call(() => api.post(`/api/wnioski/${id}/responses`, fd), `Dodano odpowiedź ${dept}`);
    if (r) setText('');
    setBusy(false);
  };

  return (
    <div className="stack">
      <h3>Pokrycie pytań odpowiedziami</h3>
      <table className="t">
        <thead><tr><th>Pyt.</th><th>Treść</th><th>Wydziały</th><th>Odpowiedź</th></tr></thead>
        <tbody>
          {c.questions.map((q) => {
            const got = q.departments.filter((d) => c.responses.some((r) => r.department === d));
            return (
              <tr key={q.id}>
                <td><b>{q.no}</b></td>
                <td className="small">{q.text}</td>
                <td>{q.departments.map((d) => <span key={d} className="chip" style={{ marginRight: 4 }}>{d}</span>)}</td>
                <td>{got.length === q.departments.length && got.length ? <span className="badge green"><Check /> jest</span> : <span className="badge orange">oczekuje</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="card card-pad stack" style={{ background: 'var(--surface-2)' }}>
        <h3>Wgraj odpowiedź wydziału</h3>
        <label className="field" style={{ maxWidth: 420 }}>Wydział
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">— wybierz —</option>
            {assigned.map((d) => <option key={d} value={d}>{d} – {departments.find((x) => x.code === d)?.name} (przypisany)</option>)}
            {departments.filter((d) => !assigned.includes(d.code)).map((d) => <option key={d.code} value={d.code}>{d.code} – {d.name}</option>)}
          </select>
        </label>
        <Dropzone onFile={send} busy={busy} label="Przeciągnij plik odpowiedzi wydziału" />
        <textarea rows={4} placeholder="…lub wklej treść odpowiedzi (najlepiej z oznaczeniami „Ad 1”, „Ad 2”)" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={!dept || !text.trim() || busy} onClick={() => send(null)}>Dodaj odpowiedź</button></div>
      </div>

      <h3>Odpowiedzi ({c.responses.length})</h3>
      {!c.responses.length && <div className="empty small">Brak odpowiedzi wydziałów.</div>}
      {c.responses.map((r) => (
        <div key={r.id} className="card card-pad">
          <div className="spread">
            <div className="row"><span className="chip">{r.department}</span><b>{r.filename || 'treść wklejona'}</b><span className="faint small">{r.created_at}</span></div>
            <div className="row">
              <button className="btn ghost sm" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Zwiń' : 'Podgląd'}</button>
              <button className="btn ghost sm danger" onClick={() => call(() => api.del(`/api/wnioski/${id}/responses/${r.id}`))}>Usuń</button>
            </div>
          </div>
          {open === r.id && <div className="pre small" style={{ marginTop: 8 }}>{r.text}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------------- TAB 3 ----------------
function TabProjekt({ c, call, llm, toNext }) {
  const id = c.wniosek.id;
  const [type, setType] = useState(c.draft?.type || (c.wniosek.status === 'kwerenda' && !c.draft ? 'przedluzenie' : c.wniosek.hints?.[0]?.type && c.wniosek.hints[0].type !== 'odmowa' ? c.wniosek.hints[0].type : 'udostepnienie'));
  const [reason, setReason] = useState(c.wniosek.extension_reason || '');
  const [bipLink, setBipLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState({});
  const [polish, setPolish] = useState(null);

  useEffect(() => setEdits({}), [c.draft?.generatedAt]);
  const docKey = useMemo(() => ++docSeq, [c.draft?.blocks]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = Object.keys(edits).length > 0;
  const issuesBy = useMemo(() => {
    const m = {};
    for (const i of c.verification?.issues || []) (m[i.blockId] ||= []).push(i);
    return m;
  }, [c.verification]);

  const generate = async () => {
    if (c.draft && dirty && !confirm('Niezapisane zmiany zostaną utracone. Kontynuować?')) return;
    setBusy(true);
    await call(() => api.post(`/api/wnioski/${id}/draft`, { type, reason: reason || undefined, bipLink: bipLink || undefined }), 'Projekt odpowiedzi wygenerowany');
    setBusy(false);
  };
  const save = async () => {
    const blocks = c.draft.blocks.map((b) => ({ id: b.id, text: edits[b.id] ?? b.text }));
    const r = await call(() => api.put(`/api/wnioski/${id}/draft`, { blocks }), 'Zapisano projekt – zweryfikowano źródła i anonimizację');
    if (r) setEdits({});
  };
  const doPolish = async (b) => {
    setPolish({ block: b, busy: true });
    try {
      const r = await api.post(`/api/wnioski/${id}/draft/polish`, { blockId: b.id });
      setPolish({ block: b, ...r });
    } catch (e) { setPolish(null); alert(e.message); }
  };

  return (
    <div className="stack">
      <h3>Rodzaj odpowiedzi</h3>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {TYPES.map(([k, l, b]) => (
          <label key={k} className="card card-pad" style={{ cursor: 'pointer', padding: 10, borderColor: type === k ? 'var(--primary-2)' : undefined, background: type === k ? 'var(--primary-soft)' : undefined }}>
            <div className="row" style={{ gap: 6 }}><input type="radio" checked={type === k} onChange={() => setType(k)} /><b style={{ fontSize: 13 }}>{l}</b></div>
            <div className="faint small" style={{ marginLeft: 22 }}>{b}</div>
          </label>
        ))}
      </div>
      {['przedluzenie', 'przetworzona', 'nie_ip', 'odmowa'].includes(type) && (
        <label className="field">{type === 'przedluzenie' ? 'Powód opóźnienia' : type === 'odmowa' ? 'Zakres odmowy' : 'Uzasadnienie'}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="opcjonalnie – w przeciwnym razie użyta zostanie formuła standardowa" />
        </label>
      )}
      {type === 'przedluzenie' && !c.wniosek.extension_until && <div className="alert warn small">Najpierw ustaw nowy termin przyciskiem „Kwerenda / przedłuż termin” – data trafi do zawiadomienia.</div>}
      {type === 'bip' && <label className="field">Link do BIP<input value={bipLink} onChange={(e) => setBipLink(e.target.value)} placeholder="https://bip.um.bydgoszcz.pl/…" /></label>}
      {type === 'odmowa' && <div className="alert warn small">Odmowa wymaga decyzji administracyjnej – projekt zawiera szkielet z pouczeniem; przed podpisem konieczna opinia radcy prawnego.</div>}
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={generate}>{busy ? <Spinner /> : <Sparkles />} {c.draft ? 'Generuj ponownie' : 'Generuj projekt odpowiedzi'}</button>
        <span className="faint small">Treść merytoryczna pochodzi wyłącznie z odpowiedzi wydziałów – system nie dopisuje faktów.</span>
      </div>

      {c.draft && (
        <>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
          <div className="spread">
            <h3>Projekt: {c.draft.typeLabel}</h3>
            <div className="row">
              {dirty && <span className="badge orange">niezapisane zmiany</span>}
              <button className="btn" disabled={!dirty} onClick={save}><Save /> Zapisz i zweryfikuj</button>
              <button className="btn primary" disabled={dirty} onClick={toNext}>Dalej: anonimizacja <ArrowRight /></button>
            </div>
          </div>
          <Verification v={c.verification} />
          <LetterEditor key={docKey} draft={c.draft} verification={c.verification} issuesBy={issuesBy} edits={edits} setEdits={setEdits} onSave={save} onPolish={doPolish} llm={llm} dirty={dirty} />
        </>
      )}
      {polish && (
        <Modal title="Redakcja stylistyczna (AI)" onClose={() => setPolish(null)} footer={!polish.busy && (
          <>
            <button className="btn" onClick={() => setPolish(null)}>Odrzuć</button>
            <button className="btn primary" onClick={() => { setEdits((e) => ({ ...e, [polish.block.id]: polish.polished })); setPolish(null); }}>Przyjmij (do zapisania)</button>
          </>
        )}>
          {polish.busy ? <div className="row"><Spinner /> Model redaguje akapit…</div> : (
            <div className="stack">
              <div><h4>Przed</h4><div className="pre small">{polish.original}</div></div>
              <div><h4>Po</h4><div className="pre small">{polish.polished}</div></div>
              {polish.issues?.length ? <div className="alert err small">Weryfikacja wykryła ryzyko: {polish.issues.map((i) => i.reason).join('; ')}</div> : <div className="alert ok small">Weryfikacja: brak nowych faktów i liczb względem źródeł.</div>}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Verification({ v }) {
  if (!v) return null;
  if (v.ok) return <div className="alert ok small"><CircleCheck /> Weryfikacja: każde zdanie merytoryczne ma oparcie w odpowiedziach wydziałów, wszystkie liczby zgodne ze źródłami, odpowiedziano na wszystkie pytania.</div>;
  return (
    <div className="alert warn small">
      <b>Wymaga uwagi:</b>
      {v.missing?.length > 0 && <div>• Brak odpowiedzi na pytania: {v.missing.join(', ')} – uzupełnij lub wyślij ponowne zapytanie do wydziału.</div>}
      {v.issues?.length > 0 && <div>• {v.issues.length} zdanie(a) bez potwierdzenia w źródłach lub z liczbami spoza odpowiedzi wydziałów (zaznaczone na czerwono).</div>}
    </div>
  );
}

// ---------------- TAB 4 ----------------
function TabAnon({ c, call, llm }) {
  const id = c.wniosek.id;
  const toast = useToast();
  const [busyAi, setBusyAi] = useState(false);
  if (!c.draft) return <div className="empty">Najpierw wygeneruj projekt odpowiedzi (zakładka 3).</div>;
  const text = c.draft.blocks.map((b) => b.text).join('\n\n');
  const ents = c.entities;
  const pending = ents.filter((e) => e.status === 'suggested').length;
  const accepted = ents.filter((e) => e.status === 'accepted').length;
  const saveEnts = (list) => call(() => api.put(`/api/wnioski/${id}/entities`, { entities: list }));
  const exp = (fmt) => download(`/api/wnioski/${id}/export.${fmt}`, null, `odpowiedz.${fmt}`).then(() => toast(`Pobrano plik ${fmt.toUpperCase()}`)).catch((e) => toast(e.message, 'err'));

  return (
    <div className="stack">
      <div className="alert info small">
        Szare pola to <b>propozycje</b> anonimizacji. Kliknij, aby zaczernić lub pozostawić jawne. Zaznacz dowolny fragment myszką, aby ukryć go ręcznie.
        Dane adresata pisma (<span style={{ borderBottom: '2px solid var(--primary-2)' }}>podkreślone</span>) pozostają – pismo trafia do wnioskodawcy.
        W eksporcie dane są <b>fizycznie usuwane</b> z pliku, a nie przykrywane.
      </div>
      <div className="row">
        <button className="btn dark" disabled={!pending} onClick={() => saveEnts(ents.map((e) => (e.status === 'suggested' ? { ...e, status: 'accepted' } : e)))}><EyeOff /> Zaczernij wszystkie propozycje ({pending})</button>
        {llm?.enabled && <button className="btn" disabled={busyAi} onClick={async () => { setBusyAi(true); const r = await call(() => api.post(`/api/wnioski/${id}/entities/ai`)); if (r) toast(`AI: ${r.added} nowych propozycji`); setBusyAi(false); }}>{busyAi ? <Spinner /> : <Wand2 />} Druga warstwa: AI</button>}
        <span className="grow" />
        <span className="muted small">{accepted} zaczernionych · {pending} do decyzji</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 14 }}>
        <div className="card"><AnonymizeView text={text} entities={ents} onChange={saveEnts} /></div>
        <div className="card">
          <div className="card-head"><h3>Wykryte dane</h3></div>
          <AnonList entities={ents} onChange={saveEnts} />
        </div>
      </div>
      <div className="card card-pad spread" style={{ background: 'var(--surface-2)' }}>
        <div>
          <h3>Eksport projektu pisma</h3>
          <div className="muted small">Plik do sprawdzenia merytorycznego i podpisu. System niczego nie wysyła.</div>
          {pending > 0 && <div className="small" style={{ color: 'var(--orange)', marginTop: 4 }}><TriangleAlert /> {pending} propozycji anonimizacji czeka na decyzję – w eksporcie pozostaną jawne.</div>}
        </div>
        <div className="row">
          <button className="btn" onClick={() => exp('txt')}><Download /> TXT</button>
          <button className="btn primary" onClick={() => exp('docx')}><Download /> Pobierz DOCX</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- modals ----------------
function KwerendaModal({ w, onClose, onSave }) {
  const max = (() => {
    const d = new Date(w.received_at + 'T00:00:00Z');
    const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, Math.min(d.getUTCDate(), 28)));
    return r.toISOString().slice(0, 10);
  })();
  const [until, setUntil] = useState(w.extension_until || max);
  const [reason, setReason] = useState(w.extension_reason || 'konieczność przeprowadzenia kwerendy w dokumentacji archiwalnej');
  return (
    <Modal title="Kwerenda – przedłużenie terminu" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Anuluj</button><button className="btn primary" onClick={() => onSave({ until, reason })}>Zapisz nowy termin</button></>}>
      <div className="stack">
        <div className="alert info small">Art. 13 ust. 2 u.d.i.p.: przed upływem 14 dni należy zawiadomić wnioskodawcę o powodach opóźnienia i nowym terminie – <b>nie dłuższym niż 2 miesiące od dnia złożenia wniosku</b> ({plDate(w.received_at)}).</div>
        <label className="field">Nowy termin<input type="date" value={until} max={max} onChange={(e) => setUntil(e.target.value)} /></label>
        <label className="field">Powód opóźnienia<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="faint small">Po zapisaniu wygeneruj w zakładce 3 „Zawiadomienie o przedłużeniu”.</div>
      </div>
    </Modal>
  );
}

function DateModal({ title, text, label, onClose, onSave }) {
  const d = new Date();
  const [date, setDate] = useState(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10));
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Anuluj</button><button className="btn primary" onClick={() => onSave(date)}>Zapisz</button></>}>
      <div className="stack">
        <div className="alert info small">{text}</div>
        <label className="field" style={{ maxWidth: 220 }}>{label}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function SentModal({ onClose, onSave, pending, hasDraft }) {
  const d = new Date();
  const [date, setDate] = useState(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10));
  return (
    <Modal title="Oznacz odpowiedź jako wysłaną" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Anuluj</button><button className="btn primary" onClick={() => onSave(date)}>Potwierdzam wysyłkę</button></>}>
      <div className="stack">
        <p>Wysyłka odbywa się poza systemem (EZD / e-mail / poczta). Tutaj tylko odnotowujesz datę udzielenia odpowiedzi.</p>
        <label className="field" style={{ maxWidth: 220 }}>Data udzielenia odpowiedzi<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {hasDraft && <div className="alert ok small">Zatwierdzona odpowiedź (po anonimizacji) zostanie dodana do archiwum wiedzy – system będzie ją podpowiadał przy podobnych wnioskach.</div>}
        {pending > 0 && <div className="alert warn small">{pending} propozycji anonimizacji nie zostało rozpatrzonych.</div>}
      </div>
    </Modal>
  );
}
