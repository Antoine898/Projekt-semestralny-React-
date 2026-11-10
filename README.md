# LigaScore - wyniki i obserwowane profile

> **Status:** propozycja projektu. Aplikacja i opisane zabezpieczenia są planowane, nie zostały jeszcze zaimplementowane ani przetestowane.

## Autorzy

- Antoni Banaśkiewicz

## Cel aplikacji

LigaScore to prosta aplikacja do sprawdzania wyników meczów piłkarskich w wybranych ligach. Wyniki będą pobierane z zewnętrznego API przez serwer aplikacji. Użytkownik może przeglądać profile lig, klubów i zawodników, a po zalogowaniu obserwować wybrane profile na swojej liście.

**Przykład użycia:** użytkownik wybiera ligę, sprawdza wyniki ostatniej kolejki i obserwuje swój ulubiony klub oraz wybranego zawodnika, by szybko wrócić do ich profili.

## Planowane funkcje

1. Użytkownik zakłada konto i loguje się.
2. Użytkownik wybiera ligę i przegląda listę meczów wraz z datami i wynikami.
3. Użytkownik otwiera profil ligi, klubu lub zawodnika i przegląda podstawowe informacje oraz powiązane wyniki.
4. Zalogowany użytkownik obserwuje lub przestaje obserwować wybrany profil.
5. Użytkownik przegląda własną listę obserwowanych lig, klubów i zawodników.
6. Aplikacja pobiera dostępne rozgrywki, mecze i wyniki z API dostawcy danych.

## Technologie i dane

