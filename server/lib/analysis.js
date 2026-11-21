// Analiza wniosku: metadane, podział na pytania, typ sprawy, propozycja wydziałów.
import { readFileSync } from 'node:fs';
import { BM25, tokens, truncate, sentences } from './text.js';

const DEPTS = JSON.parse(readFileSync(new URL('../data/departments.json', import.meta.url), 'utf8'));
export const departments = DEPTS;
const deptIndex = new BM25(DEPTS.map((d) => ({ id: d.code, text: `${d.name} ${d.keywords} ${d.keywords}` })));

// ---------- Metadane ----------
const MONTHS = { stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7, sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12 };

function findDate(text) {
  let m = text.match(/(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = text.match(/(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+(20\d{2})/i);
  if (m) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  return null;
}

export function extractMeta(text) {
  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] || null;
  const head = text.slice(0, 600);
  const DATE_LIKE = /\d{1,2}[./-]\d{1,2}[./-]20\d{2}|20\d{2}-\d{2}-\d{2}|\d{1,2}\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+20\d{2}/i;
  const dateLine = head.split('\n').find((l) => DATE_LIKE.test(l) && !/ustaw|rozporządz|dz\.\s?u|kodeks/i.test(l));
  let requestDate = dateLine ? findDate(dateLine) : null;
  if (requestDate && requestDate < '2015-01-01') requestDate = null;
  let requester = text.match(/(?:Wnioskodawca|Wnioskodawczyni|Imię i nazwisko|Od)\s*:\s*([^\n,]+)/i)?.[1]?.trim() || null;
  if (!requester) {
    const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    const sig = lines.slice(-4).find((l) => /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+$/.test(l));
    requester = sig || null;
  }
  const delivery = /e-?mail|elektroniczn|skrzynk|ePUAP/i.test(text)
    ? 'elektronicznie'
    : /pocztą|listownie|na adres/i.test(text) ? 'pocztą' : 'nieokreślona';
  const subject = text.match(/(?:Dotyczy|Temat|W sprawie)\s*:\s*([^\n]+)/i)?.[1]?.trim() || null;
  return { email, requestDate, requester, delivery, subject };
}

// ---------- Pytania ----------
// Usunięcie „ramki” pisma: nagłówki, dane kontaktowe, powitanie, podpis.
const FRAME_LINE = /^(wnioskodawca|wnioskodawczyni|od|do|e-?mail|tel\.?|telefon|adres|dotyczy|temat|w sprawie|data|bydgoszcz,|dzień dobry|szanowni|szanowny|szanowna|witam|pozdrawiam|z poważaniem|z wyrazami|wniosek o udostępnienie|ul\.|al\.|\d{2}-\d{3})/i;
function stripFrame(body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const kept = lines.filter((l, i) => {
    if (FRAME_LINE.test(l)) {
      // powitanie z treścią w tej samej linii („Dzień dobry, czy mogę…”) – zostaw resztę
      return /^(dzień dobry|witam),\s*\S{3,}/i.test(l) && l.length > 25;
    }
    if (i >= lines.length - 2 && /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+$/.test(l)) return false; // podpis
    if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(l)) return false;
    return true;
  });
  return kept.join(' ').replace(/^(dzień dobry|witam),?\s*/i, '');
}

const ITEM_RE = /^\s*(?:(\d{1,2})[.)]|([a-z])\)|[-•–*])\s+(.+)$/;
const ASK_RE = /\?|^(proszę|wnoszę|czy |ile |jak[aiey]? |kto |kiedy |gdzie |w jaki|podanie|udostępnienie|przesłanie|wskazanie|informacj)/i;

