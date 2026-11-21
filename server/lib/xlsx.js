// Minimalny odczyt/zapis XLSX (bez ciężkich zależności): rejestr wniosków w formacie
// arkusza UMB „WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ”.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const XML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => XML_ESC[c]);
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Data Excela (liczba dni od 1899-12-30) ↔ 'YYYY-MM-DD'
export const excelToIso = (n) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
export const isoToExcel = (s) => Math.round(Date.parse(s + 'T00:00:00Z') / 86400000) + 25569;

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Zwraca wiersze pierwszego arkusza jako tablice wartości (liczby jako number, teksty jako string).
export function readSheet(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const shared = [];
  if (files['xl/sharedStrings.xml']) {
    const xml = strFromU8(files['xl/sharedStrings.xml']);
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push(unesc((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
    }
  }
  const sheetName = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error('Brak arkusza w pliku XLSX');
  const xml = strFromU8(files[sheetName]);
  const rows = [];
  for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) || []) {
    const out = [];
    for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = c.match(/r="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = c.match(/ t="([^"]+)"/)?.[1];
      let v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (type === 's') v = shared[+v];
      else if (type === 'inlineStr') v = unesc((c.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]) || '');
      else if (type === 'str') v = v != null ? unesc(v) : '';
      else if (v != null && v !== '') v = +v;
      out[colIndex(ref)] = v ?? '';
    }
    rows.push(out);
  }
  return rows;
}

// Zapis prostego arkusza: rows = tablica tablic; dateCols = indeksy kolumn z datami ISO.
export function writeSheet({ title, header, rows, dateCols = [], widths = [] }) {
  const cell = (ref, v, style) => {
    if (v === null || v === undefined || v === '') return `<c r="${ref}"${style ? ` s="${style}"` : ''}/>`;
    if (typeof v === 'number') return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  const col = (i) => String.fromCharCode(65 + i);
  const lines = [];
  lines.push(`<row r="1">${cell('A1', title, 1)}</row>`);
  lines.push(`<row r="2">${header.map((h, i) => cell(col(i) + 2, h, 1)).join('')}</row>`);
  rows.forEach((r, ri) => {
    const n = ri + 3;
    lines.push(`<row r="${n}">${r.map((v, i) => {
      if (dateCols.includes(i) && /^\d{4}-\d{2}-\d{2}$/.test(v || '')) return cell(col(i) + n, isoToExcel(v), 2);
      return cell(col(i) + n, v, 3);
    }).join('')}</row>`);
  });
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${lines.join('')}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>`;
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Wnioski" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/styles.xml': strToU8(styles),
  }));
}
