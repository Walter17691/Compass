-- Process Intelligence Phase 3 (P18, §15) — org-configurable ER process
-- templates: a saved bundle of required documents, suggested meetings,
-- default tasks, a linked policy category, suggested roles to fill, and a
-- target timescale (overriding P17's DEFAULT_STAGE_TARGET_DAYS for this
-- process type when set) — one row per (org, process type). process_type
-- is free text matching processStages.js's PROCESS_TYPES ids, not an enum,
-- same reasoning as case_access.role (P8): a fixed Postgres enum can't be
-- extended without a migration, and this project already has a working
-- single source of truth for the valid id list in application code.
CREATE TABLE IF NOT EXISTS public.process_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  process_type text NOT NULL,
  required_documents jsonb NOT NULL DEFAULT '[]',
  suggested_meetings jsonb NOT NULL DEFAULT '[]',
  default_tasks jsonb NOT NULL DEFAULT '[]',
  suggested_role_ids jsonb NOT NULL DEFAULT '[]',
  policy_category text,
  target_days integer,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT process_templates_pkey PRIMARY KEY (id),
  CONSTRAINT process_templates_org_id_process_type_key UNIQUE (org_id, process_type),
  CONSTRAINT process_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

ALTER TABLE public.process_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY process_templates_same_org ON public.process_templates FOR ALL
  USING (org_id IN (SELECT my_org_ids())) WITH CHECK (org_id IN (SELECT my_org_ids()));
