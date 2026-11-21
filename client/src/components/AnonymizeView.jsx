import { useMemo, useRef, useState } from 'react';

// Widok anonimizacji: propozycje na szaro → po akceptacji na czarno. Zaznaczenie tekstu = ręczne ukrycie.
export default function AnonymizeView({ text, entities, onChange, readOnly }) {
  const [open, setOpen] = useState(null); // {id, x, y}
  const [sel, setSel] = useState(null); // {start, end, x, y}
  const [reveal, setReveal] = useState(false);
  const box = useRef();

  const segments = useMemo(() => {
    const ents = [...entities].sort((a, b) => a.start - b.start);
    const out = [];
    let cur = 0;
    for (const e of ents) {
      if (e.start < cur) continue;
      if (e.start > cur) out.push({ start: cur, end: e.start });
      out.push({ start: e.start, end: e.end, e });
      cur = e.end;
    }
    if (cur < text.length) out.push({ start: cur, end: text.length });
    return out;
  }, [text, entities]);

  const setStatus = (id, status) => onChange(entities.map((e) => (e.id === id ? { ...e, status } : e)));

  const posFrom = (el) => {
    const r = el.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    return { x: Math.min(r.left - b.left, b.width - 310), y: r.bottom - b.top + 6 };
  };

  const offsetOf = (node, off) => {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== box.current && el.dataset?.off === undefined) el = el.parentElement;
    if (!el || el.dataset?.off === undefined) return null;
    return +el.dataset.off + (node.nodeType === 3 ? off : 0);
  };

  const onMouseUp = () => {
    if (readOnly) return;
    const s = window.getSelection();
    if (!s || s.isCollapsed || !box.current.contains(s.anchorNode)) { setSel(null); return; }
    let a = offsetOf(s.anchorNode, s.anchorOffset);
    let b = offsetOf(s.focusNode, s.focusOffset);
    if (a == null || b == null) return;
    if (a > b) [a, b] = [b, a];
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b - a < 2) return;
    const r = s.getRangeAt(0).getBoundingClientRect();
    const bb = box.current.getBoundingClientRect();
    setOpen(null);
    setSel({ start: a, end: b, x: Math.min(r.left - bb.left, bb.width - 200), y: r.bottom - bb.top + 6 });
  };

  const addManual = () => {
    const overlapping = entities.filter((e) => e.start < sel.end && e.end > sel.start);
    const start = Math.min(sel.start, ...overlapping.map((e) => e.start));
    const end = Math.max(sel.end, ...overlapping.map((e) => e.end));
    const rest = entities.filter((e) => !overlapping.includes(e));
    const ne = { id: `m${Date.now()}`, start, end, text: text.slice(start, end), type: 'RĘCZNE', label: 'Zaznaczone ręcznie', basis: 'art. 5 ust. 2 u.d.i.p.', confidence: 1, status: 'accepted', manual: true };
    onChange([...rest, ne].sort((x, y) => x.start - y.start));
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };

  const cur = open && entities.find((e) => e.id === open.id);

  return (
    <div ref={box} style={{ position: 'relative' }} onMouseUp={onMouseUp}>
      <div className="row" style={{ padding: '10px 22px 0', justifyContent: 'flex-end' }}>
        <label className="row small muted" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> pokaż treść pod zaczernieniem
        </label>
      </div>
      <div className="anon-text">
        {segments.map((s) =>
          s.e ? (
            <span
              key={s.start}
              data-off={s.start}
              className={`ent ${s.e.status} ${reveal ? 'preview-off' : ''}`}
              title={`${s.e.label}${s.e.alias ? ` (${s.e.alias})` : ''}`}
              onMouseUp={(ev) => ev.stopPropagation()}
              onClick={(ev) => { ev.stopPropagation(); setSel(null); setOpen({ id: s.e.id, ...posFrom(ev.currentTarget) }); }}
            >
              {text.slice(s.start, s.end)}
            </span>
          ) : (
            <span key={s.start} data-off={s.start}>{text.slice(s.start, s.end)}</span>
          ),
        )}
      </div>

      {sel && (
        <div className="sel-btn" style={{ left: sel.x, top: sel.y }}>
          <button className="btn dark sm" onMouseDown={(e) => e.preventDefault()} onClick={addManual}>■ Ukryj zaznaczony fragment</button>
        </div>
      )}

      {cur && (
        <div className="popover" style={{ left: open.x, top: open.y }} onMouseUp={(e) => e.stopPropagation()}>
          <div className="spread" style={{ marginBottom: 6 }}>
            <b>{cur.label}</b>
            <button className="btn ghost sm" onClick={() => setOpen(null)}>✕</button>
          </div>
          <div className="mono" style={{ background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 6, marginBottom: 8 }}>{cur.text}</div>
          <div className="small muted">Podstawa: {cur.basis}</div>
          <div className="small muted">Pewność wykrycia: {Math.round((cur.confidence || 0) * 100)}%{cur.alias ? ` · ${cur.alias}` : ''}{cur.source === 'ai' ? ' · wykryte przez AI' : ''}</div>
          {cur.note && <div className="alert warn small" style={{ marginTop: 8 }}>{cur.note}</div>}
          {!readOnly && (
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn dark sm" onClick={() => { setStatus(cur.id, 'accepted'); setOpen(null); }}>■ Zaczernij</button>
              <button className="btn sm" onClick={() => { setStatus(cur.id, 'rejected'); setOpen(null); }}>Pozostaw jawne</button>
              {cur.manual && <button className="btn sm danger" onClick={() => { onChange(entities.filter((e) => e.id !== cur.id)); setOpen(null); }}>Usuń</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AnonList({ entities, onChange, onFocus }) {
  const order = { suggested: 0, accepted: 1, rejected: 2, kept: 3 };
  const list = [...entities].sort((a, b) => order[a.status] - order[b.status] || a.start - b.start);
  const lbl = { suggested: ['Propozycja', ''], accepted: ['Zaczernione', 'green'], rejected: ['Jawne', ''], kept: ['Adresat', 'blue'] };
  return (
    <div className="anon-list">
      {list.length === 0 && <div className="empty small">Nie wykryto danych do anonimizacji.</div>}
      {list.map((e) => (
        <div key={e.id} className="anon-item" onClick={() => onFocus?.(e)}>
          <div>
            <div className="row" style={{ gap: 6 }}>
              <span className={`badge ${lbl[e.status]?.[1]}`}>{lbl[e.status]?.[0]}</span>
              <b style={{ fontSize: 12.5 }}>{e.label}</b>
              <span className="faint small">{Math.round((e.confidence || 0) * 100)}%</span>
            </div>
            <div className="mono" style={{ marginTop: 3, wordBreak: 'break-word' }}>{e.text}</div>
          </div>
          {e.status !== 'kept' && (
            <div className="row" style={{ gap: 4, alignItems: 'flex-start' }}>
              {e.status !== 'accepted' && <button className="btn dark sm" title="Zaczernij" onClick={(ev) => { ev.stopPropagation(); onChange(entities.map((x) => (x.id === e.id ? { ...x, status: 'accepted' } : x))); }}>■</button>}
              {e.status !== 'rejected' && <button className="btn sm" title="Pozostaw jawne" onClick={(ev) => { ev.stopPropagation(); onChange(entities.map((x) => (x.id === e.id ? { ...x, status: 'rejected' } : x))); }}>✓</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
