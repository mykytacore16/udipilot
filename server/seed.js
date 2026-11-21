// Dane testowe: archiwum odpowiedzi, baza wiedzy i 10 wniosków w różnych stanach.
// Daty wpływu liczone względem DZISIAJ, żeby podświetlenie terminów zawsze było widoczne na demo.
// Wszystkie osoby i dane są fikcyjne.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, log } from './db.js';
import { computeDeadline, today, addDays, shiftToWorkingDay } from './lib/deadlines.js';
import { splitQuestions, routeQuestions, classify, extractMeta, summarize } from './lib/analysis.js';
import { BM25 } from './lib/text.js';
import { parseRegistry, numberSeq, makeNumber } from './lib/registry.js';
import { importRecords } from './importer.js';

export function seedDemo() {
db.exec("DELETE FROM historia; DELETE FROM projekty; DELETE FROM odpowiedzi; DELETE FROM pytania; DELETE FROM wnioski; DELETE FROM dokumenty; DELETE FROM sqlite_sequence;");

const load = (f) => JSON.parse(readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8'));

// --- archiwum + wiedza ---
const archive = load('archive.json');
const insDoc = db.prepare('INSERT INTO dokumenty (kind, title, number, date, departments, question, answer, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
for (const a of archive) insDoc.run('archiwum', a.title, a.number, a.date, JSON.stringify(a.departments), a.question, a.answer, `${a.question}\n${a.answer}`);
for (const k of load('knowledge.json')) insDoc.run(k.kind, k.title, k.number, today(), '[]', null, null, k.text);
const idx = new BM25(archive.map((a, i) => ({ id: i, number: a.number, departments: a.departments, text: `${a.title} ${a.question} ${a.answer}` })));

// --- wnioski ---
const T = today();
// pierwszy dzień roboczy >= dziś
const wd = (n) => {
  let d = shiftToWorkingDay(T).date;
  for (let i = 0; i < n; i++) d = shiftToWorkingDay(addDays(d, 1)).date;
  return d;
};
function receivedFor(target) {
  for (let back = 14; back <= 20; back++) {
    const r = addDays(target, -back);
    if (computeDeadline(r).deadline === target) return r;
  }
  return addDays(target, -14);
}

const W = [
  {
    target: addDays(T, -30), status: 'wyslana', initials: 'MK', answered: addDays(T, -18),
    text: `Bydgoszcz, dnia [data]\nWnioskodawca: Tomasz Lewandowski\ne-mail: t.lewandowski@example.com\n\nWNIOSEK O UDOSTĘPNIENIE INFORMACJI PUBLICZNEJ\n\nNa podstawie art. 2 ust. 1 ustawy o dostępie do informacji publicznej wnoszę o udostępnienie informacji:\n1. Ile drzew wycięto w 2025 r. w związku z przebudową ul. Kujawskiej?\n2. Ile drzew posadzono w ramach nasadzeń zastępczych?\nOdpowiedź proszę przesłać na adres e-mail.\nZ poważaniem\nTomasz Lewandowski`,
    responses: [{ department: 'WGK', filename: 'WGK_odp.docx', text: 'Ad 1. W związku z przebudową ul. Kujawskiej w 2025 r. usunięto 31 drzew. Ad 2. W ramach nasadzeń zastępczych posadzono 64 drzewa, w tym 40 lip drobnolistnych.' }],
  },
  {
    target: addDays(T, -2), status: 'kwerenda', initials: 'AN', extension: 45, reason: 'konieczność przeprowadzenia kwerendy w dokumentacji archiwalnej z lat 2019–2025',
    text: `Wnioskodawca: Fundacja Przejrzyste Miasto\ne-mail: biuro@przejrzyste-miasto.example.org\nDotyczy: wydatki na promocję miasta 2019–2025\n\nWnoszę o udostępnienie informacji publicznej:\n1. Jaką kwotę wydano na promocję miasta w poszczególnych latach 2019–2025?\n2. Proszę o kopie wszystkich umów zawartych z agencjami reklamowymi w tym okresie.\n3. Jakie wydarzenia sportowe były sponsorowane przez miasto w 2025 r.?\nInformację proszę przesłać w formie elektronicznej.`,
    responses: [],
  },
  {
    // po terminie: ostatni dzień roboczy przed dziś
    target: (() => { let d = addDays(T, -1); while (shiftToWorkingDay(d).date !== d) d = addDays(d, -1); return d; })(), status: 'w_wydzialach', initials: 'MK',
    text: `Wnioskodawca: Marta Kaczmarek\nul. Długa 14/2, 85-034 Bydgoszcz\ntel. 512 345 678\n\nProszę o udostępnienie informacji:\n1. Jakie umowy na utrzymanie systemów informatycznych zawarł Urząd w 2026 r. i z kim?\n2. Jaka jest łączna wartość tych umów?\nOdpowiedź proszę przesłać pocztą na wskazany adres.`,
    responses: [{ department: 'WI', filename: 'WI_odpowiedz.docx', text: 'Ad 1. W 2026 r. Urząd zawarł 6 umów na utrzymanie systemów informatycznych, m.in. na utrzymanie systemu elektronicznego zarządzania dokumentacją oraz systemu finansowo-księgowego. Wykaz umów zawiera rejestr umów w BIP.' }],
  },
  {
    target: wd(0), status: 'w_wydzialach', initials: 'JW', demo: true,
    text: `Bydgoszcz, 2 listopada 2026 r.\nWnioskodawca: Paweł Zieliński\ne-mail: pawel.zielinski@example.com\n\nWNIOSEK O UDOSTĘPNIENIE INFORMACJI PUBLICZNEJ\n\nNa podstawie ustawy o dostępie do informacji publicznej proszę o udostępnienie następujących informacji:\n1. Ile decyzji o pozwoleniu na budowę wydał Prezydent Miasta Bydgoszczy w okresie od 1 stycznia do 30 września 2026 r.?\n2. Ile z tych decyzji dotyczyło budynków mieszkalnych wielorodzinnych?\n3. Ile wniosków o pozwolenie na budowę zostało rozpatrzonych odmownie?\n4. Ile drzew zostało wyciętych w związku z inwestycjami mieszkaniowymi w tym okresie?\nOdpowiedź proszę przesłać na adres e-mail.\nZ poważaniem\nPaweł Zieliński`,
    responses: [
      { department: 'WAB', filename: 'WAB_odpowiedz_wniosek.docx', text: `W odpowiedzi na prośbę koordynatora uprzejmie informuję:\nAd 1. W okresie od 1 stycznia do 30 września 2026 r. Prezydent Miasta Bydgoszczy wydał 842 decyzje o pozwoleniu na budowę.\nAd 2. 97 decyzji dotyczyło budynków mieszkalnych wielorodzinnych, w tym inwestycji realizowanej przez Pana Krzysztofa Nowickiego przy ul. Szubińskiej 120.\nAd 3. Rozpatrzono odmownie 29 wniosków o pozwolenie na budowę.\nSporządziła: Agnieszka Dąbrowska, tel. 52 585 88 01\nZ poważaniem\nNaczelnik Wydziału` },
    ],
  },
  {
    target: wd(1), status: 'w_wydzialach', initials: 'AN',
    text: `Wnioskodawca: Stowarzyszenie Rodziców SP 21\ne-mail: rodzice.sp21@example.org\n\nWnoszę o udostępnienie informacji:\n1. Jaki jest zakres i koszt remontu Szkoły Podstawowej nr 21?\n2. Jaki jest termin zakończenia prac?\n3. Czy w trakcie remontu zajęcia będą prowadzone w innym budynku?`,
    responses: [{ department: 'WIM', filename: 'WIM_odp.pdf', text: 'Ad 1. Zakres prac obejmuje wymianę instalacji elektrycznej, modernizację sanitariatów oraz termomodernizację budynku. Wartość umowy z wykonawcą wynosi 4 260 000 zł brutto. Ad 2. Termin zakończenia prac określono na 15 sierpnia 2027 r.' }],
  },
  {
    target: wd(3), status: 'nowy', initials: 'JW',
    text: `Wnioskodawca: Katarzyna Woźniak\ne-mail: k.wozniak@example.com\n\nProszę o informację, które organizacje pozarządowe otrzymały w 2026 r. dotacje z budżetu miasta na zadania z zakresu wspierania seniorów oraz w jakiej wysokości.\nOdpowiedź proszę przesłać e-mailem.`,
  },
  {
    target: wd(4), status: 'nowy', initials: 'MK',
    text: `Wnioskodawca: Michał Szymański\n\nWnoszę o udostępnienie informacji publicznej w zakresie:\n1. Zestawienie nagród przyznanych pracownikom Urzędu Miasta w podziale na wydziały za lata 2020–2026.\n2. Wysokość nagrody przyznanej Pani Joannie Malinowskiej z Wydziału Księgowości w 2025 r.\nInformację proszę przesłać na adres e-mail: m.szymanski@example.com`,
  },
  {
    target: wd(6), status: 'nowy', initials: 'AN',
    text: `Dzień dobry,\nczy mogę postawić altanę ogrodową o powierzchni 30 m2 na swojej działce przy ul. Leśnej bez zgłoszenia? Jak mam postąpić, żeby nie dostać kary?\nPozdrawiam\nRobert Mazur\nrobert.mazur@example.com`,
  },
  {
    target: wd(8), status: 'nowy', initials: 'JW',
    text: `Wnioskodawca: Lokalny portal informacyjny „Bydgoszcz Dziś”\ne-mail: redakcja@bydgoszcz-dzis.example.pl\n\nProszę o udostępnienie informacji:\n1. Ile projektów zgłoszono do budżetu obywatelskiego na 2027 r.?\n2. Ile projektów zostało dopuszczonych do głosowania?\n3. Jaka jest łączna pula środków budżetu obywatelskiego na 2027 r.?`,
  },
  {
    target: wd(9), status: 'nowy', initials: 'MK',
    text: `Wnioskodawca: Ewa Pawlak\ne-mail: ewa.pawlak@example.com\n\nWnoszę o udostępnienie informacji:\n1. Jaka jest obecna stawka opłaty za gospodarowanie odpadami komunalnymi?\n2. Ile wynosiły zaległości z tytułu tej opłaty na koniec 2025 r.?\n3. Ile punktów selektywnej zbiórki odpadów komunalnych (PSZOK) działa w mieście?`,
  },
  {
    target: wd(2), status: 'doprecyzowanie', initials: 'JW', clarificationAsked: addDays(T, -3),
    text: `Wnioskodawca: Tomasz Krawczyk\ne-mail: t.krawczyk@example.com\n\nProszę o udostępnienie informacji publicznej dotyczącej inwestycji na osiedlu, zgodnie z załączonymi wnioskami.`,
  },
];

const insW = db.prepare(`INSERT INTO wnioski (number, year, received_at, request_date, deadline, deadline_explanation, status, extension_until, extension_reason, initials, summary, requester, requester_contact, delivery, text, filename, hints, answered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insQ = db.prepare('INSERT INTO pytania (wniosek_id, no, text, departments, suggestions) VALUES (?, ?, ?, ?, ?)');
const insR = db.prepare('INSERT INTO odpowiedzi (wniosek_id, department, filename, text) VALUES (?, ?, ?, ?)');

// 10 wniosków testowych z arkusza UMB („Schemat kalendarium”) – dokładnie w formacie organizatora.
importRecords(parseRegistry(readFileSync(new URL('../samples/umb/WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx', import.meta.url))), idx);

// Bieżące wnioski demonstracyjne – numeracja kontynuuje arkusz UMB (ostatni: BKS.IV.1431.599.2026).
const rows = W.map((w) => ({ ...w, received: w.received || receivedFor(w.target) })).sort((a, b) => a.received.localeCompare(b.received));
const seq = {};
for (const w of rows) {
  const year = +w.received.slice(0, 4);
  seq[year] = (seq[year] || Math.max(0, ...db.prepare('SELECT number FROM wnioski WHERE year = ?').all(year).map((r) => numberSeq(r.number)))) + 1;
  const number = makeNumber(seq[year], year);
  const dl = computeDeadline(w.received);
  const meta = extractMeta(w.text);
  const questions = splitQuestions(w.text);
  const extUntil = w.extension ? shiftToWorkingDay(addDays(w.received, w.extension)).date : null;
  const info = insW.run(number, year, w.received, meta.requestDate, extUntil || dl.deadline, JSON.stringify(dl.explanation), w.status, extUntil, w.reason || null,
    w.initials, summarize(w.text, questions), meta.requester, meta.email, meta.delivery, w.text, w.demo ? 'wniosek_pozwolenia_na_budowe.pdf' : null,
    JSON.stringify(classify(w.text).hints), w.answered || null);
  const id = Number(info.lastInsertRowid);
  if (w.clarificationAsked) db.prepare('UPDATE wnioski SET clarification_requested_at = ?, sheet_deadline = deadline WHERE id = ?').run(w.clarificationAsked, id);
  for (const q of routeQuestions(questions, idx)) {
    insQ.run(id, q.no, q.text, JSON.stringify(q.departments), JSON.stringify(q.suggestions));
  }
  for (const r of w.responses || []) insR.run(id, r.department, r.filename, r.text);
  log(id, 'Wniosek zarejestrowany', `${number}, termin ${dl.deadline}`);
  if (w.status !== 'nowy') log(id, 'Status zaktualizowany', w.status);
}

// W sprawie demo wydział WGK ma odpowiedzieć na pyt. 4 (drzewa) – brak odpowiedzi pokaże wykrywanie luk.
const demo = db.prepare("SELECT id FROM wnioski WHERE filename = 'wniosek_pozwolenia_na_budowe.pdf'").get();
if (demo) {
  const qs = db.prepare('SELECT * FROM pytania WHERE wniosek_id = ? ORDER BY no').all(demo.id);
  for (const q of qs) db.prepare('UPDATE pytania SET departments = ? WHERE id = ?').run(JSON.stringify(q.no === 4 ? ['WGK'] : ['WAB']), q.id);
}

const c = db.prepare('SELECT (SELECT COUNT(*) FROM wnioski) w, (SELECT COUNT(*) FROM dokumenty) d').get();
return { ...c, today: T };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  // --if-empty: nie nadpisuj istniejących danych (ponowna instalacja)
  const has = process.argv.includes('--if-empty') && db.prepare('SELECT COUNT(*) n FROM wnioski').get().n > 0;
  if (has) { console.log('Baza zawiera już dane – pomijam wczytanie danych demo.'); process.exit(0); }
  const c = seedDemo();
  console.log(`Seed OK: ${c.w} wniosków, ${c.d} dokumentów w bazie wiedzy. Dziś: ${c.today}`);
}
