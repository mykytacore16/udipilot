// Zapis rekordów z arkusza rejestru UMB do bazy (wspólne dla seeda i importu przez API).
import { db, log } from './db.js';
import { computeDeadline } from './lib/deadlines.js';
import { splitQuestions, routeQuestions, classify } from './lib/analysis.js';
import { NUMBER_RE } from './lib/registry.js';

export function importRecords(records, archiveIndex) {
  let created = 0, updated = 0;
  const findByNumber = db.prepare('SELECT id FROM wnioski WHERE number = ?');
  for (const r of records) {
    if (!r.received) continue;
    const year = +(r.number.match(NUMBER_RE)?.[2] || r.received.slice(0, 4));
    const dl = computeDeadline(r.received);
    const explanation = [...dl.explanation];
    if (r.clarification) explanation.push(`Wezwanie do doprecyzowania: termin pierwotny ${r.clarification.originalDeadline || '—'}, po doprecyzowaniu ${r.clarification.newDeadline || '—'}.`);
    const status = r.answered ? 'wyslana' : 'nowy';
    const text = `Wnioskodawca: ${r.requester || '—'}\nPrzedmiot zapytania: ${r.subject}`;
    const existing = findByNumber.get(r.number);
    const fields = {
      year, received_at: r.received, deadline: r.deadline || dl.deadline, deadline_explanation: JSON.stringify(explanation),
      status, initials: r.responsible, summary: r.subject, requester: r.requester, text, hints: JSON.stringify(classify(r.subject).hints),
      answered_at: r.answered, import_notes: JSON.stringify(r.notes), sheet_deadline: r.clarification?.originalDeadline || r.sheetDeadline || null,
      clarification_received_at: r.clarification?.newDeadline ? null : null,
    };
    if (r.clarification?.newDeadline) {
      // termin po doprecyzowaniu = data doprecyzowania + 14 dni → przybliżona data doprecyzowania
      const d = new Date(Date.parse(r.clarification.newDeadline + 'T00:00:00Z') - 14 * 86400000).toISOString().slice(0, 10);
      fields.clarification_received_at = d;
    }
    let id;
    if (existing) {
      id = existing.id;
      const keys = Object.keys(fields);
      db.prepare(`UPDATE wnioski SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k] ?? null), id);
      updated++;
      log(id, 'Zaktualizowano z arkusza rejestru', r.notes.join(' ') || null);
    } else {
      const keys = ['number', ...Object.keys(fields)];
      const info = db.prepare(`INSERT INTO wnioski (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(r.number, ...Object.values(fields).map((v) => v ?? null));
      id = Number(info.lastInsertRowid);
      const ins = db.prepare('INSERT INTO pytania (wniosek_id, no, text, departments, suggestions) VALUES (?, ?, ?, ?, ?)');
      for (const q of routeQuestions(splitQuestions(r.subject), archiveIndex)) ins.run(id, q.no, q.text, JSON.stringify(q.departments), JSON.stringify(q.suggestions));
      created++;
      log(id, 'Zaimportowano z arkusza rejestru', r.notes.length ? `Uwagi: ${r.notes.join(' ')}` : null);
    }
  }
  return { created, updated, warnings: records.filter((r) => r.notes.length).map((r) => ({ number: r.number, notes: r.notes })) };
}
