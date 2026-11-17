# LigaScore - konta i obserwowane profile

## Status

W projekcie działa przykładowy moduł kont użytkowników i prywatna lista obserwowanych profili. Dotychczasowy plik `index.html` w katalogu głównym pozostaje ćwiczeniem z lekcji. Aplikację uruchamia się z serwera Express, a jej interfejs znajduje się w `server/public`.

Ten etap nie pobiera jeszcze wyników meczów z football-data.org. Profile dodaje się ręcznie, wpisując ich nazwę i rodzaj.

## Autorzy

- Antoni Banaśkiewicz

## Funkcje

- Rejestracja, logowanie i wylogowanie.
- Chroniony pulpit pod adresem `/dashboard`; niezalogowany użytkownik zostaje przekierowany do formularza logowania.
- Dodawanie, wyświetlanie i usuwanie obserwowanych lig, klubów i zawodników.
- Prywatna lista przypisana do konta; użytkownik nie może odczytać ani zmienić listy innego konta.
- Maksymalnie 100 profili na konto; duplikaty tego samego rodzaju nie są dozwolone.

## Zabezpieczenia

- Hasła są skracane algorytmem **Argon2id** i zapisywane w SQLite jako skróty, nigdy w postaci jawnej.
- Hasło musi mieć od 12 do 128 znaków; adres e-mail, rodzaj i nazwa profilu są walidowane po stronie serwera. Formularze mają dodatkową walidację HTML.
- Sesje przechowuje SQLite. Identyfikator sesji jest w ciasteczku `HttpOnly`, `SameSite=Lax`; po zalogowaniu i rejestracji sesja jest rotowana.
- Operacje zmieniające dane wymagają tokenu CSRF. Próby logowania i rejestracji są ograniczone do 10 na 15 minut z jednego adresu IP.
- Helmet ustawia nagłówki bezpieczeństwa i Content Security Policy. Dane profili są wstawiane do interfejsu jako tekst, nie jako HTML.
- Zapytania SQL są parametryzowane. Serwer wyznacza właściciela listy z sesji i nie przyjmuje `user_id` od przeglądarki.
- Pliki z lokalnymi sekretami, zależnościami i bazą danych są wykluczone z Gita.

## Wymagania

- Node.js 22.13 lub nowszy.
- npm.

## Uruchomienie lokalne

W terminalu, w katalogu projektu:

```powershell
npm install
npm test
npm start
```

Otwórz `http://localhost:3000`. Załóż konto, a następnie dodaj i usuń przykładowe profile z pulpitu. Baza danych tworzona jest automatycznie w `server/data/ligascore.sqlite`.

Przy lokalnym uruchomieniu, bez `SESSION_SECRET`, serwer tworzy losowy sekret na czas działania procesu. Zalogowane sesje przestaną działać po restarcie serwera. Dla trwalszej sesji skopiuj `.env.example` do `.env` i wstaw losowy sekret o długości co najmniej 32 bajtów. W PowerShell wygeneruj go poleceniem:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Nie zapisuj rzeczywistego pliku `.env` w repozytorium. Na wdrożeniu ustaw `NODE_ENV=production`, `SESSION_SECRET` jako zmienną środowiskową i używaj HTTPS. Jeżeli aplikacja działa za jednym zaufanym reverse proxy, ustaw również `TRUST_PROXY=1`; nie włączaj tej opcji bez takiego proxy.

## Testy

Uruchom `npm test`. Testy integracyjne sprawdzają:

- rejestrację, skrót Argon2id, sesję i token CSRF,
- odrzucanie niepoprawnego hasła i duplikatu konta,
- przekierowanie z chronionego pulpitu i blokadę API bez logowania,
- dodawanie/listowanie/usuwanie profili, duplikaty oraz izolację list dwóch kont.

Ostatni lokalny wynik: **4 testy zaliczone, 0 błędów**.

## Git i publikacja na GitHubie

Sprawdź, czy repozytorium ma już zdalny adres:

```powershell
git status
git remote -v
```

Jeśli projekt nie jest jeszcze repozytorium Git, utwórz je i dodaj pliki:

```powershell
git init -b main
git add .
git status
git commit -m "Dodaj konta i obserwowane profile"
```

Jeśli repozytorium Git już istnieje, pomiń `git init`. Po utworzeniu pustego repozytorium na GitHubie dodaj jego adres HTTPS i wypchnij commit:

```powershell
git remote add origin https://github.com/TWOJ_LOGIN/NAZWA_REPO.git
git push -u origin main
```

Jeżeli `origin` już istnieje, sprawdź adres przez `git remote -v` i użyj:

```powershell
git add .
git commit -m "Dodaj konta i obserwowane profile"
git push
```

Historia commitów:

```powershell
git log --oneline
```

Przed `git add .` sprawdź `git status`. Nie dodawaj pliku `.env`, haseł ani wygenerowanej bazy `server/data/ligascore.sqlite`. Do oddania dołącz adres repozytorium oraz zrzuty ekranu formularzy, komunikatów błędów, bazy ze skrótami haseł, pulpitu po zalogowaniu i historii commitów.
