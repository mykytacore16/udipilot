// Konfiguracja z pliku .env (jeśli istnieje) – np. LLM_BASE_URL / LLM_MODEL dla lokalnego Bielika.
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch { /* brak .env – tryb offline na regułach */ }

import express from 'express';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, J, log } from './db.js';
import { extractFromFile, httpError } from './lib/extract.js';
import { BM25, truncate } from './lib/text.js';
import { departments, extractMeta, splitQuestions, classify, routeQuestions, summarize, RESPONSE_TYPES, cleanModelQuestions } from './lib/analysis.js';
import { computeDeadline, maxExtension, urgency, today, diffDays } from './lib/deadlines.js';
import { analyze as findPII, mergeOverlaps, assignLabels } from './lib/anonymize.js';
import { buildDraft, verifyDraft, draftToText, departmentRequestText } from './lib/draft.js';
import { toDocx, toText } from './lib/exporter.js';
import { llmStatus, polishParagraph, findPersonalData, splitWithLLM, testConnection } from './lib/llm.js';
import { PROVIDERS, readSettings, writeSettings, clearSettings, activeConfig, maskKey, isLocalUrl, LOCAL_SERVERS } from './lib/settings.js';
import { seedDemo } from './seed.js';
import { parseRegistry, registryXlsx, numberSeq, makeNumber } from './lib/registry.js';
import { importRecords } from './importer.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: '5mb' }));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const STATUSES = ['nowy', 'doprecyzowanie', 'w_wydzialach', 'kwerenda', 'przygotowana', 'wyslana'];

// ---------- Indeks archiwum (odbudowywany przy zmianach) ----------
let archive = null;
function archiveIndex() {
  if (archive) return archive;
  const docs = db.prepare("SELECT * FROM dokumenty WHERE kind = 'archiwum'").all().map((d) => ({
    id: `d${d.id}`, dbId: d.id, number: d.number || d.title, date: d.date, title: d.title,
    departments: J(d.departments, []), question: d.question, answer: d.answer,
    text: `${d.title} ${d.question || ''} ${d.question || ''} ${d.answer || ''}`,
    wniosekId: d.source_wniosek_id,
  }));
  archive = new BM25(docs);
  return archive;
}
const invalidate = () => { archive = null; knowledge = null; };

let knowledge = null;
function knowledgeIndex() {
  if (knowledge) return knowledge;
  const chunks = [];
  for (const d of db.prepare("SELECT * FROM dokumenty WHERE kind != 'archiwum'").all()) {
    const paras = d.text.split(/\n(?=Art\.|\s*§|\n)/);
    paras.forEach((p, i) => p.trim().length > 30 && chunks.push({ id: `k${d.id}_${i}`, docId: d.id, title: d.title, kind: d.kind, text: p.trim() }));
  }
  knowledge = new BM25(chunks);
  return knowledge;
}

function similarCases(text, { excludeWniosekId, limit = 5 } = {}) {
  return archiveIndex()
    .search(text, { limit: limit + 1, filter: (d) => !excludeWniosekId || d.wniosekId !== excludeWniosekId })
    .slice(0, limit)
    .map((r) => ({
      id: r.doc.dbId, number: r.doc.number, date: r.doc.date, title: r.doc.title, departments: r.doc.departments,
      relevance: r.relevance, matched: r.matched, question: truncate(r.doc.question, 220), answer: truncate(r.doc.answer, 400),
      wniosekId: r.doc.wniosekId, recent: r.doc.date ? diffDays(r.doc.date, today()) <= 366 : false,
    }));
}

// ---------- Pomocnicze ----------
function rowToWniosek(w) {
  return {
    ...w,
    hints: J(w.hints, []),
    import_notes: J(w.import_notes, []),
    deadline_explanation: J(w.deadline_explanation, []),
    urgency: urgency(w.deadline, w.status),
  };
}

function loadCase(id) {
  const w = db.prepare('SELECT * FROM wnioski WHERE id = ?').get(id);
  if (!w) throw httpError(404, 'Nie znaleziono wniosku');
  const questions = db.prepare('SELECT * FROM pytania WHERE wniosek_id = ? ORDER BY no').all(id).map((q) => ({ ...q, departments: J(q.departments, []), suggestions: J(q.suggestions, []) }));
  const responses = db.prepare('SELECT * FROM odpowiedzi WHERE wniosek_id = ? ORDER BY id').all(id);
  const p = db.prepare('SELECT * FROM projekty WHERE wniosek_id = ?').get(id);
  const history = db.prepare('SELECT * FROM historia WHERE wniosek_id = ? ORDER BY id DESC').all(id);
  return { wniosek: rowToWniosek(w), questions, responses, draft: p ? J(p.draft) : null, entities: p ? J(p.entities, []) : [], history };
}

