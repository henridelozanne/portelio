-- ============================================================
-- Migration 001 — Schéma initial Portelio
-- À exécuter dans Supabase > SQL Editor > New query
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLE : users
-- ============================================================
create table public.users (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid unique not null,          -- lié à auth.users.id
  username      text not null,
  device_token  text,                          -- APNs token
  is_premium    boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.users enable row level security;

-- Chaque user ne voit et ne modifie que son propre profil
create policy "users: select own" on public.users
  for select using (auth.uid() = auth_id);

create policy "users: insert own" on public.users
  for insert with check (auth.uid() = auth_id);

create policy "users: update own" on public.users
  for update using (auth.uid() = auth_id);

-- ============================================================
-- TABLE : pairs
-- ============================================================
create table public.pairs (
  id          uuid primary key default gen_random_uuid(),
  user_a_id   uuid not null references public.users(id) on delete cascade,
  user_b_id   uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint no_self_pair check (user_a_id <> user_b_id)
);

alter table public.pairs enable row level security;

-- Un user ne voit que les paires dont il fait partie
create policy "pairs: select own" on public.pairs
  for select using (
    auth.uid() = (select auth_id from public.users where id = user_a_id)
    or
    auth.uid() = (select auth_id from public.users where id = user_b_id)
  );

-- ============================================================
-- TABLE : invitations
-- ============================================================
create type invitation_status as enum ('pending', 'accepted', 'expired');

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references public.users(id) on delete cascade,
  token       text unique not null default encode(gen_random_bytes(16), 'hex'),
  status      invitation_status not null default 'pending',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);

alter table public.invitations enable row level security;

-- L'inviteur peut voir et créer ses invitations
create policy "invitations: select own" on public.invitations
  for select using (
    auth.uid() = (select auth_id from public.users where id = inviter_id)
  );

create policy "invitations: insert own" on public.invitations
  for insert with check (
    auth.uid() = (select auth_id from public.users where id = inviter_id)
  );

-- N'importe quel user authentifié peut lire une invitation par token (pour accepter)
create policy "invitations: read by token" on public.invitations
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- TABLE : photos
-- ============================================================
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  pair_id       uuid not null references public.pairs(id) on delete cascade,
  sender_id     uuid not null references public.users(id) on delete cascade,
  storage_path  text not null,
  caption       text check (char_length(caption) <= 50),
  sent_at       timestamptz not null default now()
);

alter table public.photos enable row level security;

-- Un user ne voit que les photos des paires dont il fait partie
create policy "photos: select from own pairs" on public.photos
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and (
          auth.uid() = (select auth_id from public.users where id = p.user_a_id)
          or
          auth.uid() = (select auth_id from public.users where id = p.user_b_id)
        )
    )
  );

create policy "photos: insert own" on public.photos
  for insert with check (
    auth.uid() = (select auth_id from public.users where id = sender_id)
  );

-- ============================================================
-- INDEX utiles
-- ============================================================
create index on public.photos (pair_id, sent_at desc);
create index on public.invitations (token) where status = 'pending';
create index on public.pairs (user_a_id);
create index on public.pairs (user_b_id);

-- ============================================================
-- GRANTS — permissions pour les rôles Supabase
-- ============================================================
grant select, insert, update on public.users to authenticated;
grant select, insert on public.pairs to authenticated;
grant select, insert, update on public.invitations to authenticated;
grant select, insert on public.photos to authenticated;
