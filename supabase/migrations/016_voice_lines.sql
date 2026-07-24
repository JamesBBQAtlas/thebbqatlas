-- ============================================================================
-- 016 · Voice bank — admin-managed house-voice microcopy (VOICE-BANK.md).
-- Lines are edited in the admin area (like the gear catalogue); no redeploy to
-- change copy. Public reads active lines; writes are service-role (admin API).
-- HARD RULE (enforced in code, not here): never used in the homepage <h1> hero
-- or the meta description.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.voice_slot AS ENUM
    ('homepage_subline','footer','empty_state','loading','not_found','newsletter_confirm','success_toast');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.voice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot        public.voice_slot NOT NULL,
  text        text NOT NULL,
  tag         text,                          -- optional key (e.g. 'ron' flagship, 'save' toast)
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_lines_slot_idx
  ON public.voice_lines (slot, sort_order) WHERE is_active;

ALTER TABLE public.voice_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.voice_lines TO anon, authenticated;
DROP POLICY IF EXISTS voice_lines_select_active ON public.voice_lines;
CREATE POLICY voice_lines_select_active
  ON public.voice_lines FOR SELECT
  TO anon, authenticated
  USING (is_active);

INSERT INTO public.voice_lines (slot, text, tag, sort_order)
SELECT v.slot::public.voice_slot, v.text, v.tag, v.sort
FROM (VALUES
  ('homepage_subline','The BBQ Atlas. A very good barbecue website. It maps barbecue.',NULL,1),
  ('homepage_subline','The BBQ Atlas. We found the barbecue. We put it on a map. You''re welcome.',NULL,2),
  ('homepage_subline','We don''t rank barbecue. We''re not monsters.',NULL,3),
  ('homepage_subline','Some maps show you roads. This one shows you brisket.',NULL,4),
  ('homepage_subline','Every great pit starts with a fire and a refusal to rush.',NULL,5),
  ('homepage_subline','We put the barbecue on a map so you''d stop scrolling and start driving.',NULL,6),
  ('homepage_subline','The world''s great barbecue. Mapped by people who took it personally.',NULL,7),
  ('footer','The BBQ Atlas. It does exactly one thing, and it does it with fire.',NULL,1),
  ('footer','Low and slow. Just like this website''s opinions about sauce.',NULL,2),
  ('footer','Built with fire, patience, and a lot of good barbecue.',NULL,3),
  ('footer','The BBQ Atlas. A very good barbecue website. It maps barbecue.','ron',4),
  ('footer','No rankings. No nonsense. Just the good stuff, plotted.',NULL,5),
  ('footer','Sauce on the side. Always the side.',NULL,6),
  ('empty_state','Nothing here yet. Even the best pits started cold.',NULL,1),
  ('empty_state','No results — the pit''s cold over here. Try a wider search.',NULL,2),
  ('empty_state','Empty plate. Let''s find you something with a bark on it.',NULL,3),
  ('empty_state','We haven''t mapped this corner yet. Know a spot? Tell us.',NULL,4),
  ('empty_state','No matches. The brisket''s out there somewhere.',NULL,5),
  ('loading','Stoking the coals…',NULL,1),
  ('loading','Low and slow… loading.',NULL,2),
  ('loading','Checking the smoke ring…',NULL,3),
  ('loading','Warming up the pit…',NULL,4),
  ('loading','Good things take time. So does this. Loading…',NULL,5),
  ('not_found','This pit''s gone cold. Let''s get you back to the fire.',NULL,1),
  ('not_found','Nothing smoking here. That page took the day off.',NULL,2),
  ('not_found','You''ve wandered past the property line. Back to the barbecue.',NULL,3),
  ('newsletter_confirm','You''re in. We''ll only ever write when it''s worth your napkin.',NULL,1),
  ('newsletter_confirm','Welcome to the pit. No spam, no selling your details, one-click out — always.',NULL,2),
  ('newsletter_confirm','Signed up. We''ll bring the barbecue to your inbox, never the other way round.',NULL,3),
  ('success_toast','Saved to your Atlas. Good taste.','save',1),
  ('success_toast','Checked in. Hope you brought napkins.','checkin',2),
  ('success_toast','Got it. We''ll take a look — good barbecue deserves a second opinion.','submit',3),
  ('success_toast','Spread the smoke.','share',4)
) AS v(slot, text, tag, sort)
WHERE NOT EXISTS (SELECT 1 FROM public.voice_lines);
