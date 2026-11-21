# UDIPilot – Inteligentny Asystent Urzędnika

**Zespół:** LumenCode – Oleksii Reznik, Daniil Pavlichenko, Hlib Tkachenko, Mykyta Korkishko
**Wyzwanie:** Inteligentny asystent urzędnika – Urząd Miasta Bydgoszczy

## Problem
Każdy wniosek o dostęp do informacji publicznej wymaga ręcznej pracy: przeszukania archiwum i BIP, zapytań do wydziałów, napisania pisma od nowa i zaczernienia danych osobowych – w ustawowym terminie 14 dni. Błąd oznacza przekroczenie terminu (art. 23 u.d.i.p.) albo ujawnienie danych chronionych.

## Rozwiązanie
UDIPilot prowadzi urzędnika przez cały proces w jednej aplikacji przeglądarkowej:
1. **Rejestr i kalendarz wniosków** – kolejność od najstarszego, podświetlenie wniosków po terminie, z terminem dziś i jutro oraz w kwerendzie; terminy liczone automatycznie (14 dni, przesunięcie z soboty i świąt wg art. 57 § 4 KPA, przedłużenie maks. 2 miesiące); wszystkie pola z opisu zadania i wybór roku.
2. **Analiza wniosku PDF/Word** – odczyt wnioskodawcy i formy odpowiedzi, podział na pytania, propozycja wydziałów UMB (lista z BIP) z uzasadnieniem, podobne sprawy z archiwum, wskazówki prawne (informacja przetworzona, odesłanie do BIP, porada zamiast informacji, ryzyko odmowy).
3. **Zapytania do wydziałów** – gotowa treść z listą pytań i terminem wewnętrznym (bez automatycznej wysyłki).
4. **Projekt odpowiedzi** – 6 typów pism; treść merytoryczna wyłącznie z odpowiedzi wydziałów, każdy akapit ze źródłem; automatyczna weryfikacja zdań bez źródła i liczb spoza odpowiedzi wydziałów; wykrywanie pytań bez odpowiedzi.
5. **Anonimizacja** – propozycje na szaro, po akceptacji na czarno, ręczne zaznaczanie; PESEL, NIP, REGON, IBAN z sumami kontrolnymi, adresy, telefony, e-maile, dokumenty, osoby (z odmianą); dane adresata pozostają; w eksporcie DOCX dane są fizycznie usuwane.
6. **Baza wiedzy** – wgrywanie ustaw, zarządzeń i archiwalnych odpowiedzi; wysłane odpowiedzi automatycznie zasilają archiwum, więc podpowiedzi są coraz lepsze.

Statusy sprawy (brak działań → zapytania do wydziałów → kwerenda → odpowiedź przygotowana → wysłana) i pełna historia działań aktualizują się automatycznie.

## Technologia
Node.js 22 + Express, React + Vite, SQLite (wbudowany w Node), wyszukiwanie BM25 z polskim stemmingiem, unpdf i mammoth (PDF/Word), docx (eksport), Docker Compose. Wyłącznie darmowe komponenty open source. Kod przygotowany z pomocą asystenta AI (Claude); koncepcja, testy i decyzje – zespół.

## Praca w zamkniętym systemie
Prototyp działa **w całości bez Internetu i bez dużych modeli językowych** – terminy, wyszukiwanie, projekt pisma i anonimizacja opierają się na regułach i lokalnym wyszukiwaniu. Model językowy jest opcjonalny (interfejs zgodny z OpenAI: Ollama, vLLM) i służy tylko do redakcji stylu oraz drugiej warstwy anonimizacji, a jego wynik jest weryfikowany. Rekomendowany model do sieci zamkniętej: **Bielik 11B v2 Instruct** (Ollama/vLLM, 1 serwer z GPU 24 GB); alternatywnie **PLLuM**; bez GPU – Bielik 4.5B w kwantyzacji Q4.

## Wdrożenie w Bydgoszczy
Pilot w jednym biurze na serwerze Urzędu (Docker) z importem archiwum odpowiedzi → pełne teksty ustaw z ISAP i OCR skanów → logowanie AD/LDAP i role dla całego Urzędu → ten sam silnik dla wniosków RODO i innych JST.

## Linki
Repozytorium: https://github.com/mykytacore16/udipilot · Film: [link] · Prezentacja: PDF w zgłoszeniu
