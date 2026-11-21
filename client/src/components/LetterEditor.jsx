// Edytor pisma: jeden ciągły dokument (jak w Wordzie), podzielony na sekcje.
// Sekcje „Ad N” są oznaczone na marginesie; źródła i uwagi weryfikacji pokazuje panel boczny
// dla sekcji, w której stoi kursor. Struktura pisma jest chroniona – nie da się
// przypadkiem skasować granicy między sekcjami ani wkleić formatowania.
import { CircleCheck, ClipboardCopy, ListTree, Paperclip, Redo2, TriangleAlert, Undo2, Wand2 } from 'lucide-react';
import { forwardRef, memo, useLayoutEffect, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

const LOCKED = ['header', 'closing', 'title'];
const label = (b) => (b.kind === 'answer' || b.kind === 'missing' ? `Ad ${b.questionNo}` : { address: 'Adresat', intro: 'Wstęp', template: 'Treść', signature: 'Podpis', header: 'Nagłówek', title: 'Tytuł', closing: 'Zakończenie' }[b.kind] || '');

// Wstawia czysty tekst; nowe wiersze jako <br> (insertText ze znakiem nowej linii w Chrome dzieliłby sekcję na dwie).
function insertPlain(text) {
  const lines = text.split(/\r\n?|\n/);
  lines.forEach((l, i) => {
    if (i) document.execCommand('insertLineBreak');
    if (l) document.execCommand('insertText', false, l);
  });
}

// Dokument renderowany raz (niekontrolowany) – React nie nadpisuje tekstu podczas pisania.
const Doc = memo(forwardRef(function Doc({ blocks, issuesBy, onInput, onFocusBlock }, ref) {
  const root = useRef();
  useImperativeHandle(ref, () => root.current);

  const bodyOf = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el?.closest?.('[data-bid]') || null;
  };

  // Natywny beforeinput (React onBeforeInput obsługuje tylko wpisywanie znaków).
  useLayoutEffect(() => {
    const el = root.current;
    const h = (e) => {
      const t = e.inputType || '';
      if (t === 'historyUndo' || t === 'historyRedo') return;
      const ranges = e.getTargetRanges?.() || [];
      const sel = window.getSelection();
      const pts = ranges.length ? ranges.flatMap((r) => [r.startContainer, r.endContainer]) : [sel.anchorNode, sel.focusNode];
      const bodies = pts.map(bodyOf);
      // Edycja tylko w obrębie jednej sekcji – granic między sekcjami nie da się skasować.
      if (!bodies[0] || bodies.some((b) => b !== bodies[0])) { e.preventDefault(); return; }
      if (t === 'insertParagraph') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      else if (t === 'insertFromPaste' || t === 'insertFromDrop') {
        const txt = e.dataTransfer?.getData('text/plain');
        e.preventDefault();
        if (txt) insertPlain(txt);
      } else if (t.startsWith('format')) e.preventDefault();
    };
    el.addEventListener('beforeinput', h);
    return () => el.removeEventListener('beforeinput', h);
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { // Enter = nowy wiersz w tej samej sekcji
      e.preventDefault();
      if (bodyOf(window.getSelection().anchorNode)) document.execCommand('insertLineBreak');
    }
  };

  return (
    <div ref={root} className="doc-paper letter" contentEditable suppressContentEditableWarning spellCheck lang="pl"
      onKeyDown={onKeyDown} onInput={onInput}
      onPaste={(e) => { // awaryjnie (przeglądarki bez dataTransfer w beforeinput)
        e.preventDefault();
        if (bodyOf(window.getSelection().anchorNode)) insertPlain(e.clipboardData.getData('text/plain'));
      }}
      onDrop={(e) => e.preventDefault()}
      onFocus={onFocusBlock} onClick={onFocusBlock} onKeyUp={onFocusBlock}>
      {blocks.map((b) => {
        const locked = LOCKED.includes(b.kind);
        const cls = `seg ${b.kind}${issuesBy[b.id] ? ' issue' : ''}`;
        return (
          <div key={b.id} className={cls} data-seg={b.id}>
            {(b.kind === 'answer' || b.kind === 'missing') && (
              <span className="seg-tag" contentEditable={false} title={b.question}>
                {b.kind === 'missing' || issuesBy[b.id] ? <TriangleAlert /> : null}{label(b)}
              </span>
            )}
            <div className={`seg-body ${b.kind}`} {...(locked ? { contentEditable: false } : { 'data-bid': b.id })}>{b.text}</div>
          </div>
        );
      })}
    </div>
  );
}), (a, b) => a.blocks === b.blocks && a.issuesBy === b.issuesBy);

export default function LetterEditor({ draft, verification, issuesBy, edits, setEdits, onSave, onPolish, llm, dirty }) {
  const docRef = useRef();
  const [active, setActive] = useState(null);
  const [srcOpen, setSrcOpen] = useState(0);

  // Odczyt tekstu sekcji z dokumentu
  const read = useCallback(() => {
    const next = {};
    for (const b of draft.blocks) {
      if (LOCKED.includes(b.kind)) continue;
      const el = docRef.current?.querySelector(`[data-bid="${b.id}"]`);
      if (!el) continue;
      const v = el.innerText.replace(/\n$/, '');
      if (v !== b.text) next[b.id] = v;
    }
    setEdits(next);
  }, [draft, setEdits]);

  const onFocusBlock = useCallback(() => {
    const n = window.getSelection()?.anchorNode;
    const el = (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('[data-seg]');
    if (el) setActive(el.dataset.seg);
  }, []);

  // Podświetlenie aktywnej sekcji bez przerysowania dokumentu
  useEffect(() => {
    const root = docRef.current;
    if (!root) return;
    root.querySelectorAll('.seg.active').forEach((e) => e.classList.remove('active'));
    if (active) root.querySelector(`[data-seg="${active}"]`)?.classList.add('active');
    setSrcOpen(0);
  }, [active]);

  // Zastosowanie zmian z zewnątrz (np. przyjęta redakcja AI)
  useEffect(() => {
    for (const [id, v] of Object.entries(edits)) {
      const el = docRef.current?.querySelector(`[data-bid="${id}"]`);
      if (el && el.innerText.replace(/\n$/, '') !== v) el.innerText = v;
    }
  }, [edits]);

  // Ctrl+S = zapisz i zweryfikuj
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) onSave(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dirty, onSave]);

  const goTo = (id) => {
    const el = docRef.current?.querySelector(`[data-bid="${id}"]`) || docRef.current?.querySelector(`[data-seg="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el.dataset.bid) {
      el.focus?.();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      docRef.current.focus();
    }
    setActive(id);
  };

  const fullText = () => draft.blocks.map((b) => edits[b.id] ?? b.text).join('\n\n');
  const words = useMemo(() => fullText().split(/\s+/).filter(Boolean).length, [draft, edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c) => { docRef.current?.focus(); document.execCommand(c); read(); };

  const blk = draft.blocks.find((b) => b.id === active);
  const iss = blk && issuesBy[blk.id];
  const sections = draft.blocks.filter((b) => !['header', 'title', 'closing'].includes(b.kind));

  return (
    <div className="editor">
      <div className="editor-bar">
        <button className="btn sm ghost" title="Cofnij (Ctrl+Z)" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('undo')}><Undo2 /></button>
        <button className="btn sm ghost" title="Ponów (Ctrl+Y)" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('redo')}><Redo2 /></button>
        <span className="editor-sep" />
        <button className="btn sm ghost" onClick={() => navigator.clipboard.writeText(fullText())}><ClipboardCopy /> Kopiuj całość</button>
        <span className="faint small" style={{ marginLeft: 'auto' }}>{words} słów · Ctrl+S – zapisz i zweryfikuj</span>
      </div>
      <div className="editor-grid">
        <div className="editor-page">
          <Doc ref={docRef} blocks={draft.blocks} issuesBy={issuesBy} onInput={read} onFocusBlock={onFocusBlock} />
        </div>
        <aside className="editor-side">
          <div className="card card-pad stack" style={{ gap: 6 }}>
            <h4 className="row" style={{ gap: 6 }}><ListTree /> Struktura pisma</h4>
            {sections.map((b) => {
              const bad = b.kind === 'missing' || issuesBy[b.id];
              return (
                <button key={b.id} className={`outline-item${active === b.id ? ' on' : ''}`} onClick={() => goTo(b.id)}>
                  <span className={`dot ${b.kind === 'missing' ? 'yellow' : bad ? 'red' : b.kind === 'answer' ? 'green' : ''}`} />
                  <b>{label(b)}</b>
                  <span className="faint">{b.question || (edits[b.id] ?? b.text).slice(0, 40)}</span>
                  {edits[b.id] != null && <span className="badge orange" style={{ marginLeft: 'auto' }}>zmieniono</span>}
                </button>
              );
            })}
          </div>

          <div className="card card-pad stack" style={{ gap: 8 }}>
            {!blk ? <div className="faint small">Kliknij w dowolny fragment pisma, aby zobaczyć jego źródło i uwagi weryfikacji.</div> : (
              <>
                <h4>{label(blk)}{blk.edited || edits[blk.id] != null ? ' · edytowano' : ''}</h4>
                {blk.question && <div className="small"><span className="faint">Pytanie wnioskodawcy:</span> {blk.question}</div>}
                {blk.kind === 'missing' && <div className="alert warn small"><TriangleAlert /> Brak odpowiedzi wydziału – uzupełnij tekst albo wyślij ponowne zapytanie.</div>}
                {iss?.map((i, k) => <div key={k} className="issue-msg"><TriangleAlert /> {i.reason}: „{i.sentence.slice(0, 120)}{i.sentence.length > 120 ? '…' : ''}”</div>)}
                {blk.kind === 'answer' && !iss && verification && <div className="small" style={{ color: 'var(--green)' }}><CircleCheck style={{ width: 14, height: 14, verticalAlign: -2 }} /> Treść zgodna ze źródłem</div>}
                {blk.sources?.length > 0 && (
                  <>
                    <div className="src">
                      {blk.sources.map((s, k) => (
                        <button key={k} className={`srcchip${srcOpen === k ? ' on' : ''}`} onClick={() => setSrcOpen(k)}><Paperclip /> {s.department}{s.file ? ` · ${s.file}` : ''}</button>
                      ))}
                    </div>
                    {blk.sources[srcOpen] && (
                      <div className="src-excerpt small">
                        <div className="faint">Źródło: {blk.sources[srcOpen].how}</div>
                        <div className="pre">„{blk.sources[srcOpen].excerpt}”</div>
                      </div>
                    )}
                  </>
                )}
                {LOCKED.includes(blk.kind) && <div className="faint small">Ten element jest stały (nagłówek / formuła) i nie podlega edycji.</div>}
                {llm?.enabled && blk.kind === 'answer' && <button className="btn sm" style={{ color: 'var(--violet)' }} onClick={() => onPolish({ ...blk, text: edits[blk.id] ?? blk.text })}><Wand2 /> Popraw styl (AI)</button>}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
