// Generuje przykładowe pliki do testów (fikcyjne dane): wnioski PDF/DOCX, odpowiedzi wydziałów, dokument z danymi osobowymi.
import { writeFileSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';

const out = new URL('../samples/', import.meta.url);
mkdirSync(out, { recursive: true });

const FONT = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/Library/Fonts/Arial.ttf'].find(existsSync);

async function docx(name, text) {
  const doc = new Document({ sections: [{ children: text.split('\n').map((l) => new Paragraph({ children: [new TextRun({ text: l, font: 'Calibri', size: 22 })] })) }] });
  writeFileSync(new URL(name, out), await Packer.toBuffer(doc));
}

function pdf(name, text) {
  return new Promise((res) => {
    const d = new PDFDocument({ size: 'A4', margin: 60 });
    const s = createWriteStream(new URL(name, out));
    d.pipe(s);
    if (FONT) d.font(FONT);
    d.fontSize(11).text(text, { lineGap: 4 });
    d.end();
    s.on('finish', res);
  });
}

const WNIOSEK_PLAC = `Bydgoszcz, 18 listopada 2026 r.

Wnioskodawca: Aleksandra Nowak
ul. Toruńska 47/5, 85-023 Bydgoszcz
tel. 604 112 233
e-mail: a.nowak@example.com

Prezydent Miasta Bydgoszczy

WNIOSEK O UDOSTĘPNIENIE INFORMACJI PUBLICZNEJ

Na podstawie art. 2 ust. 1 ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej wnoszę o udostępnienie następujących informacji:
1. Ile placów zabaw zarządza obecnie Miasto Bydgoszcz?
2. Kiedy przeprowadzono ostatni przegląd techniczny placu zabaw przy ul. Gdańskiej?
3. Jakie remonty placów zabaw zaplanowano na 2027 r. i jaki jest ich szacunkowy koszt?
4. Ile kamer monitoringu miejskiego obejmuje place zabaw?

Informację proszę przesłać w formie elektronicznej na adres e-mail: a.nowak@example.com.

Z poważaniem
Aleksandra Nowak`;

const WNIOSEK_DRZEWA = `Bydgoszcz, 19.11.2026

Wnioskodawca: Stowarzyszenie „Zielona Bydgoszcz”
e-mail: kontakt@zielona-bydgoszcz.example.org

Dotyczy: wycinka drzew przy ul. Fordońskiej

Proszę o udostępnienie informacji publicznej:
1. Ile drzew usunięto w 2026 r. w pasie drogowym ul. Fordońskiej?
2. Na jakiej podstawie wydano zgodę na wycinkę?
3. Czy przewidziano nasadzenia zastępcze i w jakim terminie?

Odpowiedź proszę przesłać na adres e-mail.`;

const ODP_WGK = `Wydział Zieleni i Gospodarki Komunalnej

W odpowiedzi na prośbę koordynatora UDIP uprzejmie informuję:
Ad 1. Miasto Bydgoszcz zarządza obecnie 151 placami zabaw.
Ad 2. Ostatni przegląd techniczny placu zabaw przy ul. Gdańskiej przeprowadzono 14 maja 2026 r. Przegląd wykonała firma inspektora Mariusza Kowalewskiego (tel. 501 222 333).
Ad 3. Na 2027 r. zaplanowano remont 9 placów zabaw o szacunkowym koszcie 1 450 000 zł brutto.

Sporządził: Jan Wiśniewski, tel. 52 585 80 00
Z poważaniem
Naczelnik Wydziału`;

const ODP_BCB = `Biuro Cyfryzacji i Bezpieczeństwa Informacji
Ad 4. Monitoringiem miejskim objętych jest 37 placów zabaw; łącznie obserwuje je 52 kamery.`;

const DANE = `PROTOKÓŁ ZE SPOTKANIA – ROZBUDOWA PARKU LEŚNEGO

W spotkaniu uczestniczyli: Naczelnik Wydziału Zieleni Piotr Nowak, mieszkańcy: Katarzyna Wiśniewska (PESEL 44051401359), zam. ul. Leśna 12/4, 85-676 Bydgoszcz, tel. 601 234 567,
oraz Tomasz Lewandowski, e-mail t.lewandowski@example.com, legitymujący się dowodem osobistym ABC123456.

Pani Wiśniewska wniosła o zwrot kosztów na rachunek 61 1090 1014 0000 0712 1981 2874. Wykonawca prac: firma „Zieleń-Bud” sp. z o.o., NIP 526-104-08-28.
Właściciel działki sąsiedniej (nr KW BY1B/00012345/6), Pan Grzegorz Kaczmarek, ur. 12.03.1971 r., zgłosił zastrzeżenia dot. dojazdu pojazdem o nr rej. CB 12345.`;

await pdf('wniosek_place_zabaw.pdf', WNIOSEK_PLAC);
await docx('wniosek_wycinka_drzew.docx', WNIOSEK_DRZEWA);
await docx('odpowiedz_WGK_place_zabaw.docx', ODP_WGK);
await docx('odpowiedz_BCB_monitoring.docx', ODP_BCB);
await docx('dokument_z_danymi_osobowymi.docx', DANE);
writeFileSync(new URL('wniosek_email.txt', out), `Dzień dobry,\nproszę o informację, ile wyniosły w 2025 r. wydatki Urzędu na ogłoszenia prasowe oraz kampanie w mediach społecznościowych.\nPozdrawiam\nIwona Kamińska\ni.kaminska@example.com`);
console.log('Pliki przykładowe zapisane w', out.pathname, FONT ? `(czcionka: ${FONT})` : '(UWAGA: brak czcionki TTF – polskie znaki w PDF mogą być niepoprawne)');
