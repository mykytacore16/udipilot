// Instalator UDIPilot – kreator w przeglądarce. Tylko moduły wbudowane Node.js (działa przed `npm install`).
// Uruchomienie: node installer/installer.js  (robi to INSTALUJ.bat / instaluj.sh)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const UI = fileURLToPath(new URL('./ui.html', import.meta.url));
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const MODEL = 'SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0';
const OLLAMA = 'http://127.0.0.1:11434';
const APP = 'http://localhost:3000';

// Procesy potomne widzą ten sam Node/npm, nawet jeśli PATH nie został jeszcze odświeżony po instalacji Node.
const ENV = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` };

// ---------- stan ----------
const STEPS = [
  ['deps', 'Biblioteki serwera'],
  ['client', 'Biblioteki interfejsu'],
  ['build', 'Budowanie aplikacji'],
  ['data', 'Baza danych i dane demo'],
  ['ollama', 'Ollama – środowisko lokalnego AI'],
  ['model', 'Model Bielik 4.5B (ok. 5 GB)'],
  ['shortcut', 'Skrót na pulpicie'],
];
const state = {
  phase: 'welcome',
  platform: process.platform,
  root: ROOT,
  checks: null,
  options: { ai: true, shortcut: true },
  steps: STEPS.map(([id, label]) => ({ id, label, state: 'pending', detail: '' })),
  log: [],
  error: null,
};
const clients = new Set();
let pushTimer = null;
function push() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const data = `data: ${JSON.stringify(state)}\n\n`;
    for (const c of clients) c.write(data);
  }, 120);
}
function log(line) {
  const l = String(line).replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
  if (!l) return;
  state.log.push(l);
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
  push();
}
const step = (id) => state.steps.find((s) => s.id === id);
function setStep(id, st, detail) {
  const s = step(id);
  s.state = st;
  if (detail !== undefined) s.detail = detail;
  if (st !== 'running') delete s.progress;
  push();
}

// ---------- pomocnicze ----------
function run(cmd, args, { cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    log(`> ${cmd} ${args.join(' ')}`);
    // stdin = ignore: npm nie może czekać na odpowiedź z klawiatury (inaczej instalacja „wisi”).
    const p = spawn(cmd, args, { cwd, env: { ...ENV, CI: '1', npm_config_yes: 'true' }, shell: WIN, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (b) => b.toString().split(/\r?\n|\r/).forEach(log);
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0] || ''} zakończył się kodem ${code}`))));
  });
}
const which = (cmd) => new Promise((resolve) => {
  execFile(WIN ? 'where' : 'which', [cmd], { env: ENV }, (err, out) => resolve(err ? null : out.split(/\r?\n/)[0].trim() || null));
});
async function findOllama() {
  const p = await which('ollama');
  if (p) return p;
  const cands = WIN
    ? [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')]
    : ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama'];
  return cands.find((c) => fs.existsSync(c)) || null;
}
async function ollamaTags() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return (await r.json()).models || [];
  } catch { return null; }
}
const portFree = (port) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
  s.listen(port, '127.0.0.1');
});
async function appRunning() {
  try { return (await fetch(`${APP}/api/status`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gb = (n) => `${(n / 1e9).toFixed(1).replace('.', ',')} GB`;

// Pliki z ZIP-a mają znacznik „z Internetu” (Mark of the Web) – usuwamy go, żeby skróty .bat działały przy Smart App Control.
function unblockFiles() {
  if (!WIN) return;
  for (const f of ['INSTALUJ.bat', 'URUCHOM.bat']) {
    try { fs.unlinkSync(path.join(ROOT, `${f}:Zone.Identifier`)); } catch { /* brak znacznika */ }
  }
}

// ---------- kontrola systemu ----------
async function checks() {
  const [a, b] = process.versions.node.split('.').map(Number);
  let freeGb = null;
  try { const s = fs.statfsSync(ROOT); freeGb = (s.bavail * s.bsize) / 1e9; } catch { /* starsze systemy plików */ }
  const ollamaPath = await findOllama();
  const tags = await ollamaTags();
  const installed = fs.existsSync(path.join(ROOT, 'client', 'dist', 'index.html')) && fs.existsSync(path.join(ROOT, 'node_modules'));
  const running = await appRunning();
  state.checks = {
    node: { ok: a > 22 || (a === 22 && b >= 5), version: process.versions.node },
    os: `${{ win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || process.platform} · ${os.arch()}`,
    ram: Math.round(os.totalmem() / 1e9),
    disk: freeGb == null ? null : Math.round(freeGb),
    port: running ? 'udipilot' : (await portFree(3000)) ? 'free' : 'busy',
    ollama: { installed: !!ollamaPath, running: !!tags, hasModel: !!tags?.some((m) => m.name === MODEL) },
    installed,
  };
  if (state.checks.disk != null && state.checks.disk < 8) state.options.ai = false;
  push();
}

// ---------- instalacja ----------
async function install(opts) {
  state.options = { ...state.options, ...opts };
  state.phase = 'installing';
  state.error = null;
  state.steps.forEach((s) => { s.state = 'pending'; s.detail = ''; });
  push();
  let current = null;
  try {
    current = 'deps';
    setStep('deps', 'running', 'npm install');
    await run('npm', ['install', '--no-audit', '--no-fund']);
    setStep('deps', 'done', '');

    current = 'client';
    setStep('client', 'running', 'npm install (client)');
    await run('npm', ['--prefix', 'client', 'install', '--no-audit', '--no-fund']);
    setStep('client', 'done', '');

    current = 'build';
    setStep('build', 'running', 'vite build');
    await run('npm', ['run', 'build']);
    setStep('build', 'done', '');

    current = 'data';
    setStep('data', 'running', '');
    await run('node', ['server/seed.js', '--if-empty']);
    setStep('data', 'done', state.log.at(-1)?.startsWith('Baza zawiera') ? 'zachowano istniejące dane' : 'wczytano dane demo');

    if (state.options.ai) {
      current = 'ollama';
      await setupOllama();
      current = 'model';
      await pullModel();
    } else {
      setStep('ollama', 'skip', 'pominięto – można podłączyć później przyciskiem „Podłącz AI”');
      setStep('model', 'skip', '');
    }

    current = 'shortcut';
    setStep('shortcut', 'running', '');
    const where = await createLauncher(state.options.shortcut);
    setStep('shortcut', state.options.shortcut ? 'done' : 'skip', where);

    unblockFiles();
    state.phase = 'done';
    push();
  } catch (e) {
    log(`BŁĄD: ${e.message}`);
    if (current) setStep(current, 'error', e.message);
    state.error = hint(current, e);
    state.phase = 'error';
    push();
  }
}

function hint(stepId, e) {
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|network|fetch failed/i.test(e.message + state.log.slice(-20).join('\n')))
    return 'Brak połączenia z Internetem. Sprawdź sieć i kliknij „Spróbuj ponownie”.';
  if (stepId === 'ollama') return `${e.message} Możesz pominąć AI (aplikacja działa bez niego) i podłączyć je później.`;
  if (stepId === 'model') return 'Nie udało się pobrać modelu. Spróbuj ponownie – pobieranie wznowi się od miejsca przerwania.';
  return e.message;
}

async function setupOllama() {
  setStep('ollama', 'running', 'sprawdzanie…');
  let bin = await findOllama();
  if (!bin && !(await ollamaTags())) {
    setStep('ollama', 'running', 'instalowanie…');
    if (WIN) {
      if (!(await which('winget'))) throw new Error('Brak winget – zainstaluj Ollama ręcznie z https://ollama.com/download.');
      await run('winget', ['install', '-e', '--id', 'Ollama.Ollama', '--silent', '--accept-source-agreements', '--accept-package-agreements']);
    } else if (MAC && (await which('brew'))) {
      await run('brew', ['install', 'ollama']);
    } else {
      throw new Error('Zainstaluj Ollama poleceniem: curl -fsSL https://ollama.com/install.sh | sh');
    }
    bin = await findOllama();
  }
  if (!(await ollamaTags())) {
    setStep('ollama', 'running', 'uruchamianie…');
    if (!bin) throw new Error('Nie znaleziono programu Ollama po instalacji. Uruchom go ręcznie i spróbuj ponownie.');
    spawn(bin, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true, env: ENV }).unref();
    for (let i = 0; i < 30 && !(await ollamaTags()); i++) await sleep(1000);
    if (!(await ollamaTags())) throw new Error('Ollama nie odpowiada na porcie 11434.');
  }
  setStep('ollama', 'done', 'działa lokalnie');
}

async function pullModel() {
  const tags = await ollamaTags();
  if (tags?.some((m) => m.name === MODEL)) {
    setStep('model', 'done', 'już pobrany');
  } else {
    setStep('model', 'running', 'łączenie…');
    const r = await fetch(`${OLLAMA}/api/pull`, { method: 'POST', body: JSON.stringify({ model: MODEL, stream: true }) });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const dec = new TextDecoder();
    let buf = '';
    const s = step('model');
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.error) throw new Error(ev.error);
        if (ev.total && ev.total > 1e8) {
          s.progress = ev.completed ? ev.completed / ev.total : 0;
          s.detail = `${gb(ev.completed || 0)} z ${gb(ev.total)}`;
        } else if (ev.status && !ev.total) {
          s.detail = { 'pulling manifest': 'pobieranie listy plików…', 'verifying sha256 digest': 'weryfikacja…', 'writing manifest': 'zapisywanie…', success: 'gotowe' }[ev.status] || s.detail;
        }
        push();
      }
    }
    setStep('model', 'done', 'pobrany');
  }
  // Połącz aplikację z Bielikiem (jeśli użytkownik nie wybrał wcześniej innego modelu).
  const f = path.join(ROOT, 'data', 'settings.json');
  let cur = null;
  try { cur = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* brak pliku */ }
  if (!cur?.provider) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ provider: 'ollama', model: MODEL, baseUrl: `${OLLAMA}/v1`, apiKey: '', cloudAccepted: false, savedAt: new Date().toISOString() }, null, 2));
  }
}

