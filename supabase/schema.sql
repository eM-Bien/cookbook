-- Książka kucharska — schemat bazy (Supabase / Postgres).
-- Wklej całość w Supabase → SQL Editor i uruchom. Skrypt można uruchamiać wielokrotnie.
--
-- PO URUCHOMIENIU dodaj swoje dwa adresy e-mail (patrz koniec pliku).

-- ---------------------------------------------------------------------------
-- Dostęp: tylko adresy z tej tabeli widzą i zmieniają dane
-- ---------------------------------------------------------------------------

create table if not exists public.allowed_emails (
  email text primary key
);

-- RLS bez żadnych polityk = tabela niedostępna przez API, tylko z SQL Editora.
alter table public.allowed_emails enable row level security;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.allowed_emails a
    where lower(a.email) = lower(auth.jwt() ->> 'email')
  );
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- ---------------------------------------------------------------------------
-- Profile (nazwa wyświetlana przy komentarzach)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Użytkownik'
    ), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Konta założone przed uruchomieniem skryptu.
insert into public.profiles (id, display_name)
select u.id, left(coalesce(nullif(split_part(u.email, '@', 1), ''), 'Użytkownik'), 60)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Logowanie samym adresem e-mail
-- ---------------------------------------------------------------------------

-- Pyta o adres wpisany na stronie logowania. Dostępne tylko dla serwera
-- aplikacji (klucz "secret"), nigdy dla przeglądarki.
create or replace function public.login_lookup(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed', exists (
      select 1 from public.allowed_emails a
      where lower(a.email) = lower(trim(p_email))
    ),
    'has_account', exists (
      select 1 from auth.users u
      where lower(u.email) = lower(trim(p_email))
    ),
    'name', (
      select p.display_name
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(u.email) = lower(trim(p_email))
      limit 1
    )
  );
$$;

revoke all on function public.login_lookup(text) from public, anon, authenticated;
grant execute on function public.login_lookup(text) to service_role;

-- ---------------------------------------------------------------------------
-- Przepisy
-- ---------------------------------------------------------------------------

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  servings integer not null default 2 check (servings between 1 and 100),
  prep_minutes integer check (prep_minutes is null or prep_minutes between 0 and 10000),
  source_url text,
  image_url text,
  tags text[] not null default '{}',
  steps text[] not null default '{}',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position integer not null default 0,
  name text not null check (char_length(name) between 1 and 200),
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  category text not null default 'inne'
);

create index if not exists recipe_ingredients_recipe_idx
  on public.recipe_ingredients (recipe_id, position);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

-- ---------------------------------------------------------------------------
-- Ulubione (każda osoba ma swoje serduszka)
-- ---------------------------------------------------------------------------

create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

alter table public.favorites enable row level security;

-- ---------------------------------------------------------------------------
-- Kalendarz posiłków
-- ---------------------------------------------------------------------------

create table if not exists public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  meal_type text not null default 'obiad'
    check (meal_type in ('sniadanie', 'obiad', 'kolacja', 'przekaska')),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  servings integer not null check (servings between 1 and 100),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists meal_plan_date_idx on public.meal_plan (plan_date);

alter table public.meal_plan enable row level security;

-- ---------------------------------------------------------------------------
-- Komentarze do przepisów
-- ---------------------------------------------------------------------------

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_recipe_idx on public.comments (recipe_id, created_at);

alter table public.comments enable row level security;

-- ---------------------------------------------------------------------------
-- Lista zakupów
-- ---------------------------------------------------------------------------

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  date_from date not null,
  date_to date not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_to >= date_from)
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  category text not null default 'inne',
  -- Z jakich przepisów pochodzi pozycja (puste dla dopisanych ręcznie).
  sources text[] not null default '{}',
  checked boolean not null default false,
  is_manual boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shopping_items_list_idx on public.shopping_items (list_id);

-- ---------------------------------------------------------------------------
-- Kolumny dodane po pierwszej wersji (bezpieczne przy ponownym uruchomieniu)
-- ---------------------------------------------------------------------------

alter table public.recipes
  add column if not exists calories integer
    check (calories is null or calories between 0 and 10000),
  -- Na jakie posiłki nadaje się przepis; pusta lista = na każdy.
  add column if not exists meal_types text[] not null default '{}'
    check (meal_types <@ array['sniadanie', 'obiad', 'kolacja', 'przekaska']),
  add column if not exists notes text,
  -- Kroki dla Thermomiksa (pusta lista = brak wersji TM).
  add column if not exists thermomix_steps text[] not null default '{}';

alter table public.recipe_ingredients
  -- Miara domowa obok wagi, np. 4 łyżki przy 40 g.
  add column if not exists alt_quantity numeric
    check (alt_quantity is null or alt_quantity >= 0),
  add column if not exists alt_unit text,
  -- Część przepisu, do której należy składnik, np. "Marynata".
  add column if not exists group_name text;

