async function req(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd ${res.status}`);
  return data;
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b ?? {}),
  put: (u, b) => req('PUT', u, b),
  patch: (u, b) => req('PATCH', u, b),
  del: (u) => req('DELETE', u),
};

export async function download(url, body, fallbackName) {
  const res = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Błąd ${res.status}`);
  }
  const blob = await res.blob();
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const plDate = (s) => (s ? s.slice(0, 10).split('-').reverse().join('.') : '—');

export const STATUS = {
  nowy: { label: 'Brak działań', cls: '' },
  w_wydzialach: { label: 'Zapytania w wydziałach', cls: 'blue' },
  kwerenda: { label: 'Kwerenda', cls: 'violet' },
  przygotowana: { label: 'Odpowiedź przygotowana', cls: 'yellow' },
  wyslana: { label: 'Odpowiedź wysłana', cls: 'green' },
};
export const STATUS_ORDER = ['nowy', 'w_wydzialach', 'kwerenda', 'przygotowana', 'wyslana'];

export const URGENCY_CLS = { overdue: 'red', today: 'orange', tomorrow: 'yellow', soon: 'blue', ok: '', done: 'green' };