function setStatus(id, status, note) {
  const w = db.prepare('SELECT status FROM wnioski WHERE id = ?').get(id);
  if (!w || w.status === status) return;
  db.prepare('UPDATE wnioski SET status = ? WHERE id = ?').run(status, id);
  log(id, `Status: ${statusLabel(status)}`, note);
}
const statusLabel = (s) => ({ nowy: 'brak działań', doprecyzowanie: 'wezwanie do doprecyzowania wniosku', w_wydzialach: 'zapytania wysłane do wydziałów', kwerenda: 'kwerenda (przedłużony termin)', przygotowana: 'odpowiedź przygotowana', wyslana: 'odpowiedź wysłana' }[s] || s);

// Anonimizacja projektu: ponowne wykrycie z zachowaniem decyzji urzędnika.
function detectDraftEntities(draft, previous = []) {
  const text = draftToText(draft);
  const decisions = new Map(previous.filter((e) => e.status !== 'suggested').map((e) => [`${e.type}|${e.text}`, e]));
  const manual = previous.filter((e) => e.manual);
  // granice bloku adresata – tam dane zostają (pismo trafia do wnioskodawcy)
  let off = 0;
  const ranges = draft.blocks.map((b) => { const r = { kind: b.kind, start: off, end: off + b.text.length }; off = r.end + 2; return r; });
  const inAddress = (e) => ranges.some((r) => r.kind === 'address' && e.start >= r.start && e.end <= r.end);

  const auto = findPII(text).map((e) => {
    const prev = decisions.get(`${e.type}|${e.text}`);
    if (inAddress(e)) return { ...e, status: 'kept', note: 'Dane adresata pisma – nie anonimizuje się w odpowiedzi do wnioskodawcy.' };
    return { ...e, status: prev ? prev.status : 'suggested' };
  });
  // ręczne zaczernienia – odszukaj ponownie w nowym tekście
  const manualNow = [];
  for (const m of manual) {
    let from = 0, idx;
    while ((idx = text.indexOf(m.text, from)) !== -1) {
      manualNow.push({ ...m, start: idx, end: idx + m.text.length });
      from = idx + m.text.length;
    }
  }
  const merged = mergeOverlaps([...manualNow.map((m) => ({ ...m, confidence: 1 })), ...auto]).map((e) => ({ ...e, text: text.slice(e.start, e.end) }));
  return assignLabels(text, merged).map((e, i) => ({ ...e, id: `e${i + 1}` }));
}

function saveDraft(id, draft, entities) {
  db.prepare(`INSERT INTO projekty (wniosek_id, draft, entities, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(wniosek_id) DO UPDATE SET draft = excluded.draft, entities = excluded.entities, updated_at = excluded.updated_at`)
    .run(id, JSON.stringify(draft), JSON.stringify(entities));
}

// ---------- API ----------
app.get('/api/status', (req, res) => {
  const counts = db.prepare("SELECT (SELECT COUNT(*) FROM wnioski) w, (SELECT COUNT(*) FROM dokumenty WHERE kind='archiwum') a, (SELECT COUNT(*) FROM dokumenty WHERE kind!='archiwum') k").get();
  res.json({ llm: llmStatus(), counts, today: today(), version: '0.1.0' });
});

app.get('/api/departments', (req, res) => res.json(departments));
app.get('/api/response-types', (req, res) => res.json(RESPONSE_TYPES));

app.get('/api/wnioski', (req, res) => {
  const years = db.prepare('SELECT DISTINCT year FROM wnioski ORDER BY year DESC').all().map((r) => r.year);
  const year = +req.query.year || years[0] || new Date().getFullYear();
  const rows = db.prepare('SELECT * FROM wnioski WHERE year = ? ORDER BY received_at ASC, id ASC').all(year);
  const deptRows = db.prepare('SELECT wniosek_id, departments FROM pytania').all();
  const depts = new Map();
  for (const r of deptRows) {
    const s = depts.get(r.wniosek_id) || new Set();
    J(r.departments, []).forEach((d) => s.add(d));
    depts.set(r.wniosek_id, s);
  }
  const items = rows.map((w, i) => {
    const { text, ...rest } = rowToWniosek(w);
    return { ...rest, lp: i + 1, departments: [...(depts.get(w.id) || [])] };
  });
  res.json({ year, years: years.length ? years : [year], items });
});

