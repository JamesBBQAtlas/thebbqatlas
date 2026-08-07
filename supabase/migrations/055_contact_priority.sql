-- Priority-senders: flag inbound from a logged-in venue owner / premium user, and
-- link the authenticated submitter (identity from the session, never the header).
-- Applied to prod via MCP; recorded here for version history.
alter table public.contact_messages
  add column if not exists priority boolean not null default false,
  add column if not exists user_id uuid references auth.users(id) on delete set null;
