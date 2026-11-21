// Prosta, w pełni lokalna obróbka tekstu po polsku: tokenizacja, stop-słowa, „stemming” przez obcięcie.

const STOP = new Set(`a aby ach acz aczkolwiek aj albo ale ani aż bardziej bardzo bez bo bowiem by byli bym być był była było były będzie będą cali cała cały co cokolwiek coś czy czyli daleko dla dlaczego dlatego do dobrze dokąd dość dużo dwa dwaj dwie dwoje dziś dzisiaj gdy gdyby gdyż gdzie go i ich ile im inna inne inny innych iż ja ją jak jakaś jakby jaki jakichś jakie jakiś jakiż jakkolwiek jako jakoś je jeden jedna jedno jednak jednakże jego jej jemu jest jestem jeszcze jeśli jeżeli już ją każdy kiedy kilka kimś kto ktokolwiek ktoś która które którego której który których którym którzy ku lat lecz lub ma mają mało mam mi mimo między mną mnie mogą moi moim moja moje może możliwe można mój mu musi my na nad nam nami nas nasi nasz nasza nasze naszego naszych natomiast natychmiast nawet nią nic nich nie niech niego niej niemu nigdy nim nimi niż no o obok od około on ona one oni ono oraz oto owszem pan pana pani po pod podczas pomimo ponad ponieważ powinien powinna powinni powinno poza prawie przecież przed przede przedtem przez przy roku również sam sama są się skąd sobie sobą sposób swoje ta tak taka taki takie także tam te tego tej temu ten teraz też to tobą tobie toteż trzeba tu tutaj twoi twoim twoja twoje twym twój ty tych tylko tym u w wam wami was wasz wasza wasze we według wiele wielu więc więcej wszyscy wszystkich wszystkie wszystkim wszystko wtedy wy właśnie z za zapewne zawsze ze zł znowu znów został żaden żadna żadne żadnych że żeby proszę uprzejmie wnoszę informacji informację informacja udostępnienie udostępnić publicznej wniosek wniosku dnia ust art ustawy miasto miasta mieście miastu miejski miejskiej miejskiego bydgoszcz bydgoszczy urząd urzędu urzędzie terenie obecnie łączna łączny`.split(/\s+/));

export function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Lekki „stemmer”: odcięcie typowej końcówki fleksyjnej + obcięcie do 6 znaków (kamery/kamer → kamer, placów/place → plac).
const ENDINGS = ['owie', 'ami', 'ach', 'ego', 'emu', 'ych', 'ymi', 'ów', 'om', 'em', 'ie', 'ej', 'y', 'i', 'a', 'e', 'u', 'ą', 'ę', 'o'];
export function stem(w) {
  for (const e of ENDINGS) {
    if (w.endsWith(e) && w.length - e.length >= 4) { w = w.slice(0, -e.length); break; }
  }
  return w.length > 6 ? w.slice(0, 6) : w;
}

export function tokens(s) {
  return normalize(s)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

const ABBR = /(?:^|\s)(?:ul|al|os|pl|nr|r|pkt|art|ust|tel|np|tj|godz|ok|m\.in|zł|dz|poz|im|św|prof|dr|mgr|inż|sp|zm|ww|tzw|pn|wg)\.$/i;

// Podział na zdania z pominięciem skrótów (ul., nr, art., r. …).
export function sentences(s) {
  const text = String(s || '').replace(/\s+/g, ' ').trim();
  const out = [];
  let start = 0;
  const re = /[.!?](?=\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9„"])/gu;
  let m;
  while ((m = re.exec(text))) {
    const piece = text.slice(start, m.index + 1);
    if (m[0] === '.' && ABBR.test(piece)) continue;
    out.push(piece.trim());
    start = m.index + 1;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

export function truncate(s, n = 140) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// BM25 nad dowolną kolekcją dokumentów {id, text, ...}
export class BM25 {
  constructor(docs, { k1 = 1.4, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs.map((d) => {
      const toks = tokens(d.text);
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      return { ...d, len: toks.length || 1, tf };
    });
    this.N = this.docs.length || 1;
    this.avg = this.docs.reduce((a, d) => a + d.len, 0) / this.N || 1;
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }

  idf(t) {
    const df = this.df.get(t) || 0;
    return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
  }

  search(query, { limit = 5, filter } = {}) {
    const q = [...new Set(tokens(query))];
    const res = [];
    for (const d of this.docs) {
      if (filter && !filter(d)) continue;
      let score = 0;
      const matched = [];
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        score += this.idf(t) * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avg)));
        matched.push(t);
      }
      if (score > 0) res.push({ doc: d, score, matched });
    }
    res.sort((a, b) => b.score - a.score);
    const top = res[0]?.score || 1;
    return res.slice(0, limit).map((r) => ({ ...r, relevance: Math.round((r.score / top) * 100) }));
  }
}

// Podobieństwo dwóch tekstów (pokrycie słów) – do weryfikacji, czy zdanie ma oparcie w źródle.
export function overlap(sentence, source) {
  const a = new Set(tokens(sentence));
  if (!a.size) return 1;
  const b = new Set(tokens(source));
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}
