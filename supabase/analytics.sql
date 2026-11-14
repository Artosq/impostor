-- ANALITYKA GRY - tabele w Supabase (Postgres).
--
-- Uruchomienie: Supabase -> SQL Editor -> wklej cały plik -> Run (po supabase/schema.sql). Można uruchamiać ponownie.
--
-- Zasady:
-- - Zdarzenia zapisuje tylko serwer gry (analytics.js). Anonimowo: identyfikator odwiedzającego to skrót (hash)
--   z sekretem, bez adresu IP i bez ciasteczek - nie trzeba banera zgody.
-- - Pojedyncze zdarzenia są trzymane 90 dni, dzienne podsumowania (analytics_daily) - na zawsze.
-- - Dni liczone w czasie polskim (Europe/Warsaw).
-- - RLS włączone bez reguł: przeglądarka nie ma dostępu, stronę analityki obsługuje serwer (tylko dla admina).

create table if not exists public.analytics_events (
    id       bigserial primary key,
    at       timestamptz not null default now(),
    type     text not null,           -- visit, online, room, round, login
    visitor  text,                    -- skrót identyfikatora gracza (nie da się z niego odczytać, kto to)
    data     jsonb not null default '{}'::jsonb
);
create index if not exists analytics_events_at_idx on public.analytics_events (at);
create index if not exists analytics_events_type_at_idx on public.analytics_events (type, at);

-- Kiedy odwiedzający był pierwszy raz (nowi kontra powracający, powroty po 1 i 7 dniach)
create table if not exists public.analytics_visitors (
    visitor     text primary key,
    first_day   date not null,
    last_day    date not null
);

-- Dzienne podsumowania: metric + key (np. metric 'source', key 'zaproszenie') -> value
create table if not exists public.analytics_daily (
    day     date not null,
    metric  text not null,
    key     text not null default '',
    value   double precision not null,
    primary key (day, metric, key)
);

alter table public.analytics_events   enable row level security;
alter table public.analytics_visitors enable row level security;
alter table public.analytics_daily    enable row level security;

-- ===== PODSUMOWANIE JEDNEGO DNIA =====
-- Liczone od nowa (można wołać wielokrotnie - np. strona analityki przelicza bieżący dzień przy każdym wejściu)
create or replace function public.analytics_rollup(target date) returns void
language plpgsql as $$
declare
    day_start timestamptz := (target::timestamp at time zone 'Europe/Warsaw');
    day_end   timestamptz := ((target + 1)::timestamp at time zone 'Europe/Warsaw');
begin
    delete from public.analytics_daily where day = target and metric not in ('return_d1', 'return_d7');

    insert into public.analytics_daily (day, metric, key, value)
    with _ev as (select * from public.analytics_events where at >= day_start and at < day_end)
    -- odwiedzający i wejścia
    select target, 'visitors', '', count(distinct visitor) from _ev where type = 'visit'
    union all select target, 'visits', '', count(*) from _ev where type = 'visit'
    union all select target, 'new_visitors', '', count(distinct e.visitor) from _ev e
        join public.analytics_visitors v on v.visitor = e.visitor and v.first_day = target where e.type = 'visit'
    union all select target, 'peak_online', '', coalesce(max((data->>'count')::int), 0) from _ev where type = 'online'
    -- skąd, jakie urządzenia, zainstalowana aplikacja (unikalni odwiedzający)
    union all select target, 'source', coalesce(data->>'source', 'inne'), count(distinct visitor) from _ev where type = 'visit' group by 2, 3
    union all select target, 'device', coalesce(data->>'device', 'inne'), count(distinct visitor) from _ev where type = 'visit' group by 2, 3
    union all select target, 'installed', '', count(distinct visitor) from _ev where type = 'visit' and (data->>'installed')::boolean
    -- gra
    union all select target, 'rooms', '', count(*) from _ev where type = 'room'
    union all select target, 'rounds', '', count(*) from _ev where type = 'round'
    union all select target, 'round_players_sum', '', coalesce(sum((data->>'players')::int), 0) from _ev where type = 'round'
    union all select target, 'round_ms_sum', '', coalesce(sum(least((data->>'ms')::bigint, 3600000)), 0) from _ev where type = 'round'
    union all select target, 'mode', coalesce(data->>'mode', 'inne'), count(*) from _ev where type = 'round' group by 2, 3
    union all select target, 'category', coalesce(data->>'category', 'inne'), count(*) from _ev where type = 'round' group by 2, 3
    union all select target, 'room_size', least((data->>'players')::int, 10)::text, count(*) from _ev where type = 'round' group by 2, 3
    -- konta
    union all select target, 'login', coalesce(data->>'provider', 'inne'), count(*) from _ev where type = 'login' group by 2, 3;

    -- powroty: ilu nowych z dnia target-1 wróciło dzień później i ilu z target-7 wróciło w ciągu tygodnia
    insert into public.analytics_daily (day, metric, key, value)
    select target - 1, 'return_d1', '', count(*) from public.analytics_visitors v
    where v.first_day = target - 1 and exists (
        select 1 from public.analytics_events e where e.type = 'visit' and e.visitor = v.visitor
          and e.at >= day_start and e.at < day_end)
    on conflict (day, metric, key) do update set value = excluded.value;

    insert into public.analytics_daily (day, metric, key, value)
    select target - 7, 'return_d7', '', count(*) from public.analytics_visitors v
    where v.first_day = target - 7 and exists (
        select 1 from public.analytics_events e where e.type = 'visit' and e.visitor = v.visitor
          and e.at >= ((target - 6)::timestamp at time zone 'Europe/Warsaw') and e.at < day_end)
    on conflict (day, metric, key) do update set value = excluded.value;
end $$;

-- ===== CODZIENNIE: podsumowanie wczoraj + sprzątanie =====
create extension if not exists pg_cron;

do $$
begin
    if exists (select 1 from cron.job where jobname = 'impostor-analityka') then
        perform cron.unschedule('impostor-analityka');
    end if;
    -- 0:20 czasu UTC = po północy w Polsce (wczorajszy dzień jest już zamknięty)
    perform cron.schedule('impostor-analityka', '20 0 * * *', $job$
        select public.analytics_rollup(((now() at time zone 'Europe/Warsaw')::date - 1));
        delete from public.analytics_events where at < now() - interval '90 days';
        delete from public.analytics_visitors where last_day < (now() at time zone 'Europe/Warsaw')::date - 90;
    $job$);
end $$;
