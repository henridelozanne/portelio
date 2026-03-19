-- Migration 002 — Ajout des colonnes et tables manquantes en production
-- Sécurisé : utilise IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

-- ============================================================
-- TABLE : users — colonnes manquantes
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS device_token  text,
  ADD COLUMN IF NOT EXISTS is_premium    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz NOT NULL DEFAULT now();

-- RLS policies (recréées si absentes)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users: select own" ON public.users
    FOR SELECT USING (auth.uid() = auth_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users: insert own" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = auth_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users: update own" ON public.users
    FOR UPDATE USING (auth.uid() = auth_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLE : pairs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pairs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_b_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_pair CHECK (user_a_id <> user_b_id)
);

ALTER TABLE public.pairs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "pairs: select own" ON public.pairs
    FOR SELECT USING (
      auth.uid() = (SELECT auth_id FROM public.users WHERE id = user_a_id)
      OR
      auth.uid() = (SELECT auth_id FROM public.users WHERE id = user_b_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLE : invitations
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status      invitation_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "invitations: select own" ON public.invitations
    FOR SELECT USING (
      auth.uid() = (SELECT auth_id FROM public.users WHERE id = inviter_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "invitations: insert own" ON public.invitations
    FOR INSERT WITH CHECK (
      auth.uid() = (SELECT auth_id FROM public.users WHERE id = inviter_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "invitations: read by token" ON public.invitations
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLE : photos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id       uuid NOT NULL REFERENCES public.pairs(id) ON DELETE CASCADE,
  sender_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  caption       text CHECK (char_length(caption) <= 50),
  sent_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "photos: select from own pairs" ON public.photos
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.pairs p
        JOIN public.users u ON (u.id = p.user_a_id OR u.id = p.user_b_id)
        WHERE p.id = pair_id AND u.auth_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
