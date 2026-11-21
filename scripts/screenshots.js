// Zrzuty ekranu do prezentacji: headless Edge/Chrome sterowany przez CDP (bez dodatkowych zależności).
// Użycie: node scripts/screenshots.js [ścieżka_do_przeglądarki]  (serwer musi działać na :3001)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSER = process.argv[2] || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(existsSync);
const BASE = process.env.BASE || 'http://localhost:3001';
const OUT = new URL('../docs/screens/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const port = 9333;
const proc = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${port}`, '--disable-gpu', '--no-first-run', `--user-data-dir=${join(tmpdir(), 'udip-shots')}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch { await sleep(250); }
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true })).result?.result?.value;

await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.5, mobile: false });
const go = async (hash, wait = 900) => { await cdp('Page.navigate', { url: `${BASE}/${hash}` }); await sleep(wait); };
const click = (text) => js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(text)})); if (b) b.click(); return !!b; })()`);
const fill = (selector, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const shot = async (name, { full = false } = {}) => {
  let clip;
  if (full) {
    const h = await js('document.documentElement.scrollHeight');
    clip = { x: 0, y: 0, width: 1440, height: Math.min(h, 2200), scale: 1 };
  }
  const { result } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  writeFileSync(new URL(`${name}.png`, OUT), Buffer.from(result.data, 'base64'));
  console.log('✓', name);
};

await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });
await cdp('Page.enable');

await go('#/'); await shot('01_rejestr');
await go('#/?kalendarz'); await shot('02_kalendarz');

await go('#/nowy');
await fill('textarea', 'Wnioskodawca: Aleksandra Nowak, e-mail: a.nowak@example.com\nWnoszę o udostępnienie informacji publicznej:\n1. Ile placów zabaw zarządza obecnie Miasto Bydgoszcz?\n2. Kiedy przeprowadzono ostatni przegląd techniczny placu zabaw przy ul. Gdańskiej?\n3. Jakie remonty placów zabaw zaplanowano na 2027 r. i jaki jest ich koszt?\n4. Ile kamer monitoringu miejskiego obejmuje place zabaw?');
await click('Analizuj tekst'); await sleep(1500);
await shot('03_nowy_wniosek');

const demoId = await js(`fetch('/api/wnioski').then(r => r.json()).then(d => d.items.find(i => i.filename).id)`);
await go(`#/wnioski/${demoId}`); await shot('04_sprawa_wydzialy');
await click('3. Projekt'); await sleep(500);
await click('Generuj projekt'); await sleep(1200);
await js('window.scrollTo(0, 560)'); await sleep(300);
await shot('05_projekt_pisma');
await js('window.scrollTo(0, 0)');
await click('4. Anonimizacja'); await sleep(800);
await js('window.scrollTo(0, 380)'); await sleep(300);
await shot('06_anonimizacja');
await click('Zaczernij wszystkie'); await sleep(900);
await js('window.scrollTo(0, 380)'); await sleep(300);
await shot('07_po_anonimizacji');

await go('#/anonimizator');
await fill('textarea', 'W spotkaniu uczestniczyli: Naczelnik Wydziału Zieleni Piotr Nowak, mieszkanka Katarzyna Wiśniewska (PESEL 44051401359), zam. ul. Leśna 12/4, 85-676 Bydgoszcz, tel. 601 234 567, oraz Tomasz Lewandowski, e-mail t.lewandowski@example.com, dowód osobisty ABC123456. Zwrot na rachunek 61 1090 1014 0000 0712 1981 2874. Wykonawca: Zieleń-Bud sp. z o.o., NIP 526-104-08-28.');
await click('Wykryj dane'); await sleep(1500);
await shot('08_anonimizator');

await go('#/wiedza'); await shot('09_baza_wiedzy');
await go('#/system'); await shot('10_bezpieczenstwo');

await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });
ws.close();
proc.kill();
process.exit(0);
