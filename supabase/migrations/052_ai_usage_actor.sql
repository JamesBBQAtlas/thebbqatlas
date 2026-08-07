-- Phase 2 (Fable M-2): attribute each AI ledger row to the admin who ran it,
-- so the 600-venue run (and every AI call) is answerable to a person.
-- Applied to prod via MCP; recorded here for version history.
alter table public.ai_usage_log
  add column if not exists user_id uuid references auth.users(id) on delete set null;
