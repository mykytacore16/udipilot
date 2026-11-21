// Generowanie projektu odpowiedzi. Zasada: treść merytoryczna pochodzi WYŁĄCZNIE z odpowiedzi wydziałów;
// szablon dodaje tylko formuły prawne. Każdy akapit merytoryczny ma wskazane źródło.
import { BM25, overlap, sentences, truncate } from './text.js';
import { RESPONSE_TYPES, departments } from './analysis.js';
import { addDays, today } from './deadlines.js';

const plDate = (s) => (s ? s.split('-').reverse().join('.') + ' r.' : '[data]');

// Podział odpowiedzi wydziału na fragmenty „Ad 1”, „Ad. 2”, „1.” …
export function segmentResponse(text) {
  const clean = text
    .replace(/\r/g, '')
    .split('\n')
    // formuła wstępna („W odpowiedzi na prośbę AIP informuję, że …”) – zostaw samą treść
    .map((l) => {
      const s = l.replace(/^\s*w odpowiedzi na [^:]*?(?:uprzejmie )?informuj[eę](?:,\s*że|\s*:)?\s*/i, '');
      return s === l ? l : s.replace(/^./, (c) => c.toUpperCase());
    })
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (/^(z poważaniem|z wyrazami szacunku|do wiadomości|sporządził|podpis|do:|od:)/i.test(t)) return false;
      // nagłówki i podpisy: „Wydział Ochrony Środowiska”, „Dyrektor Wydziału”, „Naczelnik …”
      if (t.length < 70 && !/[.?!]$/.test(t) && /^(wydział|biuro|dyrektor|naczelnik|kierownik|zastępca|z up\.|urząd stanu|miejski rzecznik)/i.test(t)) return false;
      return true;
    })
    .join('\n');
  const re = /(?:^|\n)\s*(?:Ad\.?\s*(\d{1,2})|pkt\.?\s*(\d{1,2})|(\d{1,2})[.)])\s*[:.)-]?\s*/gi;
  const marks = [];
  let m;
  while ((m = re.exec(clean))) marks.push({ no: +(m[1] || m[2] || m[3]), idx: m.index, end: re.lastIndex });
  if (!marks.length) return [{ no: null, text: clean.trim() }];
  const segs = [];
  for (let i = 0; i < marks.length; i++) {
    const t = clean.slice(marks[i].end, marks[i + 1]?.idx ?? clean.length).replace(/\s+/g, ' ').trim();
    if (t) segs.push({ no: marks[i].no, text: t });
  }
  return segs;
}

function answersFor(question, responses) {
  const out = [];
  for (const r of responses) {
    const segs = segmentResponse(r.text);
    const numbered = segs.filter((s) => s.no != null);
    const assignedHere = (question.departments || []).includes(r.department);
    if (numbered.length) {
      const hit = numbered.find((s) => s.no === question.no);
      if (hit) out.push({ text: hit.text, source: r, how: `fragment „Ad ${question.no}” odpowiedzi ${r.department}` });
      continue;
    }
    const whole = segs[0]?.text || '';
    if (!whole) continue;
    if (r.__assign) {
      // zdania rozdzielone między pytania tego wydziału (każde zdanie do najlepiej pasującego pytania)
      const mine = r.__assign.get(question.no);
      if (mine?.length) out.push({ text: mine.join(' '), source: r, how: `zdania odpowiedzi ${r.department} przypisane do pytania ${question.no}` });
      continue;
    }
    if (assignedHere && r.__questionsForDept === 1) {
      out.push({ text: whole.replace(/\s+/g, ' '), source: r, how: `cała odpowiedź ${r.department}` });
    } else {
      // dopasowanie zdań do pytania
      const idx = new BM25(sentences(whole).map((s, i) => ({ id: i, text: s })));
      const hits = idx.search(question.text, { limit: 3 }).filter((h) => h.relevance >= 40 && h.matched.length >= 2);
      if (hits.length && (assignedHere || hits[0].matched.length >= 3)) {
        const ordered = hits.sort((a, b) => a.doc.id - b.doc.id).map((h) => h.doc.text).join(' ');
        out.push({ text: ordered, source: r, how: `zdania dopasowane do pytania z odpowiedzi ${r.department}` });
      }
    }
  }
  return out;
}

