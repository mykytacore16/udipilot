# UDIPilot – Inteligentny Asystent Urzędnika

Prototyp na HackNation 2026 (wyzwanie Urzędu Miasta Bydgoszczy): **rejestr i kalendarz wniosków UDIP + generator projektów odpowiedzi + anonimizacja danych**.
Działa **w 100% offline** (reguły, wyszukiwanie lokalne). Model językowy jest opcjonalny i podłączany jedną zmienną – docelowo lokalny **Bielik / PLLuM**.

## Szybki start

Wymagania: Node.js ≥ 22.5 (wbudowany SQLite). Bez Dockera, bez GPU, bez Internetu w trakcie pracy.

```bash
npm run setup      # instalacja, build frontendu, dane testowe
npm start          # http://127.0.0.1:3001
```

Docker (on-premise): `docker compose up -d` → http://localhost:3001
Z lokalnym modelem: `docker compose --profile ai up -d` i ustaw `LLM_BASE_URL=http://ollama:11434/v1`, `LLM_MODEL=…` (patrz `.env.example`).

Tryb deweloperski: `npm run dev` (API) + `npm run dev:client` (Vite, http://localhost:5173).
Testy: `npm test`. Pliki do testów jury: `samples/` (generowane `npm run samples`).

## Jak jury może przetestować (scenariusz z opisu zadania)

| Test z regulaminu | Gdzie w aplikacji |
|---|---|
| 1. Wgranie wniosku PDF/Word → podobne sprawy | **Nowy wniosek** → wgraj `samples/wniosek_place_zabaw.pdf` → panel „Podobne sprawy z archiwum” |
| 2. Odpowiedź wydziału → projekt pisma | Sprawa → zakładka **2** (wgraj `samples/odpowiedz_WGK_place_zabaw.docx`, `odpowiedz_BCB_monitoring.docx`) → zakładka **3** „Generuj projekt” |
| 3. Plik z danymi osobowymi → anonimizacja | **Anonimizator** → `samples/dokument_z_danymi_osobowymi.docx`, lub zakładka **4** w sprawie |
| 4. Łatwość obsługi, stabilność | prowadzenie krok po kroku, statusy aktualizowane automatycznie |
| 5. Kalendarz: 10 wniosków, kolejność, podświetlenie | **Rejestr wniosków** (tabela + widok kalendarza), kolory: po terminie / dziś / jutro / kwerenda |
| 6. Wgrywanie ustaw i archiwalnych odpowiedzi | **Baza wiedzy** (PDF/DOCX/TXT, import JSON) |

Gotowa sprawa demo: **184/2026** (termin w najbliższy dzień roboczy, odpowiedź WAB wgrana, brak odpowiedzi WGK na pyt. 4 – system to wykrywa).

## Funkcje

- **Rejestr i kalendarz** – Lp., nr, data wpływu, termin, dni do terminu, opis, wydziały, status, inicjały, data odpowiedzi, wybór roku; widok miesięczny ze świętami.
- **Terminy liczone zgodnie z prawem** – 14 dni (art. 13 ust. 1 u.d.i.p.), przesunięcie z soboty/święta (art. 57 § 4 KPA, w tym Wigilia od 2025 r.), kwerenda maks. 2 miesiące (art. 13 ust. 2) z walidacją.
- **Statusy** – brak działań → zapytania do wydziałów → kwerenda → odpowiedź przygotowana → wysłana; aktualizowane automatycznie przy każdym kroku, pełna historia sprawy.
- **Podział wniosku na pytania** i **propozycja wydziałów** UMB (lista z BIP) – kompetencje + „głos” podobnych spraw z archiwum + kontekst poprzedniego pytania; z uzasadnieniem.
- **Treść zapytania do wydziału** z terminem wewnętrznym (do skopiowania – system niczego nie wysyła).
- **Projekt odpowiedzi** – 6 typów pism: udostępnienie, zawiadomienie o przedłużeniu, wezwanie (informacja przetworzona), odesłanie do BIP, „to nie jest informacja publiczna”, szkielet decyzji odmownej z pouczeniem.
- **Ochrona przed halucynacjami** – treść merytoryczna wyłącznie z odpowiedzi wydziałów, przy każdym akapicie źródło; automatyczna weryfikacja zdań bez pokrycia i **liczb spoza źródeł**; wykrywanie pytań bez odpowiedzi.
- **Anonimizacja** – PESEL/NIP/REGON/IBAN z sumami kontrolnymi, telefon, e-mail, adres, dowód, data urodzenia, nr rej., KW, imiona i nazwiska (słownik + odmiana + kontekst), ostrzeżenie dla osób pełniących funkcje publiczne. Propozycje na szaro → po akceptacji na czarno; ręczne zaznaczanie myszką; spójne aliasy (Osoba A, B…). W DOCX dane są **fizycznie usuwane**.
- **Uczenie na danych Urzędu** – wysłane odpowiedzi trafiają (po anonimizacji) do archiwum i są podpowiadane przy kolejnych wnioskach; baza wiedzy przyjmuje ustawy, zarządzenia i archiwum.

## Architektura

```
React (Vite) ──REST──> Node.js / Express
                         ├─ lib/analysis   – metadane, pytania, typ sprawy, routing do wydziałów
                         ├─ lib/deadlines  – terminy, święta, kwerenda
                         ├─ lib/text       – BM25, stemming PL, podział na zdania
                         ├─ lib/draft      – szablony pism, mapowanie „Ad N”, weryfikacja źródeł
                         ├─ lib/anonymize  – detektory + sumy kontrolne + aliasy
                         ├─ lib/exporter   – DOCX/TXT z fizycznym usunięciem danych
                         ├─ lib/llm        – opcjonalny model (API zgodne z OpenAI: Ollama/vLLM)
                         └─ SQLite (node:sqlite) – wnioski, pytania, odpowiedzi, projekty, wiedza, historia
```

Skalowanie: setki/tysiące archiwalnych dokumentów – indeks BM25 w pamięci (ms); przy dziesiątkach tysięcy – PostgreSQL + pgvector/embeddingi (`sdadas/mmlw-roberta-large`) bez zmiany interfejsu.

## AI w zamkniętym środowisku

| Element | Domyślnie | Z modelem lokalnym |
|---|---|---|
| Terminy, statusy, kalendarz | reguły | – |
| Podobne sprawy, wydziały | BM25 + archiwum | (opcj.) embeddingi |
| Podział na pytania | reguły | LLM |
| Projekt pisma | szablony + treść wydziałów | LLM tylko redaguje styl, wynik weryfikowany |
| Anonimizacja | reguły + sumy kontrolne | LLM jako 2. warstwa |

Rekomendowany model offline: **Bielik-11B-v2.x-Instruct** (Ollama/vLLM, 1× GPU 24 GB) lub **PLLuM**; bez GPU – Bielik 4.5B/1.5B w kwantyzacji Q4 na CPU.

## Bezpieczeństwo

- brak automatycznej wysyłki i integracji zewnętrznych; ostateczna decyzja zawsze po stronie urzędnika,
- pliki przetwarzane w pamięci, limit 20 MB, walidacja formatów,
- treść wniosków izolowana od instrukcji modelu (prompt injection),
- nagłówki bezpieczeństwa, historia działań w każdej sprawie,
- wdrożenie: AD/LDAP + role, TLS przez reverse proxy, szyfrowanie wolumenu z bazą.

## Ograniczenia prototypu

- Brak OCR skanów (w wersji docelowej: lokalny Tesseract `pol`); stary `.doc` – konwersja do DOCX.
- Teksty ustaw w bazie to robocze streszczenia – do zastąpienia pełnymi tekstami z ISAP.
- Kwalifikacja prawna (typ odpowiedzi) jest podpowiedzią, nie rozstrzygnięciem.
- Brak logowania/ról w prototypie (zaprojektowane do wdrożenia).
- Wszystkie dane testowe są fikcyjne.