// Plik startowy tworzony lokalnie (bez znacznika „z Internetu”) + skrót na pulpicie.
async function createLauncher(withShortcut) {
  if (WIN) {
    const cmd = path.join(ROOT, 'UDIPilot.cmd');
    fs.writeFileSync(cmd, [
      '@echo off',
      'chcp 65001 >nul',
      'title UDIPilot - serwer (zamknij to okno, aby zatrzymac)',
      `cd /d "${ROOT}"`,
      'node -e "fetch(\'http://127.0.0.1:3000/api/status\').then(()=>process.exit(0),()=>process.exit(1))" >nul 2>nul',
      'if not errorlevel 1 (',
      '  if not "%~1"=="nobrowser" start "" http://localhost:3000',
      '  exit /b 0',
      ')',
      'where ollama >nul 2>nul && (tasklist /fi "imagename eq ollama.exe" | find /i "ollama.exe" >nul || start "" /min ollama serve)',
      'echo.',
      'echo  UDIPilot dziala: http://localhost:3000',
      'echo  Nie zamykaj tego okna, dopoki pracujesz w aplikacji.',
      'echo.',
      'if not "%~1"=="nobrowser" start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"',
      'node server\\index.js',
      'pause',
      '',
    ].join('\r\n'));
    if (!withShortcut) return '';
    const ps = `$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut("$d\\UDIPilot.lnk"); $s.TargetPath='${cmd.replace(/'/g, "''")}'; $s.WorkingDirectory='${ROOT.replace(/'/g, "''")}'; $s.IconLocation="$env:SystemRoot\\System32\\shell32.dll,13"; $s.Description='UDIPilot – asystent urzędnika'; $s.Save(); $d`;
    try {
      const out = await new Promise((res, rej) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, (e, o) => (e ? rej(e) : res(o.trim()))));
      return `„UDIPilot” na pulpicie`;
    } catch {
      // Gdy PowerShell jest ograniczony – kopia pliku startowego na pulpicie.
      const desk = path.join(os.homedir(), 'Desktop');
      fs.copyFileSync(cmd, path.join(desk, 'UDIPilot.cmd'));
      return '„UDIPilot.cmd” na pulpicie';
    }
  }
  if (!withShortcut) return '';
  const desk = path.join(os.homedir(), 'Desktop');
  fs.mkdirSync(desk, { recursive: true });
  if (MAC) {
    const f = path.join(desk, 'UDIPilot.command');
    fs.writeFileSync(f, `#!/bin/bash\ncd "${ROOT}" && ./uruchom.sh\n`, { mode: 0o755 });
    return '„UDIPilot.command” na pulpicie';
  }
  const f = path.join(desk, 'udipilot.desktop');
  fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=UDIPilot\nExec=bash -c 'cd "${ROOT}" && ./uruchom.sh'\nTerminal=true\nIcon=applications-office\n`, { mode: 0o755 });
  return '„UDIPilot” na pulpicie';
}

async function launch() {
  if (await appRunning()) return;
  if (WIN) {
    spawn(`start "UDIPilot" "${path.join(ROOT, 'UDIPilot.cmd')}" nobrowser`, { shell: true, cwd: ROOT, detached: true, stdio: 'ignore', env: ENV }).unref();
  } else {
    spawn(path.join(ROOT, 'uruchom.sh'), [], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...ENV, UDIP_NO_BROWSER: '1' } }).unref();
  }
}

function openBrowser(url) {
  if (process.env.UDIP_NO_OPEN) return;
  if (WIN) spawn(`start "" "${url}"`, { shell: true, detached: true, stdio: 'ignore' }).unref();
  else spawn(MAC ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

// ---------- serwer kreatora ----------
const body = (req) => new Promise((resolve) => {
  let d = '';
  req.on('data', (c) => { d += c; });
  req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(fs.readFileSync(UI));
  }
  if (req.url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.method === 'POST' && req.url === '/install') {
    if (state.phase === 'installing') return json({ ok: false });
    install(await body(req));
    return json({ ok: true });
  }
  if (req.method === 'POST' && req.url === '/launch') {
    await launch();
    for (let i = 0; i < 40 && !(await appRunning()); i++) await sleep(500);
    json({ ok: await appRunning(), url: APP });
    setTimeout(() => process.exit(0), 3000);
    return;
  }
  if (req.method === 'POST' && req.url === '/quit') {
    json({ ok: true });
    setTimeout(() => process.exit(0), 300);
    return;
  }
  res.writeHead(404).end();
});

const PORT = +process.env.INSTALLER_PORT || 3010;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { server.listen(0, '127.0.0.1'); return; }
  throw e;
});
server.listen(PORT, '127.0.0.1', () => {});
server.on('listening', async () => {
  const url = `http://localhost:${server.address().port}`;
  console.log(`\n  Kreator instalacji UDIPilot: ${url}\n  (to okno można zminimalizować – zamknie się samo po instalacji)\n`);
  await checks();
  openBrowser(url);
});
