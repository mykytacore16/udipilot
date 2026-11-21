import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDeadline, maxExtension, urgency } from '../lib/deadlines.js';
import { analyze, redact } from '../lib/anonymize.js';
import { splitQuestions } from '../lib/analysis.js';
import { segmentResponse, verifyDraft } from '../lib/draft.js';

test('termin 14 dni, przesunięcie z soboty na poniedziałek', () => {
  assert.equal(computeDeadline('2026-11-07').deadline, '2026-11-23'); // 21.11 = sobota
});

test('termin przesunięty przez święta (Wigilia, Boże Narodzenie, weekend)', () => {
  assert.equal(computeDeadline('2026-12-10').deadline, '2026-12-28');
});

test('11 listopada przesuwa termin', () => {
  assert.equal(computeDeadline('2026-10-28').deadline, '2026-11-12');
});

test('kwerenda maks. 2 miesiące', () => {
  assert.equal(maxExtension('2026-11-05'), '2027-01-05');
});

test('pilność: po terminie / dziś / jutro', () => {
  assert.equal(urgency('2026-11-19', 'nowy', '2026-11-20').level, 'overdue');
  assert.equal(urgency('2026-11-20', 'nowy', '2026-11-20').level, 'today');
  assert.equal(urgency('2026-11-21', 'nowy', '2026-11-20').level, 'tomorrow');
  assert.equal(urgency('2026-11-23', 'nowy', '2026-11-21').level, 'today'); // weekend → pierwszy dzień roboczy
});

test('anonimizacja wykrywa PESEL, IBAN, NIP, e-mail, telefon, osobę, adres', () => {
  const t = 'Pani Anna Kowalska, PESEL 44051401359, ul. Długa 5/2, 85-001 Bydgoszcz, tel. 601 234 567, a.k@example.com, konto 61 1090 1014 0000 0712 1981 2874, NIP 526-104-08-28.';
  const types = new Set(analyze(t).map((e) => e.type));
  for (const x of ['PESEL', 'IBAN', 'NIP', 'EMAIL', 'TELEFON', 'OSOBA', 'ADRES']) assert.ok(types.has(x), `brak ${x}`);
});

test('PESEL z błędną sumą kontrolną bez kontekstu nie jest oznaczany', () => {
  assert.equal(analyze('Numer sprawy 12345678901 w rejestrze.').filter((e) => e.type === 'PESEL').length, 0);
});

test('zaczernienie usuwa dane z tekstu', () => {
  const t = 'Wnioskodawca Jan Kowalski mieszka tutaj.';
  const ents = analyze(t).map((e) => ({ ...e, status: 'accepted' }));
  const out = redact(t, ents);
  assert.ok(!out.includes('Kowalski'));
});

test('podział wniosku na pytania (lista numerowana)', () => {
  const q = splitQuestions('Wnoszę o:\n1. Ile drzew wycięto?\n2. Ile posadzono?\nZ poważaniem');
  assert.equal(q.length, 2);
});

test('segmentacja odpowiedzi wydziału po „Ad N”', () => {
  const s = segmentResponse('Ad 1. Pierwsza odpowiedź.\nAd 2. Druga odpowiedź.');
  assert.deepEqual(s.map((x) => x.no), [1, 2]);
});

test('import arkusza UMB: 10 wniosków, wykryte niezgodności i doprecyzowanie', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseRegistry } = await import('../lib/registry.js');
  const recs = parseRegistry(readFileSync(new URL('../../samples/umb/WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx', import.meta.url)));
  assert.equal(recs.length, 10);
  const r15 = recs.find((r) => r.number === 'BKS.IV.1431.15.2026');
  assert.ok(r15.notes.some((n) => /wcześniejsza niż data wpływu/.test(n)));
  const r509 = recs.find((r) => r.number === 'BKS.IV.1431.509.2026');
  assert.equal(r509.clarification.newDeadline, '2026-09-18');
  assert.ok(recs.find((r) => r.number === 'BKS.IV.1431.543.2026').notes.some((n) => /po terminie/.test(n)));
});

test('anonimizacja: kategorie szczególne z katalogu UMB', () => {
  const labels = analyze('Pani Anna Nowak choruje na cukrzycę, korzysta z pomocy MOPS i była karana za wykroczenie.').map((e) => e.label);
  for (const l of ['Stan zdrowia / niepełnosprawność', 'Korzystanie z pomocy społecznej', 'Karalność / wyroki']) assert.ok(labels.includes(l), `brak: ${l}`);
});

test('weryfikacja wykrywa liczby spoza źródeł', () => {
  const draft = { blocks: [{ id: 'b1', kind: 'answer', text: 'Ad 1. Wydano 842 decyzje i 999 zezwoleń.', sources: [{ excerpt: 'Wydano 842 decyzje.' }] }] };
  const v = verifyDraft(draft, [{ text: 'Ad 1. Wydano 842 decyzje.' }]);
  assert.equal(v.issues.length, 1);
  assert.match(v.issues[0].reason, /999/);
});
