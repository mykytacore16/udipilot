import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { STATUS, URGENCY_CLS } from '../api.js';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = (msg, kind = 'ok') => {
    setT({ msg, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), kind === 'err' ? 6000 : 3000);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={`toast ${t.kind === 'err' ? 'err' : ''}`} onClick={() => setT(null)}>{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

export const Spinner = () => <span className="spinner" />;

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="card-head"><h2>{title}</h2><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="card-pad">{children}</div>
        {footer && <div className="card-pad row" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: '' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function UrgencyBadge({ urgency }) {
  if (!urgency) return null;
  return <span className={`badge ${URGENCY_CLS[urgency.level] || ''}`}>{urgency.label}</span>;
}

export function Dropzone({ onFile, accept = '.pdf,.docx,.txt', label = 'Przeciągnij plik lub kliknij, aby wybrać', hint = 'PDF, DOCX lub TXT · plik jest przetwarzany lokalnie', busy }) {
  const [over, setOver] = useState(false);
  const input = useRef();
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onClick={() => input.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }}
    >
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { e.target.files[0] && onFile(e.target.files[0]); e.target.value = ''; }} />
      {busy ? <div className="row" style={{ justifyContent: 'center' }}><Spinner /> Analizuję dokument…</div> : (
        <>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
          <div className="big">{label}</div>
          <div className="muted small">{hint}</div>
        </>
      )}
    </div>
  );
}

export function DeptPicker({ value = [], onChange, departments, suggestions = [] }) {
  const [adding, setAdding] = useState(false);
  const name = (c) => departments.find((d) => d.code === c)?.name || c;
  const rest = suggestions.filter((s) => !value.includes(s.code));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        {value.map((c) => (
          <span key={c} className="chip" title={name(c)}>
            {c} <span style={{ fontWeight: 400 }}>· {name(c).replace(/^(Wydział|Biuro)\s+/, '')}</span>
            <button onClick={() => onChange(value.filter((x) => x !== c))} title="Usuń">✕</button>
          </span>
        ))}
        {adding ? (
          <select autoFocus defaultValue="" onBlur={() => setAdding(false)} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); setAdding(false); }}>
            <option value="">— wybierz wydział / biuro —</option>
            {departments.filter((d) => !value.includes(d.code)).map((d) => <option key={d.code} value={d.code}>{d.code} – {d.name}</option>)}
          </select>
        ) : (
          <button className="btn sm ghost" onClick={() => setAdding(true)}>+ wydział</button>
        )}
      </div>
      {rest.length > 0 && (
        <div className="sugg">
          Sugestie:{' '}
          {rest.map((s) => (
            <button key={s.code} title={s.reasons?.join('\n')} onClick={() => onChange([...value, s.code])}>
              {s.code} <span className="faint">{Math.round(Math.min(1, s.score / 2) * 100)}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RelBar({ value }) {
  return <span className="relbar"><i style={{ width: `${value}%` }} /></span>;
}
