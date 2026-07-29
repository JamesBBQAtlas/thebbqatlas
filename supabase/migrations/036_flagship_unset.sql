-- When a chain is detected but the true flagship can't be confidently
-- auto-determined, every member of that chain is marked flagship_unset until a
-- human picks the original. No location claims to be the flagship while this is
-- true, and the confident gold FLAGSHIP badge is suppressed.
alter table restaurants add column if not exists flagship_unset boolean not null default false;