export function splitQuestions(text) {
  const body = text.replace(/\r/g, '');
  const lines = body.split('\n');
  const items = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(ITEM_RE);
    if (m) {
      if (cur) items.push(cur);
      cur = m[3];
    } else if (cur && line && !/^(z poważaniem|z wyrazami|uzasadnienie|podpis|odpowiedź proszę|informację proszę|proszę o przesłanie odpowiedzi)/i.test(line) && !/^\s*$/.test(line) && line.length < 300 && !/:$/.test(line)) {
      cur += ' ' + line;
    } else if (cur) {
      items.push(cur);
      cur = null;
    }
  }
  if (cur) items.push(cur);

  let qs = items.filter((q) => q.length > 12);
  if (qs.length < 2) {
    // brak listy – szukamy zdań z pytaniami / prośbami w treści (bez nagłówka i podpisu)
    const flat = stripFrame(body);
    const sents = sentences(flat).filter((s) => ASK_RE.test(s.trim()) && s.length > 25);
    const filtered = sents.filter((s) => !/^(odpowiedź|informację) proszę (przesłać|udostępnić) (na|drogą|pocztą|e-?mail)/i.test(s) && !/w formie elektronicznej na adres/i.test(s));
    if (filtered.length) qs = filtered;
  }
  if (!qs.length) qs = [truncate(stripFrame(body), 300)];
  return qs.map((q, i) => ({ no: i + 1, text: q.replace(/\s+/g, ' ').trim() }));
}

// ---------- Typ sprawy (wskazówki prawne) ----------
export const RESPONSE_TYPES = {
  udostepnienie: { label: 'Udostępnienie informacji', basis: 'art. 10 ust. 1 i art. 13 ust. 1 u.d.i.p.', form: 'pismo' },
  przedluzenie: { label: 'Zawiadomienie o przedłużeniu terminu (kwerenda)', basis: 'art. 13 ust. 2 u.d.i.p.', form: 'pismo' },
  doprecyzowanie: { label: 'Wezwanie do doprecyzowania wniosku', basis: 'art. 2 i art. 13 u.d.i.p. (orzecznictwo NSA)', form: 'pismo' },
  przetworzona: { label: 'Wezwanie do wykazania szczególnie istotnego interesu publicznego', basis: 'art. 3 ust. 1 pkt 1 u.d.i.p.', form: 'pismo' },
  bip: { label: 'Wskazanie, że informacja jest opublikowana w BIP', basis: 'art. 10 ust. 1 u.d.i.p. (a contrario) / orzecznictwo', form: 'pismo' },
  nie_ip: { label: 'Informacja, że żądanie nie dotyczy informacji publicznej', basis: 'art. 1 ust. 1 i art. 6 u.d.i.p.', form: 'pismo' },
  odmowa: { label: 'Decyzja o odmowie udostępnienia', basis: 'art. 16 ust. 1 w zw. z art. 5 ust. 2 u.d.i.p.', form: 'decyzja administracyjna' },
};

const HINTS = [
  { type: 'przetworzona', re: /zestawieni|analiz|w podziale na|za lata|za okres (?:ostatnich|od)|wszystkich (?:umów|faktur|decyzji|dokumentów)|kopi[ei] wszystkich|ze wskazaniem każdej|przygotowanie raportu/i,
    why: 'Wniosek może wymagać przetworzenia (zestawienia, analizy z wielu dokumentów). Rozważ wezwanie do wykazania szczególnie istotnego interesu publicznego.' },
  { type: 'doprecyzowanie', re: /zgodnie z załączonymi wnioskami|wskazanych ulic|wskazan[ey]ch (?:w załączniku|powyżej)|dot\.\s*(?:sprawy|tematu)\s*$|^\s*[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}\s]{0,30}\.?\s*$/u,
    why: 'Przedmiot wniosku może być nieprecyzyjny lub odsyła do załączników, których brak – rozważ wezwanie do doprecyzowania (termin biegnie od doprecyzowania).' },
  { type: 'nie_ip', re: /porad|interpretacj|opini[ię] urzędu|czy mogę|czy muszę|jak mam postąpić|wyjaśnienie przepisów|prywatn[a-z]+ sprawy/i,
    why: 'Pytanie może dotyczyć porady lub interpretacji prawa – takie żądania zwykle nie są informacją publiczną.' },
  { type: 'bip', re: /budżet(?:u)? miasta|uchwał[ay]? (?:rady|budżetow)|zarządzeni[ea] prezydenta|oświadczeni[ea] majątkow|rejestr umów|protokoł[ yów]+ z sesji|plan zamówień/i,
    why: 'Taka informacja jest często publikowana w BIP – sprawdź i ewentualnie wskaż link zamiast udostępniać ponownie.' },
  { type: 'odmowa', re: /dan(?:e|ych) osobow|pesel|adres zamieszkania|wynagrodzeni[ea] (?:pana|pani|konkretnego)|tajemnic|dokumentacj[aię] medyczn|stan zdrowia/i,
    why: 'Żądanie może dotyczyć danych chronionych (prywatność, tajemnica). Ewentualna odmowa wymaga decyzji administracyjnej.' },
];

