# Applied migration — B3 A3b versioned-case legacy report protection, 2026-10-11

Application record for the migration that stops a legacy AI-generated
investigation report being stored on a case that has moved to versioned
authoring but has not adopted anything yet.

The SQL artefact is committed byte-for-byte as it ran and is not edited to
record its own application; this file carries that.

## The artefact

| | |
|---|---|
| File | `supabase/versioned_case_legacy_report_protection_2026-10-11.sql` |
| SHA-256 | `b0f6db90543a0d363692e83d5636aa4b298b3bd0a17ba6bd6967b5e7c01a0f73` |
| Lines | 226 |
| Project | **`npeegfsoijhdnnvuqjin` — "Compass", PRODUCTION** |
| Baseline taken | 2026-10-11 19:41:24Z |
| Applied | **2026-10-11 19:43:06Z**, once, single transaction, no error |
| Result | committed; all 13 post-application checks passed |

Target identity was confirmed before applying by three markers unique to
production: the Compass LTD organisation, the protected UAT case, and the
`platform_admins` row.

The in-transaction drift guard passed on A1, the adoption RPC, the save RPC,
both A3a functions, the presence of `cases.report_regime`, **and** the trigger
name ordering it depends on.

## The gap this closes

A1 refuses a write to `cases.investigation_report` that is not the body of the
case's **current adopted** version. A case that has moved to versioned
authoring but adopted nothing — no versions at all, or drafts saved and none
adopted — has no adopted version, so A1 stands down and the legacy generator
writes freely.

That matters because of **where the generator commits**:
`concludeInvestigation` persists the report in its own transaction and only
then calls `requestHrReview`. A rule on the HR Review insert would always
arrive after the report was already on the case. The refusal has to happen at
the write.

## Two guards, mutually exclusive by condition

| | Acts when | Rule |
|---|---|---|
| **A1** (unchanged, `85ba380f71d56ecf66daa2441d97dbdf`) | a current adopted version EXISTS | the write must equal that version's body |
| **A3b** (this one) | the case is `versioned` and NO current adopted version exists | refuse any write |

Each stands down exactly where the other acts, so they cannot contend. That is
why A1 needed no modification, keeps its hash and keeps its tests, and why the
order between them is cosmetic.

## Objects created

```
function public.protect_versioned_case_legacy_report()
    SECURITY DEFINER · owner postgres · search_path=public
    EXECUTE: anon=false, authenticated=false, service_role=true
    md5 64e43642a994499687780a3719c121c0

trigger protect_zza_versioned_legacy_report_ins_trg
    BEFORE INSERT ON public.cases FOR EACH ROW
    WHEN (coalesce(btrim(new.investigation_report), '') <> '')

trigger protect_zza_versioned_legacy_report_upd_trg
    BEFORE UPDATE ON public.cases FOR EACH ROW
    WHEN (new.investigation_report IS DISTINCT FROM old.investigation_report)
```

No table, no column, no policy, no row written.

### Counts

```
functions 89 → 90      tables 47 (unchanged)      policies 99 (unchanged)
triggers  cases 12 → 14            organisations 3 (unchanged)
```

## Trigger ordering — asserted, not assumed

```
INSERT:  … → protect_zz_stamp_report_regime_trg   (A3a sets report_regime)
            → protect_zza_versioned_legacy_report_ins_trg   (A3b reads it)

UPDATE:  protect_z_adopted_investigation_report_trg   = O   (A1)
      →  protect_zz_case_report_regime_trg            = O   (A3a)
      →  protect_zza_versioned_legacy_report_upd_trg  = O   (A3b)
```

The INSERT order is load-bearing and is asserted **inside the migration's own
drift guard**: `_` (0x5F) sorts before `a` (0x61), so `protect_zz_stamp…` <
`protect_zza_…`. Run the other way, A3b would read `report_regime` before A3a
had set it and wave the write through on a case about to become versioned.

## Why INSERT is guarded at all

`authenticated` holds table-level INSERT on `public.cases` with no column
restrictions, so without this a case in an activated organisation could be
**created** with a generated report already in it — never updated, so never
caught by an UPDATE-only guard.

## Why SECURITY DEFINER, and why no marker