alter table public.shopping_items
  add column if not exists alt_quantity numeric
    check (alt_quantity is null or alt_quantity >= 0),
  add column if not exists alt_unit text;

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

-- ---------------------------------------------------------------------------
-- Polityki RLS
-- ---------------------------------------------------------------------------

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated
  using (public.is_member());

drop policy if exists "members update own profile" on public.profiles;
create policy "members update own profile" on public.profiles
  for update to authenticated
  using (public.is_member() and id = (select auth.uid()))
  with check (public.is_member() and id = (select auth.uid()));

drop policy if exists "members manage recipes" on public.recipes;
create policy "members manage recipes" on public.recipes
  for all to authenticated
  using (public.is_member())
  with check (public.is_member());

drop policy if exists "members manage recipe ingredients" on public.recipe_ingredients;
create policy "members manage recipe ingredients" on public.recipe_ingredients
  for all to authenticated
  using (public.is_member())
  with check (public.is_member());

drop policy if exists "members read favorites" on public.favorites;
create policy "members read favorites" on public.favorites
  for select to authenticated
  using (public.is_member());

drop policy if exists "members add own favorites" on public.favorites;
create policy "members add own favorites" on public.favorites
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));

drop policy if exists "members remove own favorites" on public.favorites;
create policy "members remove own favorites" on public.favorites
  for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

drop policy if exists "members manage meal plan" on public.meal_plan;
create policy "members manage meal plan" on public.meal_plan
  for all to authenticated
  using (public.is_member())
  with check (public.is_member());

drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments
  for select to authenticated
  using (public.is_member());

drop policy if exists "members add own comments" on public.comments;
create policy "members add own comments" on public.comments
  for insert to authenticated
  with check (public.is_member() and author_id = (select auth.uid()));

drop policy if exists "members edit own comments" on public.comments;
create policy "members edit own comments" on public.comments
  for update to authenticated
  using (public.is_member() and author_id = (select auth.uid()))
  with check (public.is_member() and author_id = (select auth.uid()));

drop policy if exists "members delete own comments" on public.comments;
create policy "members delete own comments" on public.comments
  for delete to authenticated
  using (public.is_member() and author_id = (select auth.uid()));

drop policy if exists "members manage shopping lists" on public.shopping_lists;
create policy "members manage shopping lists" on public.shopping_lists
  for all to authenticated
  using (public.is_member())
  with check (public.is_member());

drop policy if exists "members manage shopping items" on public.shopping_items;
create policy "members manage shopping items" on public.shopping_items
  for all to authenticated
  using (public.is_member())
  with check (public.is_member());

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update, delete on
  public.recipes,
  public.recipe_ingredients,
  public.meal_plan,
  public.comments,
  public.shopping_lists,
  public.shopping_items
to authenticated;

-- ---------------------------------------------------------------------------
-- Waga (każda osoba prowadzi własny dziennik; drugiej osoby nie widać)
-- ---------------------------------------------------------------------------

