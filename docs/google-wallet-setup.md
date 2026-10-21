# Dziennik konfiguracji Google Wallet

Ostatnia aktualizacja: 21 października 2026 r.

## Cel

Umożliwić Stampee dodawanie kart lojalnościowych do Google Wallet. Dane uwierzytelniające mogą trafić wyłącznie do sekretów Supabase Edge Functions. Nie zapisujemy ich w repozytorium, kodzie frontendu, SQL ani tym dzienniku.

## Wykonana konfiguracja

- Projekt Google Cloud: `stampee-wallet`.
- Włączono Google Wallet API w tym projekcie.
- Utworzono konto usługi: `stampee-wallet-issuer@stampee-wallet.iam.gserviceaccount.com`.
- Identyfikator wystawcy Google Wallet: `3388000000023226005`.
- Utworzono klasę lojalnościową: `3388000000023226005.stampee_loyalty_demo_01`.
- Klasa ma status `DRAFT`; wystawca jest w trybie demo do czasu przyznania przez Google dostępu do publikowania.
- 21.10.2026 dodano konto usługi do wystawcy Stampee z rolą `Developer`. Konsola potwierdza je na liście użytkowników.
- Google Cloud pokazuje dwa aktywne klucze usługi. Odpowiadających im plików JSON nie udało się znaleźć w Pobranych ani przez wyszukiwanie Findera. Żaden klucz prywatny nie został przekazany do Supabase.
- 21.10.2026 Google Cloud potwierdził zapis pliku `stampee-wallet-601cd58b27f9.json`, którego nie odnaleziono w standardowym folderze Pobrane.
- 21.10.2026 znaleziono w Pobranych plik `stampee-wallet-1e727a4335af.json`. Sprawdzono bez ujawniania klucza prywatnego, że jest to JSON konta usługi `stampee-wallet-issuer@stampee-wallet.iam.gserviceaccount.com` dla projektu `stampee-wallet`. Klucza nie przekazano jeszcze do Supabase.
- Identyfikator klucza w lokalnym pliku jest inny niż trzy identyfikatory widoczne wcześniej na liście Google Cloud. Bieżącą liczbę i status aktywnych kluczy trzeba potwierdzić przed ich porządkowaniem.
- Nie włączono okresu próbnego z kredytem ani e-maili marketingowych.

## Aktualny stan

- Konto usługi ma dostęp `Developer` w Google Wallet.
- Panel sekretów Edge Functions projektu Supabase `tppflihjbfdranubxofn` jest dostępny i obecnie nie ma w nim własnych sekretów.
- Kod aplikacji nie tworzy jeszcze ani nie podpisuje kart Google Wallet.
- Klucz z pliku znalezionego w Pobranych nie został jeszcze zapisany w Supabase. Unieważnienie nieużywanych kluczy odłożono do czasu bezpiecznego zapisania i weryfikacji sekretu.
- W Safari otworzyła się osobna sesja Google z dodatkowym ekranem warunków. Nie kontynuowano jej i nie przełączano kont.

## Plan dalszych prac

1. Dodać klucz z pliku `stampee-wallet-1e727a4335af.json` do Supabase Edge Function Secrets. Nie generować kolejnych kluczy.
2. Dodać wymagane dane Google Wallet do sekretów Supabase Edge Functions projektu Stampee. Nie wpisywać ich do zmiennych `VITE_*`, pliku SQL, repozytorium ani czatu.
3. Sprawdzić obecność nazw sekretów bez odczytywania ani wyświetlania ich wartości.
4. Dopiero po bezpiecznym zapisaniu nowego klucza unieważnić oba wcześniejsze klucze, których plików nie ma lokalnie.
5. Zaimplementować po stronie serwera tworzenie i podpisywanie karty oraz połączyć je z ekranem karty klienta.
6. Wystawić kartę testową i sprawdzić ją na telefonie w trybie demo.
7. Gdy karta i wygląd będą gotowe, złożyć wniosek do Google o dostęp do publikowania.
8. Apple Wallet rozważyć osobno; obecnie brak konta Apple Developer.

## Historia działań

- 21.10.2026: Za zgodą użytkownika zaakceptowano wymagane warunki Google Cloud; nie zaznaczono marketingowych e-maili.
- 21.10.2026: Włączono Google Wallet API, utworzono konto usługi i klasę lojalnościową Stampee.
- 21.10.2026: Google Cloud pokazuje dwa aktywne klucze. Ich plików JSON nie udało się odnaleźć. Żaden sekret nie został skopiowany do rozmowy ani repozytorium.
- 21.10.2026: Dodano konto usługi jako `Developer` do wystawcy Stampee w Google Wallet.
- 21.10.2026: Zweryfikowano panel sekretów Edge Functions. Nie dodano tam klucza.
- 21.10.2026: Sprawdzono Safari; osobna sesja Google wyświetliła dodatkowy ekran warunków. Pozostawiono ją bez zmian.
- 21.10.2026: W zalogowanej karcie Google Cloud dla `kubsonxds2@gmail.com` i projektu Stampee Wallet, za zgodą użytkownika, utworzono klucz JSON. Google potwierdził zapis pliku `stampee-wallet-601cd58b27f9.json`. Finder i standardowy katalog Pobrane nie pokazują pliku; nie odczytano ani nie wysłano jego zawartości. Nie unieważniono żadnych kluczy.
- 21.10.2026: Znaleziono w Pobranych JSON `stampee-wallet-1e727a4335af.json` dla właściwego konta usługi/projektu. Potwierdzono wyłącznie niesekretne pola identyfikujące. Następnym krokiem jest zapisanie go w sekretach Supabase; plik nie został umieszczony w GitHubie.
- 21.10.2026: Ponownie sprawdzono dokładną nazwę pliku w katalogach pobierania, profilu i cache Codex. Plików nadal nie ma; nie wygenerowano kolejnego klucza.
- 21.10.2026: Dodano dziennik konfiguracji i link do niego w README. Nie zmieniano schematu bazy danych ani kodu aplikacji na potrzeby Wallet.

## Zasady bezpieczeństwa

- Nie zapisywać klucza prywatnego w Git, `.env`, zmiennych frontendowych, historii SQL, zgłoszeniach ani czacie.
- Klucz trzymać wyłącznie w sekretach Supabase Edge Functions.
- Rejestrować w tym pliku wyłącznie niesekretne ustawienia, identyfikatory oraz postęp prac.
# Google Wallet — implementation log

## 2026-10-21

- Added the `create-google-wallet-pass` Supabase Edge Function. It reads only public card data, creates a signed Google Wallet save link for that specific card, and never exposes the service-account key to the browser or GitHub.
- Added the **Add to Google Wallet** button to public card pages.
- Before deployment, add these Supabase Edge Function Secrets:
  - `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` — full content of the downloaded service-account JSON file.
  - `GOOGLE_WALLET_ISSUER_ID` — the Google Wallet issuer ID.
  - `GOOGLE_WALLET_CLASS_ID` — the existing Generic pass class ID.
  - `APP_PUBLIC_URL` — the live Stampee address (for example `https://your-domain.com`).
- Then deploy both `create-google-wallet-pass` and `sync-google-wallet-pass`. The first opens Google Wallet; the second updates the pass after every stamp change and after reward redemption resets the card to `0/10`. The existing class must be approved for production by Google before real customers can add passes.

