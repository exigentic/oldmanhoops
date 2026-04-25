CREATE OR REPLACE FUNCTION public.prevent_is_admin_change_by_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND auth.uid() IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'is_admin can only be modified by the service role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER players_protect_is_admin
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.prevent_is_admin_change_by_user();
