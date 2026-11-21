// Kopia logiki z server/lib/deadlines.js (używana do oznaczania świąt w kalendarzu).
// Terminy UDIP: art. 13 u.d.i.p. + art. 57 KPA (przesunięcie z soboty / dnia wolnego).
// Wszystkie daty jako 'YYYY-MM-DD', liczone w UTC, żeby uniknąć problemów ze strefą czasową.

const DAY = 24 * 60 * 60 * 1000;

export function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmt(date) {
  return date.toISOString().slice(0, 10);
}

export function today() {
  const n = new Date();
  return fmt(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

export function addDays(s, n) {
  return fmt(new Date(parseDate(s).getTime() + n * DAY));
}

export function addMonths(s, n) {
  const d = parseDate(s);
  const day = d.getUTCDate();
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return fmt(r);
}

export function diffDays(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / DAY);
}

// Wielkanoc – algorytm Meeusa/Jonesa/Butchera
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return fmt(new Date(Date.UTC(year, month - 1, day)));
}

const cache = new Map();
// Dni ustawowo wolne od pracy w Polsce (ustawa o dniach wolnych od pracy).
export function holidays(year) {
  if (cache.has(year)) return cache.get(year);
  const e = easter(year);
  const list = {
    [`${year}-01-01`]: 'Nowy Rok',
    [`${year}-01-06`]: 'Trzech Króli',
    [e]: 'Wielkanoc',
    [addDays(e, 1)]: 'Poniedziałek Wielkanocny',
    [`${year}-05-01`]: 'Święto Pracy',
    [`${year}-05-03`]: 'Święto Konstytucji 3 Maja',
    [addDays(e, 49)]: 'Zielone Świątki',
    [addDays(e, 60)]: 'Boże Ciało',
    [`${year}-08-15`]: 'Wniebowzięcie NMP',
    [`${year}-11-01`]: 'Wszystkich Świętych',
    [`${year}-11-11`]: 'Narodowe Święto Niepodległości',
    [`${year}-12-25`]: 'Boże Narodzenie (1. dzień)',
    [`${year}-12-26`]: 'Boże Narodzenie (2. dzień)',
  };
  if (year >= 2025) list[`${year}-12-24`] = 'Wigilia Bożego Narodzenia';
  cache.set(year, list);
  return list;
}

export function nonWorkingReason(s) {
  const d = parseDate(s);
  const dow = d.getUTCDay();
  if (dow === 6) return 'sobota';
  if (dow === 0) return 'niedziela';
  return holidays(d.getUTCFullYear())[s] || null;
}

// Jeżeli koniec terminu przypada na dzień wolny lub sobotę – termin upływa następnego dnia roboczego.
export function shiftToWorkingDay(s) {
  const shifts = [];
  let cur = s;
  let reason;
  while ((reason = nonWorkingReason(cur))) {
    shifts.push(`${cur} – ${reason}`);
    cur = addDays(cur, 1);
  }
  return { date: cur, shifts };
}

// Termin podstawowy: 14 dni od dnia doręczenia wniosku (dnia doręczenia nie wlicza się).
export function computeDeadline(received, days = 14) {
  const raw = addDays(received, days);
  const { date, shifts } = shiftToWorkingDay(raw);
  const explanation = [`Data wpływu ${received} + ${days} dni = ${raw} (art. 13 ust. 1 u.d.i.p.).`];
  if (shifts.length) {
    explanation.push(`Przesunięcie na najbliższy dzień roboczy (art. 57 § 4 KPA): ${shifts.join('; ')} → ${date}.`);
  }
  return { deadline: date, explanation };
}

// Przedłużenie (kwerenda): maks. 2 miesiące od dnia złożenia wniosku (art. 13 ust. 2 u.d.i.p.).
export function maxExtension(received) {
  return shiftToWorkingDay(addMonths(received, 2)).date;
}

export function urgency(deadline, status, ref = today()) {
  if (status === 'wyslana') return { level: 'done', daysLeft: null, label: 'Zakończony' };
  const left = diffDays(ref, deadline);
  if (left < 0) return { level: 'overdue', daysLeft: left, label: `Po terminie (${-left} dni)` };
  if (left === 0) return { level: 'today', daysLeft: 0, label: 'Termin dziś' };
  if (left === 1) return { level: 'tomorrow', daysLeft: 1, label: 'Termin jutro' };
  // Dziś dzień wolny (np. weekend): pierwszy i drugi dzień roboczy traktujemy jak „dziś” i „jutro”.
  if (nonWorkingReason(ref)) {
    const first = shiftToWorkingDay(ref).date;
    const second = shiftToWorkingDay(addDays(first, 1)).date;
    if (deadline === first) return { level: 'today', daysLeft: left, label: 'Termin w najbliższy dzień roboczy' };
    if (deadline === second) return { level: 'tomorrow', daysLeft: left, label: 'Termin w 2. dzień roboczy' };
  }
  if (left <= 3) return { level: 'soon', daysLeft: left, label: `Za ${left} dni` };
  return { level: 'ok', daysLeft: left, label: `Za ${left} dni` };
}
