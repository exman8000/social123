ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE public.profiles
   SET username = 'user_' || substring(replace(id::text, '-', ''), 1, 12)
 WHERE username IS NULL OR btrim(username) = '';

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx
  ON public.profiles (lower(username));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format_check
  CHECK (username ~ '^[A-Za-z0-9_]{3,20}$');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username TEXT;
BEGIN
  v_username := lower(COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    'user_' || substring(replace(NEW.id::text, '-', ''), 1, 12)
  ));

  INSERT INTO public.profiles (
    id, email, display_name, username, avatar_url, coins, gems, level
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(COALESCE(NEW.email, ''), '@', 1),
      'Criador Luzenne'
    ),
    v_username,
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
    ),
    2450,
    180,
    1
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username;

  RETURN NEW;
END;
$$;
