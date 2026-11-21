# Jak uruchomić UDIPilot (instrukcja dla jury)

Czas: ok. 5 minut. Wymagania: Windows / macOS / Linux, **Node.js 22.5 lub nowszy** (https://nodejs.org), Git.
Internet potrzebny tylko do pobrania kodu i bibliotek – sama aplikacja działa offline.

## 1. Najprościej – instalator jednym kliknięciem

1. Na https://github.com/mykytacore16/udipilot kliknij **Code → Download ZIP** i rozpakuj.
2. **Windows:** kliknij dwukrotnie **`INSTALUJ.bat`**. **macOS/Linux:** w terminalu `./instaluj.sh`.
3. W przeglądarce otworzy się **kreator instalacji**: sprawdzi komputer, pozwoli włączyć/wyłączyć lokalny model Bielik (ok. 5 GB) i skrót na pulpicie, pokaże postęp instalacji, a na końcu przycisk **Uruchom UDIPilot** otworzy **http://localhost:3000**.

> **Smart App Control / „Windows ochronił komputer”**: przed rozpakowaniem kliknij ZIP prawym przyciskiem → Właściwości → zaznacz **Odblokuj**. Albo bez pliku .bat, w PowerShell w folderze projektu: `node installerinstaller.js`.

Kolejne uruchomienia: skrót na pulpicie lub **`URUCHOM.bat`** / `./uruchom.sh`.

## 1a. Ręcznie (dla programistów)

```bash
git clone https://github.com/mykytacore16/udipilot.git
cd udipilot
npm run setup      # instaluje biblioteki, buduje interfejs, wczytuje dane demo
npm start
```

Otwórz w przeglądarce: **http://localhost:3000**

> Windows: polecenia wpisz w PowerShell lub Wierszu poleceń.
> Jeśli port 3000 jest zajęty: `PORT=3100 npm start` (macOS/Linux) lub `$env:PORT=3100; npm start` (PowerShell).

## 2. Szybki test (scenariusz z opisu zadania)

Pliki testowe (dane fikcyjne) są w folderze `samples/pakiet_testowy/` – opis w `INSTRUKCJA.md`.

1. **Rejestr wniosków** – 10 wniosków testowych z arkusza UMB, kolory terminów, widok **Kalendarz**.
   Przycisk **Import z Excela** → `samples/umb/WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx` pokazuje wykryte niezgodności terminów.
2. **Nowy wniosek** → przeciągnij `samples/pakiet_testowy/01_wniosek_bezdomne_zwierzeta.pdf` → sprawdź pytania, wydziały i podobne sprawy → **Zarejestruj wniosek**.
3. Zakładka **2. Odpowiedzi** → wydział **WOŚ** → przeciągnij `01_odpowiedz_WOS.docx`.
4. Zakładka **3. Projekt pisma** → **Generuj projekt odpowiedzi** (każdy akapit ze źródłem, weryfikacja liczb).
5. Zakładka **4. Anonimizacja i eksport** → **Zaczernij wszystkie propozycje** → **Pobierz DOCX**.
6. **Anonimizator** → `07_dokument_dane_szczegolne.docx` – dane osobowe i szczególne z katalogu UMB.

Gotowa sprawa demo w rejestrze: **BKS.IV.1431.603.2026** (brak odpowiedzi jednego wydziału – system to wykrywa).
Przywrócenie danych demo: **Bezpieczeństwo i AI → Przywróć dane demo**.

## 3. (Opcjonalnie) model AI – przycisk „Podłącz AI”

Aplikacja działa bez modelu (reguły + wyszukiwanie lokalne). W lewym dolnym rogu jest przycisk **Podłącz AI**:

- **Bielik lokalnie (zalecane)** – wymaga Ollama (https://ollama.com, instalator może ją doinstalować). Okno wykrywa Ollama i pobiera model przyciskiem **Pobierz Bielik** z paskiem postępu. Dane nie opuszczają komputera.
- **Claude / GPT / Gemini** – wklej klucz API. Pojawia się czerwone ostrzeżenie, że dane wniosków (także osobowe) zostaną wysłane do zewnętrznego dostawcy; zapis wymaga zaznaczenia potwierdzenia. Tylko do testów na danych fikcyjnych.
- **Sprawdź połączenie** wysyła krótkie zapytanie testowe; **Odłącz** wraca do trybu offline.

## 4. Docker (alternatywa)

```bash
docker compose up -d     # http://localhost:3000
```

## Testy

```bash
npm test
```
