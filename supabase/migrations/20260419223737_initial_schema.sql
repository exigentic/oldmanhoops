-- players: profile data linked to auth.users (email lives in auth.users)
CREATE TABLE public.players (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  phone text,
  reminder_email boolean NOT NULL DEFAULT true,
  reminder_sms boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- games: one row per play day
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  status_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- rsvps: one per (game, player)
CREATE TABLE public.rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('in', 'out', 'maybe')),
  guests integer NOT NULL DEFAULT 0 CHECK (guests >= 0 AND guests <= 10),
  note text CHECK (note IS NULL OR char_length(note) <= 100),
  responded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id)
);