// Analiza nowego wniosku (bez zapisu)
app.post('/api/wnioski/analyze', upload.single('file'), wrap(async (req, res) => {
  let text = req.body?.text, filename = null, format = 'tekst';
  if (req.file) ({ text, filename, format } = await extractFromFile(req.file));
  if (!text || text.trim().length < 15) throw httpError(400, 'Brak treści wniosku');
  const meta = extractMeta(text);
  let questions = splitQuestions(text);
  let summary = summarize(text, questions);
  let aiUsed = false;
  // Lista numerowana → reguły zachowują dokładne brzmienie pytań; model tylko dla prozy.
  const numbered = (text.match(/^\s*\d{1,2}[.)]\s+\S/gm) || []).length >= 2;
  if (llmStatus().enabled && req.body?.useAi !== 'false' && !numbered) {
    try {
      const out = await splitWithLLM(text);
      const qs = cleanModelQuestions(out.questions || [], text);
      if (qs.length) { questions = qs.map((q, i) => ({ no: i + 1, text: q })); aiUsed = true; }
      if (out.summary) summary = out.summary;
    } catch (e) { console.warn('LLM split failed:', e.message); }
  }
  questions = routeQuestions(questions, archiveIndex());
  const received = req.body?.received_at || today();
  const dl = computeDeadline(received);
  res.json({
    text, filename, format, meta, questions, summary, aiUsed,
    classification: classify(text),
    similar: similarCases(text, { limit: 5 }),
    received_at: received, deadline: dl.deadline, deadline_explanation: dl.explanation,
    pii: findPII(text).length,
  });
}));

app.post('/api/wnioski', wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.text) throw httpError(400, 'Brak treści wniosku');
  const received = b.received_at || today();
  const year = +received.slice(0, 4);
  const dl = computeDeadline(received);
  const seq = Math.max(0, ...db.prepare('SELECT number FROM wnioski WHERE year = ?').all(year).map((r) => numberSeq(r.number))) + 1;
  const number = b.number || makeNumber(seq, year);
  const info = db.prepare(`INSERT INTO wnioski (number, year, received_at, request_date, deadline, deadline_explanation, status, initials, summary, requester, requester_contact, delivery, text, filename, hints)
    VALUES (?, ?, ?, ?, ?, ?, 'nowy', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    number, year, received, b.meta?.requestDate || null, dl.deadline, JSON.stringify(dl.explanation),
    b.initials || null, b.summary || null, b.meta?.requester || null, b.meta?.email || null, b.meta?.delivery || null,
    b.text, b.filename || null, JSON.stringify(b.classification?.hints || []),
  );
  const id = Number(info.lastInsertRowid);
  const ins = db.prepare('INSERT INTO pytania (wniosek_id, no, text, departments, suggestions) VALUES (?, ?, ?, ?, ?)');
  (b.questions || []).forEach((q, i) => ins.run(id, i + 1, q.text, JSON.stringify(q.departments || []), JSON.stringify(q.suggestions || [])));
  log(id, 'Wniosek zarejestrowany', `${number}, termin ${dl.deadline}${b.filename ? `, plik: ${b.filename}` : ''}`);
  res.status(201).json(loadCase(id));
}));

// Import / eksport rejestru w formacie arkusza UMB
app.post('/api/wnioski/import', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw httpError(400, 'Wybierz plik XLSX z rejestrem wniosków');
  let records;
  try { records = parseRegistry(req.file.buffer); } catch (e) { throw httpError(422, `Nie udało się odczytać arkusza: ${e.message}`); }
  res.json(importRecords(records, archiveIndex()));
}));

app.get('/api/wnioski/export.xlsx', wrap(async (req, res) => {
  const year = +req.query.year || new Date().getFullYear();
  const items = db.prepare('SELECT * FROM wnioski WHERE year = ? ORDER BY received_at ASC, id ASC').all(year);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="wnioski_udip_${year}.xlsx"` });
  res.send(registryXlsx(items));
}));

// Wezwanie do doprecyzowania wniosku – termin wstrzymany do czasu doprecyzowania.
app.post('/api/wnioski/:id/doprecyzowanie', wrap(async (req, res) => {
  const id = +req.params.id;
  const date = req.body.date || today();
  db.prepare('UPDATE wnioski SET clarification_requested_at = ?, sheet_deadline = deadline WHERE id = ?').run(date, id);
  setStatus(id, 'doprecyzowanie', `wezwanie z dnia ${date}; termin wstrzymany do czasu doprecyzowania`);
  res.json(loadCase(id));
}));