export function classify(text) {
  const hints = [];
  for (const h of HINTS) {
    const m = text.match(h.re);
    if (m) hints.push({ type: h.type, label: RESPONSE_TYPES[h.type].label, basis: RESPONSE_TYPES[h.type].basis, why: h.why, trigger: m[0] });
  }
  return { suggested: 'udostepnienie', hints };
}

// ---------- Propozycja wydziałów ----------
// Łączymy: (1) słowa kluczowe kompetencji wydziałów, (2) „głos” podobnych spraw z archiwum.
export function routeQuestion(question, archiveIndex) {
  const scores = new Map();
  const reasons = new Map();
  const bump = (code, s, why) => {
    scores.set(code, (scores.get(code) || 0) + s);
    if (!reasons.has(code)) reasons.set(code, []);
    if (why) reasons.get(code).push(why);
  };
  for (const r of deptIndex.search(question, { limit: 4 })) {
    bump(r.doc.id, r.relevance / 100, `zakres kompetencji: ${r.matched.slice(0, 4).join(', ')}…`);
  }
  if (archiveIndex) {
    for (const r of archiveIndex.search(question, { limit: 5 })) {
      for (const code of r.doc.departments || []) bump(code, (r.relevance / 100) * 0.6, `podobna sprawa ${r.doc.number}`);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, score]) => {
      const d = DEPTS.find((x) => x.code === code);
      return { code, name: d?.name || code, score: Math.round(score * 100) / 100, reasons: [...new Set(reasons.get(code))].slice(0, 3) };
    });
}

// Routing całej listy pytań z kontekstem: pytanie „Jaka jest wartość TYCH umów?” dziedziczy wydział poprzedniego.
const ANAPHORA = /\b(tych|tego|tej|te|ten|tym|tymi|powyższ\w*|wskazan\w*|tej inwestycji|prac)\b/i;
export function routeQuestions(questions, archiveIndex) {
  const out = [];
  for (const q of questions) {
    let sug = routeQuestion(q.text, archiveIndex);
    const prev = out[out.length - 1]?.suggestions?.[0];
    const weak = !sug.length || sug[0].score < 1.1;
    if (prev && (ANAPHORA.test(q.text) || weak)) {
      const existing = sug.find((s) => s.code === prev.code);
      // silny własny temat pytania („Ile kamer obejmuje TEN park?”) wygrywa z kontekstem
      const ownStrong = (sug[0]?.score || 0) >= 1.4;
      const bonus = ANAPHORA.test(q.text) ? (ownStrong ? 0.3 : 1.5) : 0.5;
      const ctx = { ...prev, score: Math.round(((existing?.score || 0) + bonus) * 100) / 100, reasons: [`kontekst pytania ${out.length} (odwołanie do poprzedniego pytania)`, ...(existing?.reasons || [])] };
      sug = [ctx, ...sug.filter((s) => s.code !== prev.code)].sort((a, b) => b.score - a.score).slice(0, 3);
    }
    out.push({ ...q, suggestions: sug, departments: sug.slice(0, 1).map((s) => s.code) });
  }
  return out;
}

export function summarize(text, questions) {
  const subj = extractMeta(text).subject;
  if (subj) return truncate(subj, 120);
  const first = questions[0]?.text || text;
  return truncate(first.replace(/^(proszę o|wnoszę o)\s+(udostępnienie|podanie|przesłanie)\s+(informacji(\s+publicznej)?\s+)?/i, '').replace(/^(dotycząc\w*|dot\.|w sprawie)\s+/i, '').replace(/^./, (c) => c.toUpperCase()), 120);
}

export { tokens };
