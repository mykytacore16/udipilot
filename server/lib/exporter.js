// Eksport projektu pisma do DOCX/TXT. Zaczernione dane są FIZYCZNIE usuwane z pliku
// (zastąpione znakami █), a nie tylko przykryte – brak ryzyka „odkrycia” danych.
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';

const BLOCK = '█';

// Dla każdego bloku zwraca listę fragmentów {text, redacted}.
export function blockSegments(draft, entities) {
  const accepted = (entities || []).filter((e) => e.status === 'accepted');
  let offset = 0;
  return draft.blocks.map((b) => {
    const start = offset;
    const end = start + b.text.length;
    offset = end + 2; // '\n\n' między blokami
    const ents = accepted.filter((e) => e.start >= start && e.end <= end).sort((a, c) => a.start - c.start);
    const segs = [];
    let cur = start;
    for (const e of ents) {
      if (e.start < cur) continue;
      if (e.start > cur) segs.push({ text: b.text.slice(cur - start, e.start - start), redacted: false });
      segs.push({ text: BLOCK.repeat(Math.max(4, Math.min(14, e.end - e.start))), redacted: true });
      cur = e.end;
    }
    if (cur < end) segs.push({ text: b.text.slice(cur - start), redacted: false });
    return { block: b, segs };
  });
}

export function toText(draft, entities) {
  const parts = blockSegments(draft, entities).map(({ segs }) => segs.map((s) => s.text).join(''));
  if ((entities || []).some((e) => e.status === 'accepted')) parts.push(NOTE);
  return parts.join('\n\n');
}

const NOTE = 'Pouczenie: w treści pisma wyłączono dane osobowe/chronione (oznaczone znakiem █) na podstawie art. 5 ust. 2 ustawy o dostępie do informacji publicznej.';

export async function toDocx(draft, entities) {
  const children = [];
  for (const { block, segs } of blockSegments(draft, entities)) {
    const align =
      block.kind === 'header' && /^Bydgoszcz/.test(block.text) ? AlignmentType.RIGHT :
      block.kind === 'title' ? AlignmentType.CENTER :
      block.kind === 'closing' || block.kind === 'signature' ? AlignmentType.RIGHT : AlignmentType.JUSTIFIED;
    const lines = [];
    // podział na linie (adres wielowierszowy)
    let line = [];
    for (const s of segs) {
      const pieces = s.text.split('\n');
      pieces.forEach((p, i) => {
        if (i > 0) { lines.push(line); line = []; }
        if (p) line.push(new TextRun({ text: p, bold: block.kind === 'title', highlight: block.kind === 'missing' ? 'yellow' : undefined, font: 'Calibri', size: 22 }));
      });
    }
    lines.push(line);
    for (const runs of lines) {
      children.push(new Paragraph({ alignment: align, spacing: { after: block.kind === 'address' ? 0 : 160, line: 300 }, children: runs }));
    }
    if (block.kind === 'address') children.push(new Paragraph({ children: [] }));
  }
  if ((entities || []).some((e) => e.status === 'accepted')) {
    children.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: NOTE, italics: true, size: 18, font: 'Calibri' })] }));
  }
  const doc = new Document({
    creator: 'UDIPilot',
    title: 'Projekt odpowiedzi na wniosek o udostępnienie informacji publicznej',
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}