app.post('/api/wnioski/:id/doprecyzowanie/wplynelo', wrap(async (req, res) => {
  const id = +req.params.id;
  const date = req.body.date || today();
  const dl = computeDeadline(date);
  const w = db.prepare('SELECT * FROM wnioski WHERE id = ?').get(id);
  const expl = [...J(w.deadline_explanation, []), `Doprecyzowanie wniosku wpłynęło ${date} – termin liczony od nowa: ${dl.explanation.join(' ')}`];
  db.prepare('UPDATE wnioski SET clarification_received_at = ?, deadline = ?, deadline_explanation = ? WHERE id = ?').run(date, dl.deadline, JSON.stringify(expl), id);
  const hasResponses = db.prepare('SELECT COUNT(*) c FROM odpowiedzi WHERE wniosek_id = ?').get(id).c;
  setStatus(id, hasResponses ? 'w_wydzialach' : 'nowy', `doprecyzowanie wpłynęło ${date}, nowy termin ${dl.deadline}`);
  res.json(loadCase(id));
}));

app.get('/api/wnioski/:id', wrap(async (req, res) => {
  const c = loadCase(+req.params.id);
  res.json({ ...c, similar: similarCases(c.wniosek.text, { excludeWniosekId: c.wniosek.id }), verification: c.draft ? verifyDraft(c.draft, c.responses) : null });
}));

app.patch('/api/wnioski/:id', wrap(async (req, res) => {
  const id = +req.params.id;
  const allowed = ['number', 'initials', 'summary', 'requester', 'requester_contact', 'received_at', 'answered_at', 'response_type'];
  const w = db.prepare('SELECT * FROM wnioski WHERE id = ?').get(id);
  if (!w) throw httpError(404, 'Nie znaleziono wniosku');
  for (const k of allowed) {
    if (k in req.body) db.prepare(`UPDATE wnioski SET ${k} = ? WHERE id = ?`).run(req.body[k] || null, id);
  }
  if (req.body.received_at && req.body.received_at !== w.received_at && w.status !== 'kwerenda') {
    const dl = computeDeadline(req.body.received_at);
    db.prepare('UPDATE wnioski SET deadline = ?, deadline_explanation = ?, year = ? WHERE id = ?').run(dl.deadline, JSON.stringify(dl.explanation), +req.body.received_at.slice(0, 4), id);
  }
  if (req.body.status && STATUSES.includes(req.body.status)) setStatus(id, req.body.status, 'zmiana ręczna');
  res.json(loadCase(id));
}));

app.delete('/api/wnioski/:id', wrap(async (req, res) => {
  db.prepare('DELETE FROM wnioski WHERE id = ?').run(+req.params.id);
  res.status(204).end();
}));

app.put('/api/wnioski/:id/questions', wrap(async (req, res) => {
  const id = +req.params.id;
  const upd = db.prepare('UPDATE pytania SET departments = ?, text = COALESCE(?, text) WHERE id = ? AND wniosek_id = ?');
  for (const q of req.body.questions || []) upd.run(JSON.stringify(q.departments || []), q.text || null, q.id, id);
  log(id, 'Zmieniono przypisanie wydziałów');
  res.json(loadCase(id));
}));

app.get('/api/wnioski/:id/department-request/:code', wrap(async (req, res) => {
  const c = loadCase(+req.params.id);
  res.json({ text: departmentRequestText(c.wniosek, c.questions, req.params.code, c.wniosek.deadline) });
}));

app.post('/api/wnioski/:id/kwerenda', wrap(async (req, res) => {
  const id = +req.params.id;
  const w = db.prepare('SELECT * FROM wnioski WHERE id = ?').get(id);
  if (!w) throw httpError(404, 'Nie znaleziono wniosku');
  const max = maxExtension(w.received_at);
  const until = req.body.until;
  if (!until) throw httpError(400, 'Podaj nowy termin');
  if (until > max) throw httpError(400, `Termin nie może przekroczyć 2 miesięcy od złożenia wniosku (maks. ${max}, art. 13 ust. 2).`);
  db.prepare('UPDATE wnioski SET extension_until = ?, extension_reason = ?, deadline = ? WHERE id = ?').run(until, req.body.reason || null, until, id);
  setStatus(id, 'kwerenda', `nowy termin ${until} (+${diffDays(w.deadline, until)} dni)${req.body.reason ? ` – ${req.body.reason}` : ''}`);
  res.json({ ...loadCase(id), maxExtension: max });
}));

app.post('/api/wnioski/:id/departments-notified', wrap(async (req, res) => {
  const id = +req.params.id;
  const codes = req.body.codes || [];
  log(id, 'Zapytania do wydziałów przygotowane', codes.join(', ') + ' (wysyłka poza systemem)');
  const w = db.prepare('SELECT status FROM wnioski WHERE id = ?').get(id);
  if (w?.status === 'nowy') setStatus(id, 'w_wydzialach');
  res.json(loadCase(id));
}));

