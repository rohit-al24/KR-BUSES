-- Drop and recreate student_bus_details for a clean schema
drop table if exists public.student_bus_details cascade;
create table public.student_bus_details (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  year int not null,
  boarding_point_id uuid not null references public.bus_stops(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  bus_id uuid not null references public.buses(id) on delete restrict,
  gender text check (gender in ('male','female')),
  fees_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, year)
);


create index if not exists sbd_student_idx on public.student_bus_details(student_id);
create index if not exists sbd_year_idx on public.student_bus_details(year);
create index if not exists sbd_route_idx on public.student_bus_details(route_id);
create index if not exists sbd_bus_idx on public.student_bus_details(bus_id);


drop trigger if exists trg_sbd_updated_at on public.student_bus_details;
create trigger trg_sbd_updated_at
before update on public.student_bus_details
for each row execute procedure public.set_updated_at();

alter table public.student_bus_details enable row level security;

drop policy if exists "Admin write student_bus_details" on public.student_bus_details;
create policy "Admin write student_bus_details" on public.student_bus_details for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
-- Supabase migration SQL for Bus Buddy Allocator (Auth + Profiles)
-- Execute in the Supabase SQL editor or with `supabase db push`.

-- 0) Helpers ---------------------------------------------------------------
create extension if not exists pgcrypto; -- for gen_random_uuid()

-- 1) Enum for roles --------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('student','coordinator','staff','admin');
exception when duplicate_object then null; end $$;

-- 2) Profiles table (1:1 with auth.users) ---------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role public.user_role not null default 'student',
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_role_idx on public.profiles (role);

-- 3) Updated_at trigger ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- 4) Bootstrap profile on new auth user -----------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end; $$;

do $$ begin
  -- trigger runs when a new row is inserted into auth.users
  create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
exception when duplicate_object then null; end $$;

-- 5) RLS policies ---------------------------------------------------------
alter table public.profiles enable row level security;

-- Everyone authenticated can read profiles (adjust for stricter privacy)
drop policy if exists "Profiles are viewable by authenticated" on public.profiles;
create policy "Profiles are viewable by authenticated"
  on public.profiles for select
  using (auth.role() = 'anon' is not true);

-- Users can insert their own profile (usually created by trigger above)
drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can update their own profile
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Admins can do anything on profiles
drop policy if exists "Admins full access" on public.profiles;
create policy "Admins full access"
  on public.profiles for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- insert sample profile row for a known user id (replace UUID below):
-- insert into public.profiles (id, email, full_name, role, paid)
-- values ('00000000-0000-0000-0000-000000000000','demo@example.com','Demo User','student', true)
-- 7) Bus allocation schema ------------------------------------------------
-- Tables: bus_stops, routes, route_stops (junction), buses, bus_assignments

