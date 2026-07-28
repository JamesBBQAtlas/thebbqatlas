-- ============================================================================
-- 033 · Greet people by their real name, not the email prefix
--
-- handle_new_user() previously set profiles.display_name to
-- COALESCE(metadata->>'display_name', email-local-part). Google/OAuth supplies
-- the real name as full_name/name (not display_name), so every OAuth signup was
-- stored as the email prefix ("jwdoyle" for jwdoyle@gmail.com). Prefer the OAuth
-- name fields, falling back to display_name, then the email local part.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(NEW.raw_user_meta_data->>'given_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $function$;