app.post('/api/wnioski/:id/responses', upload.single('file'), wrap(async (req, res) => {
  const id = +req.params.id;
  let text = req.body.text, filename = null;
  if (req.file) ({ text, filename } = await extractFromFile(req.file));
  if (!text?.trim()) throw httpError(400, 'Brak treści odpowiedzi');
  if (!req.body.department) throw httpError(400, 'Wskaż wydział');
  db.prepare('INSERT INTO odpowiedzi (wniosek_id, department, filename, text) VALUES (?, ?, ?, ?)').run(id, req.body.department, filename, text);
  log(id, `Wgrano odpowiedź wydziału ${req.body.department}`, filename);
  const w = db.prepare('SELECT status FROM wnioski WHERE id = ?').get(id);
  if (w?.status === 'nowy') setStatus(id, 'w_wydzialach');
  res.json(loadCase(id));
}));

app.delete('/api/wnioski/:id/responses/:rid', wrap(async (req, res) => {
  db.prepare('DELETE FROM odpowiedzi WHERE id = ? AND wniosek_id = ?').run(+req.params.rid, +req.params.id);
  res.json(loadCase(+req.params.id));
}));

app.post('/api/wnioski/:id/draft', wrap(async (req, res) => {
  const id = +req.params.id;
  const c = loadCase(id);
  const type = req.body.type || 'udostepnienie';
  const draft = buildDraft(c, { type, extension: req.body.extension || c.wniosek.extension_until, bipLink: req.body.bipLink, reason: req.body.reason || c.wniosek.extension_reason });
  const entities = detectDraftEntities(draft, c.entities);
  saveDraft(id, draft, entities);
  db.prepare('UPDATE wnioski SET response_type = ? WHERE id = ?').run(type, id);
  log(id, `Wygenerowano projekt: ${RESPONSE_TYPES[type].label}`, draft.missing.length ? `brak odpowiedzi na pytania: ${draft.missing.join(', ')}` : 'komplet odpowiedzi');
  if (!['wyslana', 'kwerenda'].includes(c.wniosek.status) && type === 'udostepnienie' && !draft.missing.length) setStatus(id, 'przygotowana');
  const fresh = loadCase(id);
  res.json({ ...fresh, verification: verifyDraft(fresh.draft, fresh.responses) });
}));

app.put('/api/wnioski/:id/draft', wrap(async (req, res) => {
  const id = +req.params.id;
  const c = loadCase(id);
  if (!c.draft) throw httpError(400, 'Brak projektu');
  const byId = new Map((req.body.blocks || []).map((b) => [b.id, b.text]));
  const draft = { ...c.draft, blocks: c.draft.blocks.map((b) => (byId.has(b.id) ? { ...b, text: byId.get(b.id), edited: b.text !== byId.get(b.id) || b.edited } : b)) };
  const entities = detectDraftEntities(draft, c.entities);
  saveDraft(id, draft, entities);
  log(id, 'Edycja projektu odpowiedzi');
  const fresh = loadCase(id);
  res.json({ ...fresh, verification: verifyDraft(fresh.draft, fresh.responses) });
}));

app.post('/api/wnioski/:id/draft/polish', wrap(async (req, res) => {
  const id = +req.params.id;
  const c = loadCase(id);
  if (!llmStatus().enabled) throw httpError(400, 'Model językowy nie jest skonfigurowany (tryb offline na regułach).');
  const block = c.draft?.blocks.find((b) => b.id === req.body.blockId);
  if (!block) throw httpError(404, 'Brak akapitu');
  const polished = (await polishParagraph(block.text)).trim();
  const test = { blocks: [{ ...block, text: polished }] };
  const v = verifyDraft(test, c.responses);
  res.json({ original: block.text, polished, issues: v.issues });
}));

app.put('/api/wnioski/:id/entities', wrap(async (req, res) => {
  const id = +req.params.id;
  const c = loadCase(id);
  if (!c.draft) throw httpError(400, 'Brak projektu');
  const text = draftToText(c.draft);
  let entities = req.body.entities || [];
  entities = entities.filter((e) => e.start >= 0 && e.end <= text.length && e.end > e.start).map((e) => ({ ...e, text: text.slice(e.start, e.end) }));
  saveDraft(id, c.draft, entities);
  const acc = entities.filter((e) => e.status === 'accepted').length;
  log(id, 'Anonimizacja zaktualizowana', `${acc} zaczernionych fragmentów`);
  res.json(loadCase(id));
}));

