# Jak uruchomić UDIPilot (instrukcja dla jury)

Czas: ok. 5 minut. Wymagania: Windows / macOS / Linux, **Node.js 22.5 lub nowszy** (https://nodejs.org), Git.
Internet potrzebny tylko do pobrania kodu i bibliotek – sama aplikacja działa offline.

## 1. Pobranie i uruchomienie

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

## 3. (Opcjonalnie) lokalny model AI – Bielik

Aplikacja działa bez modelu (reguły + wyszukiwanie lokalne). Aby włączyć funkcje AI:

```bash
# 1. zainstaluj Ollama: https://ollama.com
ollama pull SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0
# 2. utwórz plik .env w folderze udipilot:
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0
# 3. uruchom ponownie: npm start
```

## 4. Docker (alternatywa)

```bash
docker compose up -d     # http://localhost:3000
```

## Testy

```bash
npm test
```
