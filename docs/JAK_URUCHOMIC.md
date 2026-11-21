# Jak uruchomić UDIPilot (instrukcja dla jury)

**Czas:** ok. 5 minut (+ ok. 10 minut, jeśli pobierasz lokalny model AI).
**Wymagania:** Windows 10/11, macOS lub Linux · ok. 1 GB wolnego miejsca (z modelem AI ok. 8 GB).
Node.js nie trzeba instalować wcześniej – instalator zrobi to sam.
Internet jest potrzebny tylko podczas instalacji – sama aplikacja działa offline.

## 1. Instalacja – kreator jednym kliknięciem (zalecane)

### Windows

1. Otwórz https://github.com/mykytacore16/udipilot → zielony przycisk **Code → Download ZIP**.
2. **Odblokuj plik** (Windows 11 z funkcją Smart App Control blokuje pliki z Internetu):
   kliknij pobrany ZIP prawym przyciskiem → **Właściwości** → na dole zaznacz **Odblokuj** → **OK**.
3. Rozpakuj ZIP (prawy przycisk → **Wyodrębnij wszystkie**), np. do `C:\UDIPilot`.
4. W rozpakowanym folderze kliknij dwukrotnie **`INSTALUJ.bat`**.
   - Jeśli nie ma Node.js, zostanie zainstalowany automatycznie (winget). Gdy okno o to poprosi – uruchom `INSTALUJ.bat` jeszcze raz.
5. W przeglądarce otworzy się **kreator instalacji UDIPilot**:
   - **Twój komputer** – sprawdzenie Node.js, systemu, miejsca na dysku i portu 3000,
   - **Opcje** – przełączniki: *Lokalny model AI – Bielik* (ok. 5 GB, opcjonalny) i *Skrót na pulpicie*,
   - przycisk **Zainstaluj** → postęp każdego kroku (krok „Biblioteki interfejsu” trwa 2–4 minuty),
   - ekran **Gotowe** → przycisk **Uruchom UDIPilot** otwiera aplikację: **http://localhost:3000**.

**Kolejne uruchomienia:** ikona **UDIPilot** na pulpicie (albo `UDIPilot.cmd` / `URUCHOM.bat` w folderze).
Otworzy się czarne okno serwera – **nie zamykaj go**, dopóki pracujesz w aplikacji. Zamknięcie okna zatrzymuje aplikację.

> **Jeśli Windows mimo to zablokuje `INSTALUJ.bat`** („System Windows ochronił komputer”): otwórz PowerShell w rozpakowanym folderze (w Eksploratorze: pasek adresu → wpisz `powershell` → Enter) i wpisz:
> ```powershell
> node installer\installer.js
> ```
> Jeśli pojawi się błąd „node nie jest rozpoznawany”, najpierw zainstaluj Node.js: `winget install -e --id OpenJS.NodeJS.LTS`, zamknij i otwórz PowerShell ponownie.

### macOS / Linux

```bash
cd ~/Downloads/udipilot-main      # rozpakowany folder
chmod +x instaluj.sh uruchom.sh
./instaluj.sh                     # otwiera ten sam kreator w przeglądarce
```

Kolejne uruchomienia: `./uruchom.sh` (macOS: także ikona **UDIPilot.command** na pulpicie).

### Aktualizacja do nowszej wersji

Pobierz nowy ZIP, rozpakuj go **w miejsce starego folderu** (zastąp pliki) i uruchom `INSTALUJ.bat` ponownie – kreator pokaże **Zaktualizuj**. Wprowadzone dane (folder `data/`) i ustawienia AI zostają.

## 1a. Ręcznie (dla programistów)

Wymaga Node.js 22.5+ (https://nodejs.org).

```bash
git clone https://github.com/mykytacore16/udipilot.git
cd udipilot
npm run setup      # biblioteki, build interfejsu, dane demo
npm start          # http://localhost:3000
```

> Jeśli port 3000 jest zajęty: `PORT=3100 npm start` (macOS/Linux) lub `$env:PORT=3100; npm start` (PowerShell).

## Najczęstsze problemy

| Problem | Rozwiązanie |
|---|---|
| „System Windows ochronił komputer” / Smart App Control | Odblokuj ZIP (Właściwości → Odblokuj) przed rozpakowaniem albo uruchom `node installer\installer.js` w PowerShell |
| Kreator stoi na „Biblioteki interfejsu” | To normalne – npm pobiera biblioteki (2–4 min). „Pokaż szczegóły” pokazuje postęp |
| Strona http://localhost:3000 się nie otwiera | Uruchom ikonę **UDIPilot** i nie zamykaj czarnego okna serwera |
| „Port 3000 zajęty” | Inny program używa portu – zamknij go albo uruchom ręcznie na innym porcie (wyżej) |
| Pobieranie modelu Bielik przerwane | Kliknij **Spróbuj ponownie** – pobieranie wznowi się; albo **Kontynuuj bez AI** i pobierz później przyciskiem **Podłącz AI** |

## 2. Szybki test (scenariusz z opisu zadania)

Pliki testowe (dane fikcyjne) są w folderze `samples/pakiet_testowy/` – opis w `INSTRUKCJA.md`.

1. **Rejestr wniosków** – wnioski testowe z arkusza UMB, kolory terminów, widok **Kalendarz**.
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