-- bus_stops: master list of pickup/drop points
create table if not exists public.bus_stops (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- buses: physical buses
create table if not exists public.buses (
  id uuid primary key default gen_random_uuid(),
  bus_number text not null unique, -- e.g. '7', '16'
  capacity int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- routes: logical path created by admin
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- e.g. 'Chitram to TV kovil'
  created_at timestamptz not null default now()
);
create index if not exists routes_name_idx on public.routes (name);

-- route_stops: ordered stops per route
create table if not exists public.route_stops (
  route_id uuid references public.routes(id) on delete cascade,
  stop_id uuid references public.bus_stops(id) on delete cascade,
  position int not null, -- ordering
  primary key (route_id, stop_id)
);
create index if not exists route_stops_route_idx on public.route_stops(route_id);

-- bus_assignments: which bus serves which route, including substitute
create table if not exists public.bus_assignments (
  route_id uuid primary key references public.routes(id) on delete cascade,
  primary_bus_id uuid references public.buses(id) on delete set null,
  substitute_bus_id uuid references public.buses(id) on delete set null,
  primary_active boolean not null default true, -- if false use substitute
  updated_at timestamptz not null default now()
);

create or replace function public.bus_assignments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_bus_assignments_updated on public.bus_assignments;
create trigger trg_bus_assignments_updated
before update on public.bus_assignments
for each row execute procedure public.bus_assignments_set_updated_at();

-- Enable RLS & policies ---------------------------------------------------
alter table public.bus_stops enable row level security;
alter table public.buses enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.bus_assignments enable row level security;

-- Helper expression for admin check via JWT role/app_metadata.role
-- NOTE: reused logic; cannot create policy macro so inline each.

-- Read policies: allow any authenticated user to read (students need to view)
drop policy if exists "Read bus_stops" on public.bus_stops;
create policy "Read bus_stops" on public.bus_stops for select using (auth.role() <> 'anon');

drop policy if exists "Read buses" on public.buses;
create policy "Read buses" on public.buses for select using (auth.role() <> 'anon');

drop policy if exists "Read routes" on public.routes;
create policy "Read routes" on public.routes for select using (auth.role() <> 'anon');

drop policy if exists "Read route_stops" on public.route_stops;
create policy "Read route_stops" on public.route_stops for select using (auth.role() <> 'anon');

drop policy if exists "Read bus_assignments" on public.bus_assignments;
create policy "Read bus_assignments" on public.bus_assignments for select using (auth.role() <> 'anon');

-- Admin write policies
drop policy if exists "Admin write bus_stops" on public.bus_stops;
create policy "Admin write bus_stops" on public.bus_stops for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admin write buses" on public.buses;
create policy "Admin write buses" on public.buses for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admin write routes" on public.routes;
create policy "Admin write routes" on public.routes for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admin write route_stops" on public.route_stops;
create policy "Admin write route_stops" on public.route_stops for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admin write bus_assignments" on public.bus_assignments;
create policy "Admin write bus_assignments" on public.bus_assignments for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


-- 8) Students table (custom auth via plaintext password as requested) ------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  roll_no text not null unique,
  email text unique,
  full_name text not null,
  class text,
  section text,
  password text not null, -- plaintext per request (recommend hashing later)
  route_id uuid references public.routes(id) on delete set null,
  stop_id uuid references public.bus_stops(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Temporary gender column (male/female) for students
alter table public.students add column if not exists gender text check (gender in ('male','female')); -- nullable for existing rows

create table if not exists public.student_bus_details (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  year int not null,
  boarding_point_id uuid not null references public.bus_stops(id) on delete restrict,
  bus_id uuid not null references public.buses(id) on delete restrict,
  gender text check (gender in ('male','female')),
  fees_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sbd_student_idx on public.student_bus_details(student_id);
create index if not exists sbd_year_idx on public.student_bus_details(year);

drop trigger if exists trg_sbd_updated_at on public.student_bus_details;
create trigger trg_sbd_updated_at
before update on public.student_bus_details
for each row execute procedure public.set_updated_at();

alter table public.student_bus_details enable row level security;

-- Admin full access to student_bus_details
drop policy if exists "Admin write student_bus_details" on public.student_bus_details;
create policy "Admin write student_bus_details" on public.student_bus_details for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- RPC: get_student_bus_details(student_id, year) -> details for dashboard
drop function if exists public.get_student_bus_details(uuid, int);
create function public.get_student_bus_details(p_student_id uuid, p_year int)
returns table (
  id uuid,
  student_id uuid,
  year int,
  boarding_point_id uuid,
  boarding_point_name text,
  bus_id uuid,
  gender text,
  fees_paid boolean
) language sql security definer set search_path = public as $$
  select sbd.id, sbd.student_id, sbd.year, sbd.boarding_point_id, bs.name as boarding_point_name, sbd.bus_id, sbd.gender, sbd.fees_paid
  from public.student_bus_details sbd
  join public.bus_stops bs on bs.id = sbd.boarding_point_id
  where sbd.student_id = p_student_id and sbd.year = p_year
  limit 1;
$$;

grant execute on function public.get_student_bus_details(uuid, int) to anon, authenticated;

create index if not exists students_roll_idx on public.students(roll_no);
create index if not exists students_email_idx on public.students(email);
create index if not exists students_route_idx on public.students(route_id);

drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at
before update on public.students
for each row execute procedure public.set_updated_at();

alter table public.students enable row level security;

-- Admin full access to students
drop policy if exists "Admin write students" on public.students;
create policy "Admin write students" on public.students for all
  using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Do NOT expose generic select to everyone; instead provide RPC for login

-- RPC: student_login(identifier, pass) -> limited student row
-- Drop the previous version explicitly to allow changing OUT parameters
drop function if exists public.student_login(text, text);

create function public.student_login(identifier text, pass text)
returns table (
  id uuid,
  roll_no text,
  email text,
  full_name text,
  class text,
  section text,
  gender text,
  route_id uuid,
  stop_id uuid
) language sql security definer set search_path = public as $$
  select s.id, s.roll_no, s.email, s.full_name, s.class, s.section, s.gender, s.route_id, s.stop_id
  from public.students s
  where s.roll_no = identifier
    and s.password = pass
  limit 1;
$$;

grant execute on function public.student_login(text, text) to anon, authenticated;

-- RPC: get_route_overview(route_id) -> route, stops, assignment, buses
create or replace function public.get_route_overview(p_route_id uuid)
returns table (
  route_id uuid,
  route_name text,
  stops jsonb,
  assignment jsonb,
  primary_bus jsonb,
  substitute_bus jsonb,
  current_bus jsonb
) language plpgsql security definer set search_path = public as $$
declare
  a record;
  r record;
  primary_b record;
  sub_b record;
  current_b record;
  stops_arr jsonb;
begin
  select * into r from public.routes where id = p_route_id;
  if not found then
    return;
  end if;

  select jsonb_agg(jsonb_build_object('id', bs.id, 'name', bs.name, 'position', rs.position) order by rs.position)
    into stops_arr
  from public.route_stops rs
  join public.bus_stops bs on bs.id = rs.stop_id
  where rs.route_id = p_route_id;

  select * into a from public.bus_assignments where route_id = p_route_id;
  if a.primary_bus_id is not null then
    select * into primary_b from public.buses where id = a.primary_bus_id;
  end if;
  if a.substitute_bus_id is not null then
    select * into sub_b from public.buses where id = a.substitute_bus_id;
  end if;

  if a.primary_active is true then
    current_b := coalesce(primary_b, sub_b);
  else
    current_b := coalesce(sub_b, primary_b);
  end if;

  return query
  select r.id as route_id,
         r.name as route_name,
         coalesce(stops_arr, '[]'::jsonb) as stops,
         to_jsonb(a) as assignment,
         to_jsonb(primary_b) as primary_bus,
         to_jsonb(sub_b) as substitute_bus,
         to_jsonb(current_b) as current_bus;
end;
$$;

grant execute on function public.get_route_overview(uuid) to anon, authenticated;

-- Check columns