export function buildDraft(caseData, { type = 'udostepnienie', extension, bipLink, reason } = {}) {
  const { wniosek, questions, responses } = caseData;
  const counts = {};
  for (const q of questions) for (const d of q.departments || []) counts[d] = (counts[d] || 0) + 1;
  for (const r of responses) {
    r.__questionsForDept = counts[r.department] || 0;
    delete r.__assign;
    const segs = segmentResponse(r.text);
    if (r.__questionsForDept > 1 && !segs.some((s) => s.no != null) && segs[0]?.text) {
      // odpowiedź bez „Ad N” na kilka pytań: przypisz każde zdanie do najlepiej pasującego pytania
      const mineQs = questions.filter((q) => (q.departments || []).includes(r.department));
      const sents = sentences(segs[0].text);
      const sIdx = new BM25(sents.map((s, i) => ({ id: i, text: s })));
      // dopasowanie zachłanne: najmocniejsze pary (pytanie, zdanie), każde zdanie i pytanie najwyżej raz
      const pairs = [];
      for (const q of mineQs) for (const h of sIdx.search(q.text, { limit: sents.length })) pairs.push({ no: q.no, si: h.doc.id, score: h.score });
      pairs.sort((a, b) => b.score - a.score);
      const owner = new Array(sents.length).fill(null);
      const usedQ = new Set();
      for (const p of pairs) {
        if (usedQ.has(p.no) || owner[p.si] != null || p.score < 0.5) continue;
        owner[p.si] = p.no;
        usedQ.add(p.no);
      }
      // zdania bez pary → do pytania poprzedniego zdania (kontynuacja wypowiedzi)
      for (let i = 0; i < owner.length; i++) if (owner[i] == null) owner[i] = owner[i - 1] ?? owner.find((o) => o != null) ?? null;
      const assign = new Map();
      owner.forEach((no, i) => { if (no == null) return; if (!assign.has(no)) assign.set(no, []); assign.get(no).push(sents[i]); });
      if (assign.size) r.__assign = assign;
    }
  }

  const blocks = [];
  const T = (kind, text) => blocks.push({ id: `b${blocks.length + 1}`, kind, text, sources: [] });
  const year = (wniosek.received_at || today()).slice(0, 4);
  const sign = /^BKS\./.test(wniosek.number) ? wniosek.number : `BKS.IV.1431.${String(wniosek.number).replace(/\D/g, '') || wniosek.id}.${year}`;

  T('header', `Bydgoszcz, dnia ${plDate(today())}`);
  T('header', sign);
  T('address', [wniosek.requester || '[Wnioskodawca]', wniosek.requester_contact || ''].filter(Boolean).join('\n'));

  const intro = `W odpowiedzi na wniosek z dnia ${plDate(wniosek.request_date || wniosek.received_at)} (data wpływu do Urzędu: ${plDate(wniosek.received_at)}) o udostępnienie informacji publicznej`;
  const law = 'ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej';
  const missing = [];

  if (type === 'udostepnienie') {
    T('intro', `${intro}, działając na podstawie art. 2 ust. 1 i art. 10 ust. 1 ${law}, uprzejmie informuję:`);
    // Odpowiedź wydziału bez numeracji „Ad N”, której nie da się rozdzielić na pytania →
    // jeden wspólny akapit dla wszystkich pytań tego wydziału (zamiast fałszywego „brak odpowiedzi”).
    const answers = questions.map((q) => answersFor(q, responses));
    const joint = new Map(); // responseId → { r, nos: [] }
    questions.forEach((q, i) => {
      if (answers[i].length) return;
      const r = responses.find((x) => !x.__assign && (q.departments || []).includes(x.department) && !segmentResponse(x.text).some((s) => s.no != null) && segmentResponse(x.text)[0]?.text);
      if (!r) return;
      if (!joint.has(r.id)) joint.set(r.id, { r, nos: [], first: q.no });
      joint.get(r.id).nos.push(q.no);
    });
    const jointByFirst = new Map([...joint.values()].map((j) => [j.first, j]));
    const inJoint = new Set([...joint.values()].flatMap((j) => j.nos));
    for (const [i, q] of questions.entries()) {
      const ans = answers[i];
      if (!ans.length && inJoint.has(q.no)) {
        const j = jointByFirst.get(q.no);
        if (!j) continue; // pytanie objęte wspólnym akapitem wcześniej
        const label = j.nos.length > 1 ? `Ad ${j.nos.join(', ')}.` : `Ad ${q.no}.`;
        const whole = segmentResponse(j.r.text)[0].text.replace(/\s+/g, ' ');
        blocks.push({
          id: `b${blocks.length + 1}`, kind: 'answer', questionNo: q.no,
          question: questions.filter((x) => j.nos.includes(x.no)).map((x) => `${x.no}. ${x.text}`).join(' '),
          text: `${label} ${whole}`,
          sources: [{ responseId: j.r.id, department: j.r.department, file: j.r.filename, how: `wspólna odpowiedź ${j.r.department} na pytania ${j.nos.join(', ')}`, excerpt: truncate(whole, 400) }],
        });
        continue;
      }
      if (!ans.length) {
        missing.push(q.no);
        blocks.push({ id: `b${blocks.length + 1}`, kind: 'missing', questionNo: q.no, question: q.text, text: `Ad ${q.no}. [BRAK ODPOWIEDZI WYDZIAŁU – uzupełnij lub wyślij ponowne zapytanie do: ${(q.departments || []).join(', ') || 'wydział nieprzypisany'}]`, sources: [] });
        continue;
      }
      blocks.push({
        id: `b${blocks.length + 1}`,
        kind: 'answer',
        questionNo: q.no,
        question: q.text,
        text: `Ad ${q.no}. ${ans.map((a) => a.text).join(' ')}`,
        sources: ans.map((a) => ({ responseId: a.source.id, department: a.source.department, file: a.source.filename, how: a.how, excerpt: truncate(a.text, 400) })),
      });
    }
  } else if (type === 'przedluzenie') {
    const date = extension || addDays(wniosek.received_at, 60);
    T('intro', `${intro}, działając na podstawie art. 13 ust. 2 ${law}, uprzejmie zawiadamiam, że wnioskowana informacja nie może zostać udostępniona w terminie 14 dni od dnia złożenia wniosku.`);
    T('template', `Powodem opóźnienia jest ${reason || 'konieczność przeprowadzenia kwerendy w dokumentacji archiwalnej oraz zebrania informacji z kilku komórek organizacyjnych Urzędu'}.`);
    T('template', `Informacja zostanie udostępniona w terminie do dnia ${plDate(date)}.`);
  } else if (type === 'doprecyzowanie') {
    T('intro', `${intro}, uprzejmie informuję, że treść wniosku nie pozwala jednoznacznie ustalić zakresu żądanej informacji${reason ? ` – ${reason}` : ''}.`);
    T('template', 'W związku z powyższym proszę o doprecyzowanie wniosku poprzez wskazanie, jakich konkretnie informacji publicznych dotyczy żądanie (np. okres, rodzaj dokumentów, zakres danych).');
    T('template', 'Termin na udostępnienie informacji publicznej, o którym mowa w art. 13 ust. 1 ustawy o dostępie do informacji publicznej, biegnie od dnia otrzymania doprecyzowanego wniosku. Brak doprecyzowania uniemożliwi rozpatrzenie wniosku w zakresie, którego nie da się ustalić.');
  } else if (type === 'przetworzona') {
    T('intro', `${intro}, uprzejmie informuję, że żądana informacja ma charakter informacji przetworzonej – jej przygotowanie wymaga ${reason || 'analizy i zestawienia danych z wielu dokumentów, a tym samym zaangażowania znacznych zasobów osobowych i czasowych Urzędu'}.`);
    T('template', `W związku z powyższym, na podstawie art. 3 ust. 1 pkt 1 ${law}, wzywam do wykazania, w terminie 14 dni od dnia doręczenia niniejszego pisma, że uzyskanie wnioskowanej informacji jest szczególnie istotne dla interesu publicznego.`);
    T('template', 'Nieudzielenie odpowiedzi na wezwanie może skutkować wydaniem decyzji o odmowie udostępnienia informacji publicznej.');
  } else if (type === 'bip') {
    T('intro', `${intro}, uprzejmie informuję, że wnioskowana informacja została udostępniona w Biuletynie Informacji Publicznej Urzędu Miasta Bydgoszczy pod adresem: ${bipLink || '[wklej link do BIP]'}.`);
    T('template', 'Informacja publiczna udostępniona w BIP nie podlega ponownemu udostępnieniu w trybie wnioskowym (art. 10 ust. 1 ustawy o dostępie do informacji publicznej).');
  } else if (type === 'nie_ip') {
    T('intro', `${intro}, uprzejmie informuję, że przedstawione żądanie nie stanowi wniosku o udostępnienie informacji publicznej w rozumieniu art. 1 ust. 1 i art. 6 ${law}, ponieważ ${reason || 'dotyczy wyjaśnienia lub interpretacji przepisów, a nie informacji o sprawach publicznych istniejącej w zasobach Urzędu'}.`);
    T('template', 'Niniejsze pismo ma charakter informacyjny i nie jest decyzją administracyjną.');
  } else if (type === 'odmowa') {
    T('title', 'DECYZJA');
    T('intro', `Na podstawie art. 16 ust. 1 w związku z art. 5 ust. 2 ${law} oraz art. 104 Kodeksu postępowania administracyjnego, po rozpatrzeniu wniosku z dnia ${plDate(wniosek.request_date || wniosek.received_at)},`);
    T('title', 'odmawiam');
    T('template', `udostępnienia informacji publicznej w zakresie: ${reason || '[wskaż zakres]'}.`);
    T('title', 'UZASADNIENIE');
    T('template', '[Uzasadnienie faktyczne i prawne – wskaż chronione dobro (prywatność osoby fizycznej / tajemnica przedsiębiorcy) oraz osoby, które zgłosiły zastrzeżenie, jeśli dotyczy.]');
    T('title', 'POUCZENIE');
    T('template', 'Od niniejszej decyzji przysługuje odwołanie do Samorządowego Kolegium Odwoławczego w Bydgoszczy, za pośrednictwem Prezydenta Miasta Bydgoszczy, w terminie 14 dni od dnia jej doręczenia.');
  }

  T('closing', 'Z poważaniem');
  T('signature', '[podpis osoby upoważnionej]');

  return { type, typeLabel: RESPONSE_TYPES[type]?.label, basis: RESPONSE_TYPES[type]?.basis, blocks, missing, generatedAt: new Date().toISOString() };
}