app.post('/api/wnioski/:id/entities/ai', wrap(async (req, res) => {
  const id = +req.params.id;
  const c = loadCase(id);
  if (!llmStatus().enabled) throw httpError(400, 'Model językowy nie jest skonfigurowany.');
  const text = draftToText(c.draft);
  const items = await findPersonalData(text);
  const extra = [];
  for (const it of items) {
    const idx = it.text ? text.indexOf(it.text) : -1;
    if (idx < 0) continue;
    if (c.entities.some((e) => idx < e.end && idx + it.text.length > e.start)) continue;
    extra.push({ start: idx, end: idx + it.text.length, type: it.type || 'AI', label: `AI: ${it.type || 'dane'}`, basis: 'art. 5 ust. 2 u.d.i.p.', confidence: 0.7, note: it.why, status: 'suggested', source: 'ai' });
  }
  const entities = assignLabels(text, mergeOverlaps([...c.entities, ...extra])).map((e, i) => ({ ...e, id: `e${i + 1}` }));
  saveDraft(id, c.draft, entities);
  log(id, 'Druga warstwa anonimizacji (AI)', `${extra.length} nowych propozycji`);
  res.json({ ...loadCase(id), added: extra.length });
}));

app.get('/api/wnioski/:id/export.:fmt', wrap(async (req, res) => {
  const id = +req.params.id;
  const c = loadCase(id);
  if (!c.draft) throw httpError(400, 'Brak projektu odpowiedzi');
  const pending = c.entities.filter((e) => e.status === 'suggested').length;
  const name = `odpowiedz_${c.wniosek.number.replace(/\W+/g, '_')}`;
  log(id, `Eksport ${req.params.fmt.toUpperCase()}`, pending ? `uwaga: ${pending} niezatwierdzonych propozycji anonimizacji` : null);
  if (req.params.fmt === 'docx') {
    const buf = await toDocx(c.draft, c.entities);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${name}.docx"` });
    return res.send(buf);
  }
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.txt"` });
  res.send(toText(c.draft, c.entities));
}));

// Oznaczenie jako wysłane + zasilenie archiwum (narzędzie „uczy się” na zatwierdzonych odpowiedziach).
app.post('/api/wnioski/:id/sent', wrap(async (req, res) => {
  const id = +req.params.id;
  const c = loadCase(id);
  const date = req.body.date || today();
  db.prepare('UPDATE wnioski SET answered_at = ? WHERE id = ?').run(date, id);
  setStatus(id, 'wyslana', `data wysyłki ${date} (wysyłka poza systemem)`);
  if (c.draft) {
    const depts = [...new Set(c.questions.flatMap((q) => q.departments))];
    const answer = toText(c.draft, c.entities.map((e) => (e.status === 'suggested' ? { ...e, status: 'accepted' } : e)));
    db.prepare('DELETE FROM dokumenty WHERE source_wniosek_id = ?').run(id);
    db.prepare(`INSERT INTO dokumenty (kind, title, number, date, departments, question, answer, text, source_wniosek_id) VALUES ('archiwum', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(c.wniosek.summary || `Wniosek ${c.wniosek.number}`, c.wniosek.number, date, JSON.stringify(depts), c.questions.map((q) => `${q.no}. ${q.text}`).join('\n'), answer, answer, id);
    invalidate();
    log(id, 'Odpowiedź dodana do archiwum wiedzy');
  }
  res.json(loadCase(id));
}));

// ---------- Anonimizator (dowolny plik) ----------
app.post('/api/anonymize', upload.single('file'), wrap(async (req, res) => {
  let text = req.body?.text, filename = null;
  if (req.file) ({ text, filename } = await extractFromFile(req.file));
  if (!text?.trim()) throw httpError(400, 'Brak tekstu');
  res.json({ text, filename, entities: findPII(text).map((e) => ({ ...e, status: 'suggested' })) });
}));

app.post('/api/anonymize/export.:fmt', wrap(async (req, res) => {
  const { text, entities } = req.body;
  const draft = { blocks: [{ id: 'b1', kind: 'body', text }] };
  const name = 'dokument_zanonimizowany';
  if (req.params.fmt === 'docx') {
    const buf = await toDocx(draft, entities);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${name}.docx"` });
    return res.send(buf);
  }
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.txt"` });
  res.send(toText(draft, entities));
}));

// ---------- Baza wiedzy ----------
app.get('/api/knowledge', (req, res) => {
  const rows = db.prepare('SELECT id, kind, title, number, date, departments, filename, source_wniosek_id, length(text) AS size, created_at FROM dokumenty ORDER BY kind, date DESC, id DESC').all();
  res.json(rows.map((r) => ({ ...r, departments: J(r.departments, []) })));
});

