// Pakiet testowy: fikcyjne wnioski UDIP (PDF/DOCX/TXT) na tematy z arkusza kalendarium UMB
// + odpowiedzi wydziałów + dokument z danymi do anonimizacji. Wszystkie osoby i dane są fikcyjne.
import { writeFileSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';

const out = new URL('../samples/pakiet_testowy/', import.meta.url);
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

const FILES = [
  // 1. Bezdomne zwierzęta – WOŚ, odpowiedź z danymi osoby prywatnej
  ['01_wniosek_bezdomne_zwierzeta.pdf', `Bydgoszcz, 16 listopada 2026 r.

Wnioskodawca: Stowarzyszenie Obrony Zwierzątek
reprezentowane przez: Antoni Ptak
e-mail: kontakt@obrona-zwierzatek.example.org

Prezydent Miasta Bydgoszczy

WNIOSEK O UDOSTĘPNIENIE INFORMACJI PUBLICZNEJ

Na podstawie art. 2 ust. 1 ustawy o dostępie do informacji publicznej wnosimy o udostępnienie informacji:
1. Jaka była łączna kwota wydatkowana przez Miasto w 2025 r. na opiekę nad bezdomnymi zwierzętami?
2. Ile psów i kotów odłowiono na terenie miasta w 2025 r.?
3. Z jakim podmiotem zawarto umowę na odławianie bezdomnych zwierząt i na jaki okres?
4. Ile zwierząt przekazano do adopcji ze schroniska w 2025 r.?

Odpowiedź prosimy przesłać na adres e-mail.

Z poważaniem
Antoni Ptak`],
  ['01_odpowiedz_WOS.docx', `Wydział Ochrony Środowiska
Do: AIP – Biuro Komunikacji Społecznej

W odpowiedzi na przekazany zakres wniosku BKS uprzejmie informuję:
Ad 1. W 2025 r. Miasto wydatkowało na opiekę nad bezdomnymi zwierzętami 2 845 000 zł brutto, w tym na utrzymanie schroniska 2 310 000 zł.
Ad 2. W 2025 r. odłowiono 612 psów i 438 kotów.
Ad 3. Umowę na odławianie bezdomnych zwierząt zawarto z firmą Animal-Serwis sp. z o.o. na okres od 1 stycznia 2025 r. do 31 grudnia 2026 r. Opiekę weterynaryjną w ramach umowy sprawuje lekarz weterynarii Marek Wilczyński, tel. 604 555 210.
Ad 4. Ze schroniska przekazano do adopcji 517 zwierząt.

Sporządziła: Joanna Kaczmarczyk
Z poważaniem
Dyrektor Wydziału`],

  // 2. Liczba uczniów – WE, informacja przetworzona (zestawienie)
  ['02_wniosek_uczniowie_cudzoziemcy.docx', `Bydgoszcz, 17.11.2026

Wnioskodawca: Ewa Góra
e-mail: ewa.gora@example.com

Wniosek o udostępnienie informacji publicznej

Proszę o przesłanie edytowalnego zestawienia liczby uczniów oraz uczniów cudzoziemców w poszczególnych szkołach podstawowych w Bydgoszczy – w podziale na szkoły, stan na koniec czerwca 2026 oraz na wrzesień 2026.

Informację proszę przesłać w formie pliku XLSX na adres e-mail.
Ewa Góra`],
  ['02_odpowiedz_WE.docx', `Wydział Edukacji i Sportu
Ad 1. Zestawienie liczby uczniów w podziale na 58 szkół podstawowych prowadzonych przez Miasto nie jest gromadzone w tej postaci – wymaga przygotowania na podstawie danych z Systemu Informacji Oświatowej dla każdej szkoły osobno.
Łączna liczba uczniów szkół podstawowych wynosiła 24 318 (czerwiec 2026) oraz 24 902 (wrzesień 2026), w tym uczniów cudzoziemców odpowiednio 1 214 i 1 377.
Wydział uznaje żądanie zestawienia w podziale na szkoły za informację przetworzoną – proponujemy wezwanie do wykazania szczególnie istotnego interesu publicznego.`],

  // 3. Punkty sprzedaży alkoholu – WSO, prosty wniosek z e-maila
  ['03_wniosek_alkohol.txt', `Od: Jerzy Dociekliwy <j.dociekliwy@example.com>
Temat: wniosek o informację publiczną

Dzień dobry,
proszę o informację, ile punktów sprzedaży napojów alkoholowych otrzymało nowe zezwolenia w Bydgoszczy w latach 2021–2025, w podziale na lata, oraz ile zezwoleń cofnięto w tym okresie.
Odpowiedź proszę przesłać mailowo.

Pozdrawiam
Jerzy Dociekliwy`],
  ['03_odpowiedz_WSO.docx', `Wydział Spraw Obywatelskich
W odpowiedzi na prośbę AIP informuję, że w latach 2021–2025 wydano zezwolenia dla nowych punktów sprzedaży napojów alkoholowych: 2021 – 84, 2022 – 91, 2023 – 77, 2024 – 69, 2025 – 72. W tym okresie cofnięto 23 zezwolenia.`],

  // 4. Rzeźba z ronda – dwa wydziały (WIM + BKZ)
  ['04_wniosek_rzezba_rondo.pdf', `Bydgoszcz, 18 listopada 2026 r.

Wnioskodawca: Jacek Rzeźbiarz
ul. Artystyczna 7/3, 85-001 Bydgoszcz
tel. 691 234 777

WNIOSEK O UDOSTĘPNIENIE INFORMACJI PUBLICZNEJ

Proszę o udostępnienie następujących informacji:
1. Z jakiego powodu usunięto rzeźbę Ludmiły Stehnovej z wyspy Ronda Grunwaldzkiego?
2. Gdzie obecnie przechowywana jest rzeźba i w jakim jest stanie?
3. Czy rzeźba jest wpisana do gminnej ewidencji zabytków?
4. Czy planowany jest powrót rzeźby na rondo po zakończeniu przebudowy i w jakim terminie?

Odpowiedź proszę przesłać pocztą na wskazany adres.
Jacek Rzeźbiarz`],
  ['04_odpowiedz_WIM.docx', `Wydział Inwestycji Miasta
Ad 1. Rzeźbę zdemontowano w związku z przebudową Ronda Grunwaldzkiego, ponieważ wyspa centralna została objęta zakresem robót drogowych.
Ad 2. Rzeźba jest przechowywana w zabezpieczonym magazynie miejskim przy ul. Fordońskiej; jej stan techniczny oceniono jako dobry.
Ad 4. Powrót rzeźby na rondo przewidziano po zakończeniu przebudowy, planowanym na III kwartał 2027 r.`],
  ['04_odpowiedz_BKZ.docx', `Biuro Konserwatora Zabytków
Ad 3. Rzeźba nie jest wpisana do rejestru zabytków ani do gminnej ewidencji zabytków.`],

  // 5. Umowa – odesłanie do załączników → doprecyzowanie
  ['05_wniosek_umowa_jakotako.txt', `Od: abcxyz@jahu.example
Temat: info publiczna

Proszę o udostępnienie informacji publicznej dot. realizacji umowy nr 102/TT/2019 z Jakotako spółką z o.o. zgodnie z załączonymi wnioskami.`],

  // 6. Basen Astoria – WIM, tajemnica przedsiębiorstwa
  ['06_wniosek_basen_astoria.docx', `Bydgoszcz, 19.11.2026

Wnioskodawca: Ewa Górna
e-mail: e.gorna@example.com

Proszę o udostępnienie dokumentacji dotyczącej basenu Astorii:
1. projekt zagospodarowania terenu,
2. projekt zagospodarowania zieleni,
3. wizualizacje,
4. zestawienie parametrów technicznych budynku.

Dokumenty proszę przesłać w formie elektronicznej.`],
  ['06_odpowiedz_WIM.docx', `Wydział Inwestycji Miasta
Ad 1. Projekt zagospodarowania terenu stanowi część dokumentacji projektowej i może zostać udostępniony w formie elektronicznej (plik PDF, 14 arkuszy).
Ad 2. Projekt zagospodarowania zieleni zostanie udostępniony w formie elektronicznej (plik PDF, 6 arkuszy).
Ad 3. Wizualizacje opublikowano na stronie internetowej Miasta w zakładce „Inwestycje – Astoria”.
Ad 4. Zestawienie parametrów technicznych budynku zawiera rozwiązania zastrzeżone przez wykonawcę jako tajemnica przedsiębiorstwa (pismo wykonawcy z dnia 3 marca 2026 r.); w tym zakresie Wydział przygotuje projekt decyzji o odmowie udostępnienia.`],

  // 7. Dokument do testu anonimizacji (katalog UMB)
  ['07_dokument_dane_szczegolne.docx', `NOTATKA SŁUŻBOWA – sprawa lokalu socjalnego

Wnioskodawczyni Pani Agnieszka Lewicka, PESEL 85031712348, ur. 17.03.1985 r. w Grudziądzu, zam. ul. Nakielska 41/12, 85-391 Bydgoszcz, tel. 512 908 431, e-mail a.lewicka@example.com, legitymuje się dowodem osobistym ABC123456.
Jest rozwiedziona, samotnie wychowuje dwoje dzieci i korzysta z pomocy MOPS. Choruje na stwardnienie rozsiane i ma orzeczenie o niepełnosprawności w stopniu umiarkowanym. Jej zadłużenie czynszowe wynosi 8 640 zł.
Były mąż, Pan Krzysztof Lewicki, był karany za przestępstwo skarbowe. Rodzina zajmuje lokal przy działce nr 214/7, obręb 0112.
Zwrot nadpłaty należy przekazać na rachunek 61 1090 1014 0000 0712 1981 2874.
Sprawę prowadzi Naczelnik Wydziału Mienia i Geodezji Piotr Nowak. Wykonawca remontu: Bud-Rem sp. z o.o., NIP 526-104-08-28.`],
];

for (const [name, text] of FILES) {
  if (name.endsWith('.pdf')) await pdf(name, text);
  else if (name.endsWith('.docx')) await docx(name, text);
  else writeFileSync(new URL(name, out), text);
}

writeFileSync(new URL('INSTRUKCJA.md', out), `# Pakiet testowy UDIPilot (dane fikcyjne)

Tematy wniosków pochodzą z arkusza kalendarium UMB; treść, osoby i liczby są wymyślone.

| Nr | Wniosek | Odpowiedzi wydziałów | Co pokazuje |
|---|---|---|---|
| 01 | \`01_wniosek_bezdomne_zwierzeta.pdf\` | \`01_odpowiedz_WOS.docx\` (WOŚ) | 4 pytania → komplet „Ad 1–4”; w odpowiedzi nazwisko i telefon lekarza → anonimizacja |
| 02 | \`02_wniosek_uczniowie_cudzoziemcy.docx\` | \`02_odpowiedz_WE.docx\` (WE) | wskazówka „informacja przetworzona”; pismo typu „Wezwanie – informacja przetworzona” |
| 03 | \`03_wniosek_alkohol.txt\` (e-mail) | \`03_odpowiedz_WSO.docx\` (WSO) | wniosek prozą bez numeracji; odpowiedź bez „Ad” – dopasowanie całej odpowiedzi |
| 04 | \`04_wniosek_rzezba_rondo.pdf\` | \`04_odpowiedz_WIM.docx\` (WIM), \`04_odpowiedz_BKZ.docx\` (BKZ) | dwa wydziały składane w jedno pismo; adres i telefon wnioskodawcy zostają (adresat) |
| 05 | \`05_wniosek_umowa_jakotako.txt\` | – | odesłanie do „załączonych wniosków” → **Wezwij do doprecyzowania** |
| 06 | \`06_wniosek_basen_astoria.docx\` | \`06_odpowiedz_WIM.docx\` (WIM) | tajemnica przedsiębiorstwa → część do decyzji odmownej |
| 07 | – | – | \`07_dokument_dane_szczegolne.docx\` → **Anonimizator**: dane szczególne z katalogu UMB |

Kroki: **Nowy wniosek** → wgraj plik wniosku → sprawdź pytania i wydziały → **Zarejestruj** → zakładka **2** wgraj odpowiedzi (wybierz właściwy wydział) → zakładka **3** generuj projekt → zakładka **4** anonimizacja → **Pobierz DOCX**.
`);
console.log(`Pakiet testowy: ${FILES.length} plików w samples/pakiet_testowy/`);