// Weryfikacja projektu (także po ręcznej edycji): czy każde zdanie merytoryczne ma oparcie w źródłach
// i czy wszystkie liczby/kwoty/daty występują w odpowiedziach wydziałów.
const NUM_RE = /\d{1,3}(?:[  ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;
const numbers = (s) => (s.match(NUM_RE) || []).map((n) => n.replace(/[\s ]/g, '').replace(',', '.'));

export function verifyDraft(draft, responses) {
  const all = responses.map((r) => r.text).join('\n');
  const numsInSources = new Set(numbers(all));
  const issues = [];
  for (const b of draft.blocks) {
    if (b.kind !== 'answer') continue;
    const body = b.text.replace(/^Ad \d+\.\s*/, '');
    const src = (b.sources || []).map((s) => s.excerpt).join(' ') || all;
    for (const s of sentences(body)) {
      const ov = Math.max(overlap(s, src), overlap(s, all));
      const nums = numbers(s);
      const badNums = nums.filter((n) => !numsInSources.has(n));
      if (ov < 0.5 || badNums.length) {
        issues.push({
          blockId: b.id,
          sentence: s,
          reason: badNums.length
            ? `Liczby niewystępujące w odpowiedziach wydziałów: ${badNums.join(', ')}`
            : `Zdanie bez wyraźnego potwierdzenia w źródłach (pokrycie ${Math.round(ov * 100)}%)`,
        });
      }
    }
  }
  return { ok: issues.length === 0 && !draft.blocks.some((b) => b.kind === 'missing'), issues, missing: draft.blocks.filter((b) => b.kind === 'missing').map((b) => b.questionNo) };
}

export function draftToText(draft) {
  return draft.blocks.map((b) => b.text).join('\n\n');
}

export function departmentRequestText(wniosek, questions, code, deadline) {
  const dept = departments.find((d) => d.code === code);
  const qs = questions.filter((q) => (q.departments || []).includes(code));
  // Zgodnie z Zarządzeniem nr 536/2024 Prezydenta Miasta Bydgoszczy (§ 10–11).
  return [
    `Do: ${dept?.name || code}`,
    'Od: Administrator Informacji Publicznej (AIP), Biuro Komunikacji Społecznej',
    `Dotyczy: wniosek o udostępnienie informacji publicznej, znak ${wniosek.number}, data wpływu ${plDate(wniosek.received_at)}`,
    '',
    'Na podstawie § 10 Zarządzenia nr 536/2024 Prezydenta Miasta Bydgoszczy przekazuję zakres wniosku do rozpatrzenia. Uprzejmie proszę o przygotowanie projektu odpowiedzi w części odpowiadającej zakresowi działania Wydziału (proszę oznaczać odpowiedzi „Ad 1”, „Ad 2”…):',
    ...qs.map((q) => `${q.no}. ${q.text}`),
    '',
    `Projekt odpowiedzi proszę przesłać na adres bip@um.bydgoszcz.pl w terminie do ${plDate(addDays(deadline, -3))} (termin ustawowy: ${plDate(deadline)}).`,
    'Przypominam (§ 11 Zarządzenia):',
    '– informację przekazuje się po dokonaniu koniecznej anonimizacji (ust. 8);',
    '– jeżeli Wydział nie posiada informacji, proszę niezwłocznie o tym poinformować i wskazać jednostkę właściwą (ust. 3);',
    '– jeżeli informacja ma charakter przetworzony, proszę o projekt odpowiedzi z uzasadnieniem (ust. 7);',
    '– jeżeli informacja jest chroniona prawem, proszę o projekt decyzji o odmowie udostępnienia (ust. 9);',
    '– jeżeli projekt nie może być przesłany w terminie, proszę pisemnie wskazać powód i nowy termin (ust. 5).',
  ].join('\n');
}
