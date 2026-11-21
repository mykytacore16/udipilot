// Rejestr wniosków w formacie arkusza UMB („WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ”):
// Lp. | Numer sprawy | Wnioskodawca | Przedmiot zapytania | Data wpływu | Termin odpowiedzi | Data odpowiedzi | Osoba odpowiedzialna | Pozostało dni
import { readSheet, excelToIso, writeSheet } from './xlsx.js';
import { computeDeadline, diffDays, today, urgency } from './deadlines.js';

export const SHEET_TITLE = 'WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ';
export const SHEET_HEADER = ['Lp.', 'Numer sprawy', 'Wnioskodawca', 'Przedmiot zapytania', 'Data wpływu', 'Termin odpowiedzi', 'Data odpowiedzi', 'Osoba odpowiedzialna', 'Pozostało dni'];

// Numer sprawy UMB: BKS.IV.1431.<kolejny>.<rok>
export const NUMBER_RE = /(\d+)\.(\d{4})\s*$/;
export const numberSeq = (n) => +(String(n).match(NUMBER_RE)?.[1] || parseInt(n, 10) || 0);
export const makeNumber = (seq, year) => `BKS.IV.1431.${seq}.${year}`;

const toIso = (v) => {
  if (typeof v === 'number' && v > 30000) return excelToIso(v);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};
const allDates = (s) => [...String(s).matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)].map((m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);

// Parsowanie arkusza → rekordy + uwagi walidacyjne (niezgodności terminów, dat itp.)
export function parseRegistry(buf) {
  const rows = readSheet(buf);
  const hi = rows.findIndex((r) => r.some((v) => /numer sprawy/i.test(String(v))));
  if (hi < 0) throw new Error('Nie znaleziono nagłówka „Numer sprawy” – to nie jest arkusz rejestru wniosków.');
  const head = rows[hi].map((v) => String(v ?? '').trim().toLowerCase());
  const idx = (re) => head.findIndex((h) => re.test(h));
  const c = {
    number: idx(/numer sprawy/), requester: idx(/wnioskodawca/), subject: idx(/przedmiot/), received: idx(/data wp/),
    deadline: idx(/termin/), answered: idx(/data odpow/), responsible: idx(/osoba/),
  };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const number = String(r[c.number] ?? '').trim();
    if (!number) continue;
    const received = toIso(r[c.received]);
    const rawDeadline = r[c.deadline];
    const answered = toIso(r[c.answered]);
    const notes = [];
    let sheetDeadline = toIso(rawDeadline);
    let clarification = null;
    if (typeof rawDeadline === 'string' && /doprecyz/i.test(rawDeadline)) {
      const ds = allDates(rawDeadline);
      clarification = { originalDeadline: ds[0] || null, newDeadline: ds[1] || ds[0] || null };
      sheetDeadline = clarification.newDeadline;
      notes.push(`Wezwanie do doprecyzowania wniosku – termin biegnie od doprecyzowania (w arkuszu: „${rawDeadline.trim()}”).`);
    }
    if (!received) notes.push('Brak poprawnej daty wpływu.');
    const statutory = received ? computeDeadline(received).deadline : null;
    if (received && sheetDeadline && !clarification && sheetDeadline !== statutory) {
      notes.push(`Termin w arkuszu (${sheetDeadline}) różni się od ustawowego (${statutory}) – sprawdź (art. 13 ust. 1 u.d.i.p., art. 57 § 4 KPA).`);
    }
    if (received && answered && answered < received) notes.push(`Data odpowiedzi (${answered}) jest wcześniejsza niż data wpływu (${received}) – prawdopodobny błąd w danych.`);
    const effDeadline = clarification?.newDeadline || statutory;
    if (answered && effDeadline && answered > effDeadline) notes.push(`Odpowiedź udzielona po terminie (${diffDays(effDeadline, answered)} dni po ${effDeadline}).`);
    const yearFromNumber = +(number.match(NUMBER_RE)?.[2] || 0);
    if (received && yearFromNumber && yearFromNumber !== +received.slice(0, 4)) notes.push(`Rok w numerze sprawy (${yearFromNumber}) nie zgadza się z datą wpływu (${received}).`);
    out.push({
      number,
      requester: String(r[c.requester] ?? '').trim() || null,
      subject: String(r[c.subject] ?? '').trim(),
      received,
      deadline: effDeadline,
      sheetDeadline,
      answered,
      responsible: String(r[c.responsible] ?? '').trim() || null,
      clarification,
      notes,
    });
  }
  return out;
}

export function registryXlsx(items) {
  const rows = items.map((w, i) => [
    i + 1, w.number, w.requester || '', w.summary || '', w.received_at,
    w.clarification_received_at ? `${w.sheet_deadline || ''}/${w.deadline} - doprecyzowanie wniosku` : w.deadline,
    w.answered_at || '', w.initials || '',
    w.status === 'wyslana' ? 0 : diffDays(today(), w.deadline),
  ]);
  return writeSheet({ title: SHEET_TITLE, header: SHEET_HEADER, rows, dateCols: [4, 5, 6], widths: [5, 24, 30, 60, 12, 14, 14, 20, 10] });
}

export { urgency };
