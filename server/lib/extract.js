// Wyciąganie tekstu z plików: PDF (warstwa tekstowa), DOCX, TXT. Pliki przetwarzane wyłącznie w pamięci.
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

const MAX = 20 * 1024 * 1024;

export async function extractFromFile(file) {
  if (!file) throw httpError(400, 'Brak pliku');
  if (file.size > MAX) throw httpError(413, 'Plik jest za duży (maks. 20 MB)');
  const name = file.originalname || 'plik';
  const ext = name.toLowerCase().split('.').pop();
  const buf = file.buffer;

  if (ext === 'pdf' || buf.slice(0, 4).toString() === '%PDF') {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    const joined = (Array.isArray(text) ? text : [text]).join('\n\n');
    const clean = tidy(joined);
    if (clean.replace(/\s/g, '').length < 20) {
      throw httpError(422, 'PDF nie zawiera warstwy tekstowej (skan). W wersji wdrożeniowej plik trafi do lokalnego OCR (Tesseract, język polski). Teraz: wklej treść wniosku w polu tekstowym obok albo wgraj PDF z tekstem lub DOCX.');
    }
    return { text: clean, filename: name, pages: totalPages, format: 'pdf' };
  }
  if (ext === 'docx' || buf.slice(0, 2).toString() === 'PK') {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: tidy(value), filename: name, format: 'docx' };
  }
  if (ext === 'doc') {
    throw httpError(415, 'Stary format .doc – zapisz plik jako .docx lub PDF (konwersja przez LibreOffice w wersji wdrożeniowej).');
  }
  if (['txt', 'md', 'eml'].includes(ext)) {
    return { text: tidy(buf.toString('utf8')), filename: name, format: 'txt' };
  }
  throw httpError(415, `Nieobsługiwany format pliku: .${ext}. Obsługiwane: PDF, DOCX, TXT.`);
}

function tidy(s) {
  return String(s)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