The function reads `investigation_report_versions`, whose RLS shows rows only
to HR or the case's current investigator. A non-definer trigger goes blind for
anybody else — a case owner, a reassigned investigator — and allows exactly
the overwrite it exists to prevent. That was demonstrated for A1 with a control
pair rather than reasoned about, and probe 14 below repeats it here.

No transaction-local GUC is used to recognise a legitimate writer. That design
was attacked during A3a and failed outright: `set_config` on a custom GUC needs
no privilege, and an HR Director forged one and landed a real activation.

## Verified behaviour (rolled-back probes against this exact SHA)

Every refusal paired with a permitted control; zero-row writes treated as
probe failures, and none occurred.

| Scenario | Result |
|---|---|
| Versioned, no versions → legacy write | REFUSED `23514` |
| Versioned, saved unadopted → legacy write | REFUSED `23514` |
| First adoption + mirror | ADOPTED, body `HUMAN DRAFT` |
| Superseding adoption | ADOPTED, body `SECOND HUMAN BODY` |
| Restore superseded body | REFUSED `23514` — control: rewrite current body PERMITTED (1 row) |
| HR-returned case | adoption survived; generation REFUSED `23514` |
| New version + re-adoption | ADOPTED, body `THIRD HUMAN BODY` |
| Unrelated case update | PERMITTED (1 row) |
| Legacy case: INSERT with report / regenerate / clear to NULL | all PERMITTED |
| INSERT with report body, activated org | REFUSED `23514` |
| INSERT without report body, activated org | PERMITTED, stamped `versioned` |
| `id` + report, and `id` + regime + report | REFUSED `23514` both |
| `service_role` and `postgres` | REFUSED `23514` both |
| `case_owner` with 0 versions visible | REFUSED `23514` |
| Real save and adoption RPC paths | compatible throughout |

## Error message

> *"This case records its investigation report as a written document that is
> saved and confirmed by hand. A generated report cannot be stored on it."*

`check_violation` / SQLSTATE `23514`, so the application can match on the code
rather than parse text. No table, column, trigger or function names, and
nothing about versions or adoption internals.

## State after application

**No organisation is activated** (0 rows in `organisation_report_settings`) and
**all 2963 cases remain legacy** (`report_regime IS NULL`), so A3b is inert:
its first condition is false for every case in production today. It begins
protecting the moment an organisation is activated.

Unchanged and verified: A1 `85ba380f71d56ecf66daa2441d97dbdf`; adoption RPC
`fb45b6388323936ce8e405614ecc2882`; save RPC `fb626a16d73a3470f48f02510a2df730`;
HR review guard `08dc6b8b8c83cbec0951f2f7371d9faf`; A3a stamp
`247284ee9eca33e72bc6d005f0e16830` and regime guard
`684666d4f922b92401c3e8ad556a9834`; 0 report versions; 139 HR review records;
`audit_log` 17055 before and after (**no audit events written**); Compass LTD
`6cdb57f65bbf11400787a11f796d5bd4`, protected UAT
`f45c8df767016d829ac4115968d8930e`, synthetic case
`fb0fb43abba369c88fd7e3ac5ac6ecb2`.

## Outstanding, recorded for a separate A1b review

`cases.investigation_report_date` remains unguarded — by A1 and by A3b. The
adoption RPC writes it alongside the mirrored body, but nothing stops it being
changed afterwards, so the date beside an adopted report can be made to
disagree with when that report was actually adopted. It is metadata rather than
content, which is why it has now been left alone twice; it should be closed
deliberately rather than by accident.

Also carried forward: `platform_admins` is protected only by the absence of a
policy; there is a single operator with no recovery path and no audit on
operator grants; and `cases.created_at` is still mutable.

## Rollback

```sql
drop trigger if exists protect_zza_versioned_legacy_report_upd_trg on public.cases;
drop trigger if exists protect_zza_versioned_legacy_report_ins_trg on public.cases;
drop function if exists public.protect_versioned_case_legacy_report();
```

Clean at any time and any data volume — no column, no table, no row, and no
existing object changed. Dropping it re-opens the gap, which after activation
means a generated report can again land on a versioned case that has adopted
nothing.