- **Interfejs:** React i CSS, uruchamiane przez Vite.
- **Serwer API:** Node.js i Express. Serwer pobiera dane od dostawcy, obsługuje logowanie i zapis obserwowanych profili. Przeglądarka komunikuje się z naszym serwerem, nie bezpośrednio z dostawcą API.
- **Zewnętrzne dane:** [football-data.org API v4](https://docs.football-data.org/), m.in. rozgrywki, mecze, kluby i dostępne dane osób.
- **Baza danych:** SQLite połączona z serwerem Express. Będzie przechowywać konta i obserwowane profile; odpowiedzi API mogą być krótko buforowane, by ograniczyć liczbę zapytań.
- **Logowanie:** hasła będą przechowywane jako bezpieczne skróty, a nie zwykły tekst. Klucz API będzie przechowywany wyłącznie w konfiguracji serwera.
- **Zakres i ograniczenia:** darmowy plan football-data.org obejmuje obecnie do 12 rozgrywek, wyniki z opóźnieniem i 10 wywołań na minutę. Dostępność zawodników i szczegółów profili zależy od planu i pokrycia danych; jeśli składy nie będą dostępne, dodamy kilka przykładowych profili zawodników lokalnie. Bez wyników na żywo, powiadomień i typowania meczów. Przed realizacją sprawdzimy aktualne [ceny i limity](https://www.football-data.org/pricing).

## Zagrożenia i planowane zabezpieczenia

| Zagrożenie | Planowane zabezpieczenie | Plan testu |
| --- | --- | --- |
| Użytkownik próbuje zmienić listę obserwowanych profili innej osoby, podmieniając identyfikator użytkownika w żądaniu. | Serwer ustala użytkownika na podstawie zalogowanej sesji i nie ufa identyfikatorowi właściciela przesłanemu z przeglądarki. | Z konta A wysłać żądanie zmiany obserwowanych profili z identyfikatorem konta B. Oczekiwany wynik: odmowa, a lista konta B pozostaje bez zmian. |
| Niezalogowany użytkownik próbuje dodać lub usunąć obserwowany profil. | Serwer wymaga zalogowanej sesji przy każdej operacji zmieniającej listę obserwowanych. | Wysłać żądanie bez logowania. Oczekiwany wynik: odpowiedź 401 i brak zmian w bazie. |
| Użytkownik podaje nieprawidłowy identyfikator ligi lub próbuje wymusić zapytanie do dowolnego adresu. | Serwer waliduje identyfikatory i korzysta ze stałego adresu API dostawcy; nie przyjmuje adresu URL od użytkownika. | Wysłać nieprawidłowy identyfikator albo własny adres URL. Oczekiwany wynik: żądanie zostaje odrzucone i serwer nie odpytuje wskazanego adresu. |
| Klucz API zostaje ujawniony w kodzie React lub żądaniach przeglądarki. | Klucz jest przechowywany w zmiennej środowiskowej serwera i używany tylko przez Express. Plik `.env` jest wykluczony z repozytorium. | Sprawdzić kod i żądania w przeglądarce. Oczekiwany wynik: klucz nie występuje w plikach klienta ani w ruchu sieciowym przeglądarki. |
| Nazwa profilu zawiera znaczniki HTML. | React wyświetla wartości jako zwykły tekst; aplikacja nie używa `dangerouslySetInnerHTML` dla danych profili. | Użyć testowej nazwy zawierającej znaczniki HTML. Oczekiwany wynik: znaczniki są widoczne jako tekst, a nie wykonywane jako kod. |

## Plan pracy

1. **Ustalenie zakresu:** wybór lig dostępnych w API, rejestracja klucza i makieta widoków.
2. **Pierwszy działający scenariusz:** pobranie terminarza i wyników przez Express oraz wyświetlenie ich w React.
3. **Konta i obserwowanie:** rejestracja, logowanie oraz zapisywanie listy obserwowanych profili w SQLite.
4. **Profile:** widoki lig, klubów i dostępnych zawodników, z kilkoma lokalnymi przykładami, jeśli API nie udostępnia składów.
5. **Zabezpieczenia i testy:** walidacja danych, kontrola dostępu, ochrona klucza API i bezpieczne wyświetlanie danych.
6. **Dopracowanie i prezentacja:** poprawki interfejsu, instrukcja uruchomienia, testy końcowe i przygotowanie scenariusza prezentacji.

## Testy zabezpieczeń - wyniki

Testy zostaną wykonane po zaimplementowaniu funkcji. Poniżej należy wpisać rzeczywiste wyniki, datę i ewentualne poprawki; nie oznaczaj testu jako zaliczonego przed jego wykonaniem.

| Test | Wynik | Data / uwagi |
| --- | --- | --- |
| Próba zmiany obserwowanych profili innego użytkownika | Do wykonania |  |
| Próba zmiany listy obserwowanych bez logowania | Do wykonania |  |
| Odrzucenie nieprawidłowego identyfikatora lub adresu URL | Do wykonania |  |
| Sprawdzenie, czy klucz API nie jest widoczny w przeglądarce | Do wykonania |  |
| Wyświetlenie znaczników HTML w nazwie profilu jako zwykłego tekstu | Do wykonania |  |

## Uruchomienie aplikacji

Instrukcja zostanie uzupełniona po przygotowaniu aplikacji. Projekt będzie zawierał foldery `client` (React) i `server` (Express). Planowane kroki:

1. Zainstalować Node.js w wersji LTS i pobrać repozytorium.
2. W terminalu wejść do folderu `server` i wykonać `npm install`.
3. W drugim terminalu wejść do folderu `client` i wykonać `npm install`.
4. Zarejestrować się w [football-data.org](https://www.football-data.org/client/register) i uzyskać klucz API.
5. Umieścić klucz w pliku `server/.env` jako `FOOTBALL_DATA_API_KEY=...`; plik `.env` musi być wykluczony w `.gitignore`. Do repozytorium można dodać jedynie `.env.example` z pustą wartością.
6. Uruchomić serwer API oraz aplikację React poleceniami opisanymi w plikach `package.json`.
7. Serwer utworzy lub przygotuje lokalną bazę SQLite zgodnie z instrukcją projektu.

Nie umieszczaj w repozytorium haseł, kluczy API ani innych poufnych danych. Serwer powinien ograniczać liczbę zapytań i krótko buforować odpowiedzi, aby respektować limit dostawcy.
