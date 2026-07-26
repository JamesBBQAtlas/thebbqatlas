-- ============================================================================
-- 027 · "Needs attention" flag (enrichment v3)
--
-- When the Grok dossier is too thin to write an honest venue page, the pipeline
-- marks the venue needs_attention (with a short reason) and keeps it in the
-- pending queue rather than publishing a padded/invented page. A boolean (not a
-- new status enum value) so the venue stays a normal draft — just flagged.
-- ============================================================================
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attention_reason text;
