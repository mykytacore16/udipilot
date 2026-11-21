// Wykrywanie danych osobowych i innych danych chronionych (art. 5 ust. 2 u.d.i.p.).
// Warstwy: wyrażenia regularne + sumy kontrolne (PESEL, NIP, REGON, IBAN) + słownik imion + kontekst.
// Wynik to PROPOZYCJE – ostateczną decyzję podejmuje urzędnik.

const FIRST_NAMES = `adam adrian agata agnieszka aleksander aleksandra alicja amelia andrzej aneta angelika anna antoni antonina arkadiusz artur barbara bartłomiej bartosz beata bogdan bogumiła bożena czesław damian daniel danuta dariusz dawid dominik dominika dorota edward elżbieta emil emilia ewa ewelina filip franciszek gabriela grażyna grzegorz halina hanna helena henryk hubert igor ilona irena iwona izabela jacek jadwiga jakub jan janina janusz jarosław jerzy joanna jolanta józef julia julian justyna kacper kamil kamila karol karolina katarzyna kazimierz kinga klaudia konrad kornelia krystian krystyna krzysztof lena leszek lidia lucyna łucja łukasz maciej magdalena maja małgorzata marcin marek maria marianna mariusz marta marzena mateusz michał mikołaj milena mirosław monika natalia nikola norbert oliwia oliwier patryk patrycja paula paulina paweł piotr przemysław rafał renata robert roman ryszard sebastian stanisław stefan sylwia szymon tadeusz teresa tomasz urszula wanda weronika wiesław wiktor wiktoria witold władysław włodzimierz wojciech zbigniew zdzisław zenon zofia zuzanna`.split(/\s+/);
const NAME_SET = new Set(FIRST_NAMES);
// Formy odmienione: Jana, Annie, Piotrowi, Katarzyną, Michałem ...
const NAME_ENDINGS = ['', 'a', 'y', 'ie', 'em', 'om', 'owi', 'ą', 'ę', 'i', 'u'];

function isFirstName(word) {
  const w = word.toLowerCase();
  if (NAME_SET.has(w)) return true;
  for (const end of NAME_ENDINGS) {
    if (end && w.endsWith(end)) {
      const base = w.slice(0, -end.length);
      if (NAME_SET.has(base) || NAME_SET.has(base + 'a') || NAME_SET.has(base.replace(/ni$/, 'na'))) return true;
    }
  }
  // Anna → Annie, Joanna → Joannie, Katarzyna → Katarzynie
  if (w.endsWith('ie') && (NAME_SET.has(w.slice(0, -2) + 'a') || NAME_SET.has(w.slice(0, -3) + 'a'))) return true;
  return false;
}