app.get('/api/knowledge/search', (req, res) => {
  const q = String(req.query.q || '');
  res.json({
    archive: similarCases(q, { limit: 5 }),
    law: knowledgeIndex().search(q, { limit: 5 }).map((r) => ({ title: r.doc.title, kind: r.doc.kind, excerpt: truncate(r.doc.text, 500), relevance: r.relevance })),
  });
});

app.get('/api/knowledge/:id', wrap(async (req, res) => {
  const d = db.prepare('SELECT * FROM dokumenty WHERE id = ?').get(+req.params.id);
  if (!d) throw httpError(404, 'Brak dokumentu');
  res.json({ ...d, departments: J(d.departments, []) });
}));

app.post('/api/knowledge', upload.single('file'), wrap(async (req, res) => {
  const b = req.body;
  let text = b.text, filename = null;
  if (req.file) ({ text, filename } = await extractFromFile(req.file));
  if (!text?.trim()) throw httpError(400, 'Brak treści dokumentu');
  const kind = ['archiwum', 'ustawa', 'zarzadzenie', 'inne'].includes(b.kind) ? b.kind : 'inne';
  const departmentsList = b.departments ? String(b.departments).split(/[,;\s]+/).filter(Boolean) : [];
  const title = b.title || filename || truncate(text, 60);
  let question = b.question || null, answer = b.answer || null;
  if (kind === 'archiwum' && !question) {
    // plik archiwalny: spróbuj rozdzielić wniosek / odpowiedź
    const m = text.split(/\n\s*(?:ODPOWIEDŹ|Odpowiedź)\s*:?\s*\n/);
    question = m.length > 1 ? m[0] : text;
    answer = m.length > 1 ? m.slice(1).join('\n') : text;
  }
  const info = db.prepare('INSERT INTO dokumenty (kind, title, number, date, departments, question, answer, text, filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(kind, title, b.number || null, b.date || today(), JSON.stringify(departmentsList), question, answer, text, filename);
  invalidate();
  res.status(201).json({ id: Number(info.lastInsertRowid) });
}));

// Import hurtowy archiwum: JSON [{number,date,title,departments,question,answer}]
app.post('/api/knowledge/import', upload.single('file'), wrap(async (req, res) => {
  const raw = req.file ? req.file.buffer.toString('utf8') : JSON.stringify(req.body.items || []);
  let items;
  try { items = JSON.parse(raw); } catch { throw httpError(400, 'Niepoprawny JSON'); }
  if (!Array.isArray(items)) throw httpError(400, 'Oczekiwano tablicy rekordów');
  const ins = db.prepare("INSERT INTO dokumenty (kind, title, number, date, departments, question, answer, text) VALUES ('archiwum', ?, ?, ?, ?, ?, ?, ?)");
  let n = 0;
  for (const it of items) {
    if (!it.question && !it.answer) continue;
    ins.run(it.title || truncate(it.question, 80), it.number || null, it.date || null, JSON.stringify(it.departments || []), it.question || '', it.answer || '', `${it.question || ''}\n${it.answer || ''}`);
    n++;
  }
  invalidate();
  res.json({ imported: n });
}));

app.delete('/api/knowledge/:id', wrap(async (req, res) => {
  db.prepare('DELETE FROM dokumenty WHERE id = ?').run(+req.params.id);
  invalidate();
  res.status(204).end();
}));

// ---------- Połączenie z modelem AI ----------
const OLLAMA = () => (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

function aiView() {
  const s = readSettings();
  const c = activeConfig();
  return {
    status: llmStatus(),
    settings: c ? { provider: c.provider, model: c.model, baseUrl: c.baseUrl, hasKey: !!c.apiKey && c.apiKey !== 'ollama', key: maskKey(c.apiKey === 'ollama' ? '' : c.apiKey), fromEnv: !!c.fromEnv, cloudAccepted: !!s?.cloudAccepted } : null,
    providers: PROVIDERS,
  };
}

function configFromBody(b) {
  const p = PROVIDERS[b?.provider];
  if (!p) throw httpError(400, 'Nieznany dostawca AI');
  const prev = activeConfig();
  // Pusty klucz = zostaw zapisany (pole w formularzu pokazuje tylko maskę).
  const apiKey = (b.apiKey || '').trim() || (prev?.provider === b.provider ? prev.apiKey : '');
  const baseUrl = ((b.baseUrl || '').trim() || p.baseUrl).replace(/\/$/, '');
  const model = (b.model || '').trim() || p.model;
  if (p.needsKey && !apiKey) throw httpError(400, 'Podaj klucz API');
  if (!model) throw httpError(400, 'Podaj nazwę modelu');
  if (b.provider !== 'anthropic' && !/^https?:\/\//.test(baseUrl)) throw httpError(400, 'Podaj adres serwera (http://…)');
  const local = b.provider === 'anthropic' ? false : (p.local ?? isLocalUrl(baseUrl));
  return { provider: b.provider, baseUrl, model, apiKey, local };
}

app.get('/api/ai', (req, res) => res.json(aiView()));

app.post('/api/ai/test', wrap(async (req, res) => {
  const c = configFromBody(req.body);
  try { res.json(await testConnection(c)); } catch (e) { res.json({ ok: false, error: e.message }); }
}));

app.put('/api/ai', wrap(async (req, res) => {
  const c = configFromBody(req.body);
  if (!c.local && req.body.cloudAccepted !== true) throw httpError(400, 'Model w chmurze wymaga potwierdzenia, że dane opuszczą Urząd.');
  writeSettings({ provider: c.provider, model: c.model, baseUrl: c.baseUrl, apiKey: c.apiKey, cloudAccepted: !c.local, savedAt: new Date().toISOString() });
  console.log(`Połączono model AI: ${PROVIDERS[c.provider].label} / ${c.model}${c.local ? '' : ' (CHMURA)'}`);
  res.json(aiView());
}));

app.delete('/api/ai', (req, res) => {
  clearSettings();
  console.log('Odłączono model AI – tryb offline na regułach');
  res.json(aiView());
});

app.get('/api/ai/ollama', wrap(async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA()}/api/tags`, { signal: AbortSignal.timeout(2500) });
    const data = await r.json();
    res.json({ running: true, models: (data.models || []).map((m) => ({ name: m.name, size: m.size })), pull: pullJob });
  } catch {
    res.json({ running: false, models: [], pull: pullJob });
  }
}));

// Lista modeli z dowolnego serwera zgodnego z OpenAI (GET {baseUrl}/models); dla Ollamy także /api/tags.
async function listModels(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, '');
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  try {
    const r = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      const d = await r.json();
      const ids = (d.data || d.models || []).map((m) => m.id || m.name).filter(Boolean);
      return { ok: true, models: [...new Set(ids)] };
    }
  } catch { /* spróbuj API Ollamy */ }
  try {
    const r = await fetch(`${base.replace(/\/v1$/, '')}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) return { ok: true, models: ((await r.json()).models || []).map((m) => m.name) };
  } catch { /* brak serwera */ }
  return { ok: false, models: [] };
}

// Automatyczne wykrywanie lokalnych serwerów AI na typowych portach (tylko 127.0.0.1).
app.get('/api/ai/local', wrap(async (req, res) => {
  const found = await Promise.all(LOCAL_SERVERS.map(async (s) => ({ ...s, ...(await listModels(s.baseUrl)) })));
  res.json({ servers: found.filter((s) => s.ok) });
}));

// Modele z serwera o podanym adresie (pole „Adres serwera”).
app.post('/api/ai/models', wrap(async (req, res) => {
  const baseUrl = String(req.body?.baseUrl || '').trim();
  if (!/^https?:\/\//.test(baseUrl)) throw httpError(400, 'Podaj adres serwera (http://…)');
  const r = await listModels(baseUrl, String(req.body?.apiKey || ''));
  res.json({ ...r, local: isLocalUrl(baseUrl) });
}));

let pullJob = null;
app.post('/api/ai/ollama/pull', wrap(async (req, res) => {
  const model = req.body?.model || PROVIDERS.ollama.model;
  if (pullJob?.state === 'running') return res.json(pullJob);
  pullJob = { model, state: 'running', status: 'start', completed: 0, total: 0 };
  res.json(pullJob);
  try {
    const r = await fetch(`${OLLAMA()}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }) });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.error) throw new Error(ev.error);
        pullJob.status = ev.status || pullJob.status;
        if (ev.total) { pullJob.total = ev.total; pullJob.completed = ev.completed || 0; }
      }
    }
    pullJob.state = 'done';
  } catch (e) {
    pullJob.state = 'error';
    pullJob.error = e.cause?.code === 'ECONNREFUSED' ? 'Ollama nie jest uruchomiona' : e.message;
  }
}));

// ---------- Dane demonstracyjne ----------
app.post('/api/demo/reset', wrap(async (req, res) => {
  const r = seedDemo();
  invalidate();
  res.json(r);
}));

// ---------- Frontend (build) ----------
const dist = fileURLToPath(new URL('../client/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(`${dist}/index.html`));
}

app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Błąd serwera: ' + err.message : err.message });
});

const port = +process.env.PORT || 3000;
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  const s = llmStatus();
  console.log(`UDIPilot API: http://${host}:${port}  |  LLM: ${s.enabled ? `${s.model} @ ${s.baseUrl}` : 'wyłączony (tryb offline na regułach)'}`);
});
