-- Per-pass research diagnostics (raw parsed dossier + usage for each research
-- pass) so a "read the pages but extracted nothing" result is inspectable at a
-- glance — we can see exactly what each Grok pass returned vs what got stored.
alter table restaurants add column if not exists enrichment_debug jsonb;