const pesel = (s) => {
  if (!/^\d{11}$/.test(s)) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = w.reduce((a, x, i) => a + x * +s[i], 0);
  return (10 - (sum % 10)) % 10 === +s[10];
};
const nip = (s) => {
  s = s.replace(/\D/g, '');
  if (s.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((a, x, i) => a + x * +s[i], 0) % 11;
  return sum !== 10 && sum === +s[9];
};
const regon9 = (s) => {
  if (!/^\d{9}$/.test(s)) return false;
  const w = [8, 9, 2, 3, 4, 5, 6, 7];
  const sum = (w.reduce((a, x, i) => a + x * +s[i], 0) % 11) % 10;
  return sum === +s[8];
};
const iban = (s) => {
  const c = s.replace(/\s/g, '').toUpperCase();
  const num = (c.startsWith('PL') ? c : 'PL' + c);
  if (!/^PL\d{26}$/.test(num)) return false;
  const re = num.slice(4) + '2521' + num.slice(2, 4); // P=25, L=21
  let mod = 0;
  for (const ch of re) mod = (mod * 10 + +ch) % 97;
  return mod === 1;
};

const BASIS_PRIV = 'art. 5 ust. 2 u.d.i.p. – prywatność osoby fizycznej';
const BASIS_TRADE = 'art. 5 ust. 2 u.d.i.p. – tajemnica przedsiębiorcy';

const DETECTORS = [
  {
    type: 'PESEL', label: 'PESEL', basis: BASIS_PRIV,
    re: /(?<!\d)\d{11}(?!\d)/g,
    check: (m, ctx) => (pesel(m) ? 0.99 : /pesel/i.test(ctx) ? 0.7 : 0),
  },
  {
    type: 'IBAN', label: 'Numer rachunku', basis: BASIS_PRIV,
    re: /\b(?:PL\s?)?\d{2}(?:\s?\d{4}){6}\b/g,
    check: (m, ctx) => (iban(m) ? 0.99 : /rachun|konto|iban/i.test(ctx) ? 0.75 : 0),
  },
  {
    type: 'NIP', label: 'NIP', basis: BASIS_TRADE,
    re: /(?<![\d-])\d{3}-?\d{3}-?\d{2}-?\d{2}(?![\d-])|(?<![\d-])\d{3}-\d{2}-\d{2}-\d{3}(?![\d-])/g,
    check: (m, ctx) => (nip(m) ? (/nip/i.test(ctx) ? 0.95 : 0.8) : /nip/i.test(ctx) ? 0.6 : 0),
  },
  {
    type: 'REGON', label: 'REGON', basis: BASIS_TRADE,
    re: /(?<!\d)\d{9}(?!\d)/g,
    check: (m, ctx) => (/regon/i.test(ctx) ? (regon9(m) ? 0.95 : 0.6) : 0),
  },
  {
    type: 'EMAIL', label: 'E-mail', basis: BASIS_PRIV,
    re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    check: (m) => (/@(um\.)?bydgoszcz\.pl$/i.test(m) ? 0.35 : 0.95),
  },
  {
    type: 'TELEFON', label: 'Telefon', basis: BASIS_PRIV,
    re: /(?<![\d-])(?:\+48[ -]?)?(?:\d{3}[ -]?\d{3}[ -]?\d{3}|\(?\d{2}\)?[ -]?\d{3}[ -]?\d{2}[ -]?\d{2})(?![\d-])/g,
    check: (m, ctx) => (/tel|telefon|kom|nr kontakt/i.test(ctx) ? 0.95 : m.replace(/\D/g, '').length === 9 ? 0.7 : 0.5),
  },
  {
    type: 'DOWOD', label: 'Nr dowodu / paszportu', basis: BASIS_PRIV,
    re: /\b[A-Z]{3}\s?\d{6}\b|\b[A-Z]{2}\d{7}\b/g,
    check: (m, ctx) => (/dow[oó]d|paszport|legitym/i.test(ctx) ? 0.95 : 0.6),
  },
  {
    type: 'ADRES', label: 'Adres', basis: BASIS_PRIV,
    re: /\b(?:ul\.|ulica|ulicy|al\.|aleja|alei|os\.|osiedle|pl\.)\s*[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}.-]*(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9][\p{L}.-]*){0,3}\s+\d+[A-Za-z]?(?:\s*\/\s*\d+[A-Za-z]?|\s+m\.\s*\d+)?(?:,?\s*\d{2}-\d{3}\s+[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+)?/gu,
    check: () => 0.9,
  },
  {
    type: 'ADRES', label: 'Kod pocztowy i miejscowość', basis: BASIS_PRIV,
    re: /\b\d{2}-\d{3}\s+[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+/gu,
    check: () => 0.6,
  },
  {
    type: 'DATA_UR', label: 'Data urodzenia', basis: BASIS_PRIV,
    re: /(?:ur\.|urodzon[aye]?(?:\s+dnia)?|data urodzenia:?)\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s*r\.)?/gi,
    check: () => 0.95,
  },
  {
    type: 'NR_REJ', label: 'Nr rejestracyjny pojazdu', basis: BASIS_PRIV,
    re: /(?<=nr(?:ze)?\.?\s*rej(?:estracyjn\w*)?\.?\s*)[A-Z]{1,3}\s?[A-Z0-9]{4,5}\b/g,
    check: () => 0.9,
  },
  {
    type: 'KSIEGA', label: 'Nr księgi wieczystej', basis: BASIS_PRIV,
    re: /\b[A-Z]{2}\d[A-Z]\/\d{8}\/\d\b/g,
    check: () => 0.9,
  },
];

const CAP = '[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?';
const PERSON_RE = new RegExp(`(?<![\\p{L}])(${CAP})\\s+(${CAP})(?![\\p{L}])`, 'gu');
const HONORIFIC_RE = new RegExp(`\\b(?:Pan|Pani|Panu|Panią|Pana|Państwo|Wnioskodawca|Wnioskodawczyni|Pełnomocnik)\\s+(${CAP}(?:\\s+${CAP})?)`, 'gu');
// Słowa, które zaczynają się wielką literą, a nie są nazwiskami (nagłówki, instytucje).
const NOT_SURNAME = new Set(['miasta', 'urząd', 'urzędu', 'wydział', 'wydziału', 'biuro', 'biura', 'prezydent', 'prezydenta', 'rady', 'rada', 'bydgoszcz', 'bydgoszczy', 'polska', 'polski', 'informacji', 'publicznej', 'dyrektor', 'naczelnik', 'kierownik', 'zastępca', 'skarbu', 'państwa']);

