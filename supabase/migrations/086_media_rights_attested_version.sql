-- 086 — M8 (also closes checklist G4): store the VERSION of the rights/attestation
-- copy the uploader agreed to, not just a bool + timestamp. Idempotent + additive.

alter table media add column if not exists rights_attested_version text;

comment on column media.rights_attested_version is
  'Version of the rights/attestation copy the uploader agreed to at upload time (M8 / checklist G4). Null on rows created before this column.';
