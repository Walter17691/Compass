-- Phase 7 (Controlled Beta Infrastructure Gate 1) — per-org UK bank-holiday
-- calendar setting, mirroring the existing data_retention_years pattern.
-- NULL means "use the application default" (england-and-wales) rather than
-- forcing every existing org to explicitly opt into a value.

alter table public.organisations
  add column uk_jurisdiction text;

alter table public.organisations
  add constraint organisations_uk_jurisdiction_check
  check (uk_jurisdiction is null or uk_jurisdiction = any (array['england-and-wales', 'scotland', 'northern-ireland']));

comment on column public.organisations.uk_jurisdiction is
  'Which UK bank-holiday calendar this org''s ACAS working-day deadlines should use. NULL = england-and-wales (the application default).';