// Osoby pełniące funkcje publiczne – ich dane w związku z funkcją co do zasady nie podlegają ochronie.
const PUBLIC_FUNCTION = /(prezydent|zastępca prezydenta|naczelnik|dyrektor|kierownik|radn[ya]|przewodnicząc|sekretarz miasta|skarbnik)/i;

export function detect(text, { minConfidence = 0.5 } = {}) {
  const found = [];
  const add = (start, end, type, label, basis, confidence, note) => {
    if (confidence < minConfidence) return;
    found.push({ start, end, text: text.slice(start, end), type, label, basis, confidence: Math.round(confidence * 100) / 100, note });
  };

  for (const d of DETECTORS) {
    d.re.lastIndex = 0;
    let m;
    while ((m = d.re.exec(text))) {
      const ctx = text.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
      add(m.index, m.index + m[0].length, d.type, d.label, d.basis, d.check(m[0], ctx));
    }
  }

  // Imię i nazwisko: słownik imion + forma grzecznościowa.
  HONORIFIC_RE.lastIndex = 0;
  let m;
  while ((m = HONORIFIC_RE.exec(text))) {
    const start = m.index + m[0].indexOf(m[1]);
    const words = m[1].split(/\s+/);
    if (words.every((w) => NOT_SURNAME.has(w.toLowerCase()))) continue;
    add(start, start + m[1].length, 'OSOBA', 'Imię i nazwisko', BASIS_PRIV, 0.85);
  }
  PERSON_RE.lastIndex = 0;
  while ((m = PERSON_RE.exec(text))) {
    const [full, a, b] = m;
    let conf = 0;
    if (isFirstName(a) && !NOT_SURNAME.has(b.toLowerCase())) conf = 0.9;
    else if (isFirstName(b) && !NOT_SURNAME.has(a.toLowerCase()) && /(?:ski|cki|dzki|ska|cka|dzka|wicz|czyk|ak|ek|ik|uk|yk)$/.test(a.toLowerCase())) conf = 0.85;
    if (!conf) { PERSON_RE.lastIndex = m.index + a.length + 1; continue; }
    // funkcja publiczna tylko bezpośrednio przed nazwiskiem (w tym samym członie zdania)
    const before = text.slice(Math.max(0, m.index - 60), m.index).split(/[,;:()\n]/).pop();
    let note;
    if (PUBLIC_FUNCTION.test(before)) {
      conf = 0.55;
      note = 'Prawdopodobnie osoba pełniąca funkcję publiczną – dane związane z funkcją zwykle jawne (art. 5 ust. 2 zd. 2). Zweryfikuj.';
    }
    add(m.index, m.index + full.length, 'OSOBA', 'Imię i nazwisko', BASIS_PRIV, conf, note);
  }

  return mergeOverlaps(found);
}

export function mergeOverlaps(list) {
  list.sort((a, b) => a.start - b.start || b.end - a.end || b.confidence - a.confidence);
  const out = [];
  for (const e of list) {
    const last = out[out.length - 1];
    if (last && e.start < last.end) {
      if (e.end > last.end || e.confidence > last.confidence) {
        // zachowaj szerszy zakres, wyższą pewność
        const keep = e.confidence > last.confidence ? e : last;
        out[out.length - 1] = { ...keep, start: Math.min(last.start, e.start), end: Math.max(last.end, e.end) };
        out[out.length - 1].text = undefined;
      }
      continue;
    }
    out.push(e);
  }
  return out;
}

// Spójna pseudonimizacja: ta sama wartość → ten sam znacznik (np. „Osoba A”).
export function assignLabels(text, entities) {
  const people = new Map();
  let n = 0;
  return entities.map((e, i) => {
    const value = text.slice(e.start, e.end);
    let alias;
    if (e.type === 'OSOBA') {
      const key = value.toLowerCase().replace(/\s+/g, ' ').slice(0, 9);
      if (!people.has(key)) people.set(key, `Osoba ${String.fromCharCode(65 + (n++ % 26))}`);
      alias = people.get(key);
    }
    return { id: `e${i + 1}`, ...e, text: value, alias };
  });
}

export function analyze(text) {
  return assignLabels(text, detect(text));
}

// Zastosowanie zaakceptowanych zaczernień.
export function redact(text, entities, { mode = 'block' } = {}) {
  const acc = entities.filter((e) => e.status === 'accepted').sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of acc) {
    const repl = mode === 'alias' && e.alias ? `[${e.alias}]` : '█'.repeat(Math.max(4, Math.min(16, e.end - e.start)));
    out = out.slice(0, e.start) + repl + out.slice(e.end);
  }
  return out;
}
