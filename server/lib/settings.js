// Ustawienia połączenia z modelem AI – zapisywane lokalnie w data/settings.json (nie trafia do repozytorium).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../../data/settings.json', import.meta.url));

export const PROVIDERS = {
  ollama: { label: 'Bielik lokalnie (Ollama)', local: null, baseUrl: 'http://127.0.0.1:11434/v1', model: 'SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0', needsKey: false },
  local: { label: 'Inny model lokalny', local: null, baseUrl: '', model: '', needsKey: false },
  anthropic: { label: 'Claude (Anthropic)', local: false, baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5', needsKey: true },
  openai: { label: 'GPT (OpenAI)', local: false, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true },
  gemini: { label: 'Gemini (Google)', local: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true },
  custom: { label: 'Własny serwer (zgodny z OpenAI)', local: null, baseUrl: '', model: '', needsKey: false },
};

// „Lokalny” = ten komputer albo sieć wewnętrzna Urzędu (adresy prywatne, nazwy bez domeny publicznej).
export function isLocalUrl(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === 'host.docker.internal') return true;
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) return true;
  if (!host.includes('.') && !host.includes(':')) return true; // np. usługa Docker „ollama”
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  }
  return /^f[cd][0-9a-f]{2}:/.test(host); // IPv6 ULA
}

// Znane lokalne serwery zgodne z OpenAI (domyślne porty) – do automatycznego wykrywania.
export const LOCAL_SERVERS = [
  { name: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
  { name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' },
  { name: 'llama.cpp / LocalAI', baseUrl: 'http://127.0.0.1:8080/v1' },
  { name: 'vLLM', baseUrl: 'http://127.0.0.1:8000/v1' },
  { name: 'Jan', baseUrl: 'http://127.0.0.1:1337/v1' },
  { name: 'text-generation-webui', baseUrl: 'http://127.0.0.1:5000/v1' },
  { name: 'KoboldCpp', baseUrl: 'http://127.0.0.1:5001/v1' },
  { name: 'GPT4All', baseUrl: 'http://127.0.0.1:4891/v1' },
  { name: 'LiteLLM', baseUrl: 'http://127.0.0.1:4000/v1' },
];

export function readSettings() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}

export function writeSettings(s) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
}

export function clearSettings() {
  writeSettings({ provider: null });
}

// Aktywna konfiguracja: najpierw ustawienia z interfejsu, potem zmienne z .env.
export function activeConfig() {
  const s = readSettings();
  if (s && 'provider' in s) {
    if (!s.provider) return null;
    const p = PROVIDERS[s.provider];
    if (!p) return null;
    const baseUrl = (s.baseUrl || p.baseUrl || '').replace(/\/$/, '');
    const model = s.model || p.model;
    if (!model || (!baseUrl && s.provider !== 'anthropic')) return null;
    return { provider: s.provider, baseUrl, model, apiKey: s.apiKey || '', local: s.provider === 'anthropic' ? false : (p.local ?? isLocalUrl(baseUrl)) };  }
  const baseUrl = (process.env.LLM_BASE_URL || '').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || '';
  if (!baseUrl || !model) return null;
  const local = isLocalUrl(baseUrl);
  return { provider: local ? 'ollama' : 'custom', baseUrl, model, apiKey: process.env.LLM_API_KEY || 'ollama', local, fromEnv: true };
}

export function maskKey(k) {
  if (!k) return '';
  return k.length <= 8 ? '••••' : `${k.slice(0, 4)}••••${k.slice(-4)}`;
}
