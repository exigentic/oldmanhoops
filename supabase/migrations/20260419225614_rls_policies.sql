-- Enable RLS on all three tables
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;

-- players: any authenticated user can SELECT; only own row can be updated/deleted.
-- INSERT is not allowed here (service role inserts via signup trigger).
CREATE POLICY players_select_authenticated ON public.players
  FOR SELECT TO authenticated USING (true);

CREATE POLICY players_update_own ON public.players
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY players_delete_own ON public.players
  FOR DELETE TO authenticated USING (auth.uid() = id);

-- games: anyone (including anon) can SELECT; writes are service role only.
CREATE POLICY games_select_anyone ON public.games
  FOR SELECT USING (true);

-- rsvps: anyone can SELECT (app layer filters visitor vs member views);
-- users write only their own rows.
CREATE POLICY rsvps_select_anyone ON public.rsvps
  FOR SELECT USING (true);

CREATE POLICY rsvps_insert_own ON public.rsvps
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

CREATE POLICY rsvps_update_own ON public.rsvps
  FOR UPDATE TO authenticated USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

CREATE POLICY rsvps_delete_own ON public.rsvps
  FOR DELETE TO authenticated USING (auth.uid() = player_id);
