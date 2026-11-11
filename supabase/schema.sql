-- KONTA GRACZY IMPOSTORA - tabele w bazie Supabase (Postgres).
--
-- Uruchomienie: Supabase -> SQL Editor -> wklej cały plik -> Run. Można uruchamiać ponownie (nic się nie zdubluje).
--
-- Zasady:
-- - Do tabel ma dostęp tylko serwer gry (połączenie DATABASE_URL, zob. accounts.js). Row Level Security jest
--   włączone na każdej tabeli BEZ żadnych reguł - przeglądarka z kluczem publicznym nie odczyta ani nie zmieni nic.
-- - Konta i logowanie to Supabase Auth (tabela auth.users). Każdy gracz ma konto: najpierw anonimowe
--   (tymczasowe, przypisane do urządzenia), potem może je zamienić na stałe przez Google albo link z e-maila.
-- - Postęp (EXP, statystyki, odznaki) zapisuje wyłącznie serwer gry po każdej rundzie.
-- - Zwykły Postgres poza auth.users - przy przeprowadzce na własny serwer wystarczy pg_dump i ten plik.

-- ===== PROFIL GRACZA =====
create table if not exists public.profiles (
    id            uuid primary key references auth.users (id) on delete cascade,
    data          jsonb not null default '{}'::jsonb,   -- statystyki, odznaki, wyczyny, historia (format: public/js/progress.js)
    level         integer not null default 1,           -- osobno od "data": szybkie zapytania (ranking w przyszłości)
    exp           integer not null default 0,
    nick          text,                                 -- etap 3: nick, wygląd i ustawienia wspólne dla wszystkich urządzeń
    avatar        jsonb,
    settings      jsonb not null default '{}'::jsonb,
    imported_at   timestamptz,                          -- kiedy przeniesiono postęp gościa z przeglądarki (raz na konto)
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    last_seen_at  timestamptz not null default now()    -- do usuwania porzuconych kont tymczasowych
);
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at);

-- ===== WŁASNE KATEGORIE (etap 3) =====
create table if not exists public.custom_categories (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users (id) on delete cascade,
    name        text not null,
    entries     jsonb not null default '[]'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists custom_categories_owner_idx on public.custom_categories (owner_id);

-- ===== ZAKUPY (płatności - później) =====
-- Wpis dodaje tylko serwer, po podpisanym potwierdzeniu od operatora płatności.
-- provider_ref jest unikalny: to samo potwierdzenie przysłane drugi raz nie przyzna pakietu ponownie.
create table if not exists public.purchases (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete restrict,   -- zakupów nie kasuje się razem z kontem (księgowość)
    provider      text not null,                    -- np. 'stripe', 'przelewy24'
    provider_ref  text not null,                    -- numer transakcji u operatora
    product       text not null,                    -- np. 'pakiet-kategorii-1'
    amount        integer not null,                 -- w groszach
    currency      text not null default 'PLN',
    status        text not null default 'paid',     -- 'paid', 'refunded'
    created_at    timestamptz not null default now(),
    unique (provider, provider_ref)
);
create index if not exists purchases_user_idx on public.purchases (user_id);

-- ===== ODBLOKOWANE ELEMENTY (z zakupów albo nagród) =====
create table if not exists public.unlocks (
    user_id     uuid not null references auth.users (id) on delete cascade,
    item_id     text not null,
    source      text not null,                      -- 'purchase', 'reward', ...
    created_at  timestamptz not null default now(),
    primary key (user_id, item_id)
);

-- ===== DOSTĘP: TYLKO SERWER GRY =====
alter table public.profiles          enable row level security;
alter table public.custom_categories enable row level security;
alter table public.purchases         enable row level security;
alter table public.unlocks           enable row level security;

-- ===== SPRZĄTANIE: konta tymczasowe nieużywane od 90 dni =====
-- Raz dziennie o 3:30 (UTC). Usunięcie konta z auth.users usuwa też jego profil i kategorie (on delete cascade).
-- Konto anonimowe z zakupem nie zostanie usunięte (purchases: on delete restrict) - i dobrze.
create extension if not exists pg_cron;

do $$
begin
    if exists (select 1 from cron.job where jobname = 'impostor-porzucone-konta') then
        perform cron.unschedule('impostor-porzucone-konta');
    end if;
    perform cron.schedule('impostor-porzucone-konta', '30 3 * * *', $job$
        delete from auth.users u
        where u.is_anonymous
          and coalesce((select p.last_seen_at from public.profiles p where p.id = u.id), u.created_at) < now() - interval '90 days'
          and not exists (select 1 from public.purchases b where b.user_id = u.id)
    $job$);
end $$;
