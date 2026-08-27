-- Phase 7 (Controlled Beta Infrastructure Gate 1) — extend the existing
-- HR-only config-column write protection on organisations to also cover
-- uk_jurisdiction, alongside the columns it already guarded.

create or replace trigger protect_organisations_config_columns_trigger
  before update on public.organisations
  for each row execute function protect_hr_or_immutable_columns(
    'invite_code', 'notification_webhook_url', 'notification_webhook_type',
    'automation_levels', 'data_retention_years', 'name', 'uk_jurisdiction'
  );