create table if not exists public.weights (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null,
  kg numeric(5, 2) not null check (kg between 20 and 400),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.weights enable row level security;

drop policy if exists "own weights" on public.weights;
create policy "own weights" on public.weights
  for all to authenticated
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

grant select, insert, update, delete on public.weights to authenticated;

-- ---------------------------------------------------------------------------
-- Zapisy wielotabelowe w jednej transakcji (wywoływane z aplikacji przez RPC)
-- ---------------------------------------------------------------------------

-- Zapisuje przepis razem ze składnikami. p_id = null tworzy nowy przepis.
create or replace function public.save_recipe(
  p_id uuid,
  p_recipe jsonb,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_tags text[];
  v_steps text[];
  v_thermomix text[];
  v_meal_types text[];
begin
  select coalesce(array_agg(t.value order by t.ord), '{}')
    into v_meal_types
    from jsonb_array_elements_text(coalesce(p_recipe -> 'meal_types', '[]'::jsonb))
      with ordinality as t(value, ord);

  select coalesce(array_agg(t.value order by t.ord), '{}')
    into v_tags
    from jsonb_array_elements_text(coalesce(p_recipe -> 'tags', '[]'::jsonb))
      with ordinality as t(value, ord);

  select coalesce(array_agg(t.value order by t.ord), '{}')
    into v_steps
    from jsonb_array_elements_text(coalesce(p_recipe -> 'steps', '[]'::jsonb))
      with ordinality as t(value, ord);

  select coalesce(array_agg(t.value order by t.ord), '{}')
    into v_thermomix
    from jsonb_array_elements_text(coalesce(p_recipe -> 'thermomix_steps', '[]'::jsonb))
      with ordinality as t(value, ord);

  if p_id is null then
    insert into public.recipes
      (title, description, servings, prep_minutes, calories, source_url, image_url,
       tags, steps, meal_types, notes, thermomix_steps)
    values (
      p_recipe ->> 'title',
      nullif(p_recipe ->> 'description', ''),
      (p_recipe ->> 'servings')::integer,
      (p_recipe ->> 'prep_minutes')::integer,
      (p_recipe ->> 'calories')::integer,
      nullif(p_recipe ->> 'source_url', ''),
      nullif(p_recipe ->> 'image_url', ''),
      v_tags,
      v_steps,
      v_meal_types,
      nullif(p_recipe ->> 'notes', ''),
      v_thermomix
    )
    returning id into v_id;
  else
    update public.recipes set
      title = p_recipe ->> 'title',
      description = nullif(p_recipe ->> 'description', ''),
      servings = (p_recipe ->> 'servings')::integer,
      prep_minutes = (p_recipe ->> 'prep_minutes')::integer,
      calories = (p_recipe ->> 'calories')::integer,
      source_url = nullif(p_recipe ->> 'source_url', ''),
      image_url = nullif(p_recipe ->> 'image_url', ''),
      tags = v_tags,
      steps = v_steps,
      meal_types = v_meal_types,
      notes = nullif(p_recipe ->> 'notes', ''),
      thermomix_steps = v_thermomix,
      updated_at = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Nie znaleziono przepisu %', p_id;
    end if;

    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients
    (recipe_id, position, name, quantity, unit, category, alt_quantity, alt_unit, group_name)
  select
    v_id,
    (t.ord - 1)::integer,
    t.item ->> 'name',
    (t.item ->> 'quantity')::numeric,
    nullif(t.item ->> 'unit', ''),
    coalesce(nullif(t.item ->> 'category', ''), 'inne'),
    (t.item ->> 'alt_quantity')::numeric,
    nullif(t.item ->> 'alt_unit', ''),
    nullif(t.item ->> 'group_name', '')
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
    with ordinality as t(item, ord);

  return v_id;
end;
$$;

-- Podmienia pozycje listy zakupów wyliczone z kalendarza.
-- p_reset = true: nowa lista (usuwa też pozycje dopisane ręcznie).
-- p_reset = false: odświeżenie — pozycje ręczne zostają.
create or replace function public.set_shopping_list(
  p_from date,
  p_to date,
  p_items jsonb,
  p_reset boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select l.id into v_id
  from public.shopping_lists l
  order by l.created_at desc
  limit 1;

  if v_id is null then
    insert into public.shopping_lists (date_from, date_to)
    values (p_from, p_to)
    returning id into v_id;
  else
    update public.shopping_lists
      set date_from = p_from, date_to = p_to, updated_at = now()
      where id = v_id;
    delete from public.shopping_lists where id <> v_id;
  end if;

  delete from public.shopping_items
  where list_id = v_id and (p_reset or not is_manual);

  insert into public.shopping_items
    (list_id, name, quantity, unit, alt_quantity, alt_unit, category, sources, checked)
  select
    v_id,
    t.item ->> 'name',
    (t.item ->> 'quantity')::numeric,
    nullif(t.item ->> 'unit', ''),
    (t.item ->> 'alt_quantity')::numeric,
    nullif(t.item ->> 'alt_unit', ''),
    coalesce(nullif(t.item ->> 'category', ''), 'inne'),
    coalesce(
      (select array_agg(s.value order by s.ord)
         from jsonb_array_elements_text(coalesce(t.item -> 'sources', '[]'::jsonb))
           with ordinality as s(value, ord)),
      '{}'
    ),
    coalesce((t.item ->> 'checked')::boolean, false)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    with ordinality as t(item, ord);

  return v_id;
end;
$$;

revoke all on function public.save_recipe(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.set_shopping_list(date, date, jsonb, boolean) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.set_shopping_list(date, date, jsonb, boolean) to authenticated;

-- Import przepisów (scripts/import-notion.ts) działa z kluczem "secret".
grant select, insert, update, delete on
  public.recipes,
  public.recipe_ingredients,
  public.meal_plan
to service_role;

-- ---------------------------------------------------------------------------
-- Synchronizacja na żywo (lista zakupów, komentarze, kalendarz)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['shopping_items', 'shopping_lists', 'comments', 'meal_plan'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- NA KONIEC: wpisz swoje adresy e-mail i uruchom (odkomentuj):
-- ---------------------------------------------------------------------------
-- insert into public.allowed_emails (email) values
--   ('pierwsza.osoba@example.com'),
--   ('druga.osoba@example.com')
-- on conflict do nothing;
