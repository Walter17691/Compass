# Compass Design Vision

**Status: PROPOSAL — DESIGN ONLY. No code has been written or modified to produce this document. Nothing here is committed, pushed, or deployed. This is Phase 1 (design analysis and specification); implementation does not begin until this direction is approved.**

**Companion artifact**: [Three Design Directions — visual comparison](https://claude.ai/code/artifact/600739b7-d014-4128-b5f3-55e4393f79aa) — real Home and Case Workspace header mockups for all three directions, side by side, with the recommendation. This document is the full written specification; the artifact is for comparing the three directions visually before reading the rest of this.

Grounded in the actual deployed product at `compass-lemon-iota.vercel.app`, reviewed live (not inferred from JSX alone) across Home, Cases, Case Workspace, Settings, Insights, People, Ask Compass, and the notification popover, at 1440×900.

---

## Current Design Diagnosis

Screen by screen, what's actually there today and what it costs.

### Home
Already the most-worked screen (Phase 7.5C consolidated the Needs Attention chip wall into rows and removed the stat-card tiles) and it shows — this is the closest of the seven to the target. What's left: the right-column "Compass Recommendations" panel is still a bordered card competing at the same visual weight as the case list next to it, and there's no visual distinction yet between "Compass noticed something" and "here is your actual workload."

### Cases
A filter bar of **seven** same-weight controls (type, stage, status, owner, priority, from-date, to-date) sits above any content — more chrome than most users need before they've seen a single case. Below it, a two-level nesting: a person-level header row, then one full bordered card *per proceeding* underneath. For someone with two or three open matters against the same employee, that's two or three near-identical cards stacked under one name, each repeating the border/radius/badge/chevron treatment. This is card soup by the brief's own definition — visually busy for what is structurally a simple list.

### Case Workspace
The screen the brief calls the "hero experience" is currently the least composed of the seven:
- An org-wide "Overdue actions" banner sits **above** the case header on every case, regardless of relevance to that case — the first thing an HR professional sees when opening *this* case is three unrelated overdue items from *other* cases.
- The header itself has **five** buttons of identical visual weight (Mark confidential, Reassign, Assign investigator, HR Intervention, + New meeting) with no primary/secondary distinction — a genuine "which one am I supposed to click" problem, not just an aesthetic one.
- Twelve tabs render as one flat, equal-weight horizontal row with no grouping — functionally fine, visually undifferentiated.
- The Overview tab is four stacked, identically-styled bordered cards (Description, Risk & Tribunal Exposure, Key Dates, Occupational Health Process) regardless of how much content each actually holds — an empty "No description recorded." gets exactly the same visual footprint as a card full of real data.

### Settings
The page title ("Settings") renders in the same large serif display treatment used for Home's greeting and the Case Workspace's own case-identity heading — meaning an administrative, occasional-use screen currently competes visually with the product's two highest-stakes, most-used screens. Nothing here is wrong on its own terms; it's simply not visually demoted the way an administrative area should be.

### Organisational Intelligence
A literal metric-tile wall: eight-plus uniform boxes (Open Cases, Opened This Month, Closed This Month, Overdue Cases, Returned for Further Investigation, two "Limited Data" placeholders, Informal Resolution) in the first screen alone, each just a caption and a large coloured number, no narrative framing above them. This is exactly the "chart → chart → chart → metric → chart" pattern the brief names directly. An HR Director glancing at this sees data, not a story.

### People
A flat list of full-width cards, one per person, each repeating name / meeting count / meeting-type badges / a purple "New meeting" button — every row has its own primary call-to-action, which is a lot of equally loud purple for a screen whose job is scanning, not acting.

### Ask Compass
Already close to right — a real chat interface, calm copy explaining the AI/human boundary up front ("Compass never recommends a sanction or final decision"). The one issue: a large, mostly-empty bordered response area sits below the prompt before any conversation has happened — a decorative empty state the brief's §18 specifically flags.

### Notifications
A flat, undifferentiated activity feed — "Meeting saved — E2E SignSync..." repeated with identical weight for every entry. No distinction between something that needs a response and something that's purely informational, which is exactly the "prioritise actionable notifications over informational noise" gap named in the brief.

### What every screen has in common
The single biggest, cheapest-to-fix pattern across all seven: **every discrete piece of information currently defaults to its own bordered, padded, radius'd card**, regardless of how much it actually needs one. That default is the real source of "feels like a collection of React cards" — not the colour palette, not the font. Fixing the *default* (not adding more styling on top of it) is where most of the visual transformation actually lives.

---

## Three Design Directions

Full visual mockups in the [companion artifact](https://claude.ai/code/artifact/600739b7-d014-4128-b5f3-55e4393f79aa). Summarised here for reference.

**A — Editorial Casebook.** Identity and narrative lead everywhere — serif headings throughout, thin rules instead of boxes, the case reads like a well-typeset dossier. Highest trust/gravitas. Risk: slower to scan at real volume (200+ cases).

**B — Precision Operations.** Structure and density lead everywhere — real table/list rows replace cards, a compact status strip replaces the wide header, tabs become a segmented control. Fastest scanning, most "expert console" feeling. Risk: easiest of the three to tip into "admin tool" without real discipline, and requires the largest structural rewrite (Cases and Insights need genuine table components, not reflowed cards).

**C — Calm Intelligence.** A synthesis: editorial treatment *only* where identity and trust matter (the case header, the Home greeting), structured list treatment where speed matters (Needs Attention, Active Cases, People), and AI demoted to a genuinely ambient aside everywhere rather than a boxed panel. Two visual modes in one product, used deliberately rather than by default.

## Recommended Direction: C — Calm Intelligence

Not the safe middle option — a deliberate synthesis, chosen against the brief's own stated criteria:

- **Daily, sustained use.** A opens Compass dozens of times a day; its unhurried pacing is beautiful for reading one case and fatiguing across two hundred. C keeps A's warmth only where it's earned (identity moments) and borrows B's speed everywhere the user is actually working.
- **Commercial credibility with an HR Director.** Pure operational density (B) reads as an internal admin tool in a sales demo — efficient, not premium. C's editorial case header is what makes the first five seconds of opening a case feel like a considered product rather than a ticketing system.
- **AI should not compete with the user's workload.** Both A and B still put Compass Recommendations in a box. C is the only direction that makes AI genuinely ambient — ranked #3 in the top-15 list below because of how directly it answers the brief's "Compass quietly noticed something useful" target.
- **Implementation risk.** Lower than B (no Cases/Insights table rewrite required) and comparable to A, while directly reusing real, already-shipped work — Home's Needs Attention row-list (Phase 7.5C) *is already* C's queue pattern; this direction extends an established pattern rather than inventing a new one.

---

## Design Principles

1. **Remove → group → prioritise → then style**, in that order, every time — never reach for smaller padding as the first move.
2. **A card must earn its border.** Default to no container. A container exists to separate genuinely distinct conceptual zones from each other, not to wrap every individual field group.
3. **One visual register per purpose.** Identity moments (case header, Home greeting, person name) get the serif/editorial treatment. Working queues (Needs Attention, Active Cases, People, Cases) get the structured list treatment. Never mix the two within the same zone.
4. **Colour is semantic, not decorative.** Red/amber/green mean genuine urgency or status. The one brand purple means "this is interactive/primary." Nothing else gets a background colour merely to look distinct from its neighbour.
5. **Every screen has at most one primary action.** Everything else is secondary (outline) or tertiary (text-only).
6. **AI is ambient, not boxed.** A quiet aside beside the user's real workload, never a panel racing it for attention.
7. **Typography carries hierarchy that colour and borders currently do.** A disciplined, small type scale, used consistently, does most of the work.

---

## Home Specification

Top to bottom:

1. **Header** — date (small caps, muted) + "Good afternoon, [name]" in the serif display face, one size only. No stat tiles beside it — the existing subtitle line ("223 active cases · 6 requiring action · 8 closed this month") already carries that information; it stays, nothing is added back.
2. **Needs Attention** — kept as the existing Phase 7.5C row-list structure (severity dot, label, date), which already *is* Direction C's queue pattern. Only change: drop the outer card border in favour of a plain section with a thin top rule, consistent with removing unnecessary containers project-wide — the content itself is already right.
3. **Active Cases** — the existing row-list (employee, badge, last-updated) stays structurally as-is; it's already a restrained list, not a card wall. Only change: slightly stronger visual weight now that Recommendations moves to a genuinely ambient treatment beside it, so the eye lands here second, decisively.
4. **Secondary assistance (Compass Recommendations + Potential Bottlenecks)** — demoted from a bordered card to an ambient strip: small purple dot, one line of text, no box, positioned quietly below or beside Active Cases rather than in a competing right-column card. This is the single largest visual change on Home and the direct implementation of "AI should quietly notice something useful."
5. **Today panel** — unchanged structurally (already minimal post-7.5C); only the outer border is reconsidered per the "does this need a card" rule (likely: yes, since it's a genuinely distinct secondary zone — kept).

## Cases Specification

1. **Header** — "Cases" + count, one line, no separate stat row.
2. **Filters** — collapse the seven always-visible filter controls into a single "Filter" trigger that expands the current controls on demand, plus the search field and the 4 quick-filter pills (Active/Investigation/Disciplinary/Closed) that already work well on Home, kept visible by default. Rationale: seven simultaneous dropdowns is chrome most sessions don't touch; the common case (search + a quick stage filter) shouldn't cost the same vertical space as the rare case (five-field cross-filter).
3. **List** — collapse the two-level person → nested-proceedings card structure into a single flat row list: one row per proceeding, with the employee name always visible and a lightweight visual grouping (a thin left rule or subtle background tint shared by rows belonging to the same person) replacing the second card layer. Preserves the real information (which proceedings belong to which person) without the repeated border/radius/badge overhead of nested cards.
4. **Row content** — employee, case type, stage badge, last activity, chevron — the same information already shown, in one row instead of a card.

## Case Workspace Specification

**Header** (see also Case Header section below): compact identity strip — employee name (serif), case type + stage badge on the same line, owner and key date as smaller trailing metadata, one primary action (the actual next step, sourced from the same `getNextStep` logic already computed today) and everything else collapsed into a single "More actions ▾" menu (Mark confidential, Reassign, Assign investigator, HR Intervention). Five equal buttons become one primary + one menu.

**Overdue banner**: moves from above the case header to *inside* Home/the sidebar only — a case-specific workspace should never lead with org-wide, other-case information. (This is a structural/placement change, not a removal — flagged under Presentational Structure risk below, since it changes which component renders where, not the underlying banner logic itself.)

**Tabs**: twelve tabs regrouped into a slim two-tier structure — a primary row (Overview, Timeline, Allegations, Evidence, Outcome — the ones used in nearly every case) and a secondary "More ▾" or slim second row (Meetings, Participants, Tasks, Documents, Communications, Themes, AI Assistant) for the rest. No route changes, no tab removal — purely which ones get first-class visual billing.

**Overview tab**: the four stacked cards consolidate into far fewer surfaces. Description and Risk & Tribunal Exposure/Key Dates already sit in a sensible order (post-7.5B); the visual change is merging Key Dates and Occupational Health Process into one "Process" surface with internal dividers rather than two separate bordered cards, and letting genuinely empty sections (like "No description recorded.") render as quiet text with no card at all rather than a full bordered box for a one-line placeholder.

## Case Header Specification

Compact, single dense strip, not a dashboard card:
- **Employee name** — serif, primary weight (the one thing that must never be missed).
- **Case type + stage** — inline, small caps or a single subdued badge, not two separate visual elements competing with the name.
- **Owner / key date** — trailing metadata, small, muted — present but never louder than identity.
- **Attention state** — folds into the existing red-tier convention already established (Phase 7.5B/C), shown only when genuinely present, not a permanent slot.
- **Next action** — one real button, sourced from existing `getNextStep` logic, not invented.
- **Everything else** — one "More actions ▾" menu.

## People Specification

Stays a list, not a card wall: same information (name, meeting count, last activity), one row each, badges reduced to a single small "type" tag rather than one pill per meeting, and the purple "New meeting" action moves from a full button on every single row to a smaller icon-button or appears on hover — a scanning screen shouldn't have twenty simultaneous loud purple CTAs. No expansion into general HRIS territory, matching the brief's own scope constraint.

## Organisational Intelligence Specification

Reframe from "chart → chart → chart" to **insight → meaning → possible action**:
1. One or two genuinely important headline figures at the top (not eight), each with a short interpretive line, not just a number ("223 open, 6% up on last month").
2. "Limited data" placeholders stop rendering as full cards identical to real data — they collapse to a single muted line within their section, not a same-size box.
3. Trend/theme panels (already computed, real signals from earlier phases) get promoted above the raw metric grid, since they're closer to "meaning" than a bare count is.
4. The metric grid itself stays (the data is genuinely useful) but shrinks to secondary billing below the headline/trend content, and drops from 8 same-weight tiles to a tighter, grouped set.

## Ask Compass Specification

Nearly right already. One change: the empty response area before a conversation starts collapses to a short prompt line with the existing example questions, not a large bordered empty box — consistent with the brief's empty-state guidance.

## Settings Specification

1. **Page title** demoted from the large serif display treatment to a smaller, plain heading — visually signalling "administrative," distinct from Home/Case Workspace identity moments, per the brief's explicit instruction.
2. **Grouped nav** (already implemented, Phase 7.5C) stays exactly as-is — it already does the "strong grouping, avoid a wall of options" job well.
3. **Content panels** keep their current card treatment (Settings is genuinely a form-heavy administrative context where bordered fields make sense) — this is one of the areas explicitly *not* changed, since it isn't part of the "feels like a prototype" problem.

## Navigation Specification

Left sidebar structurally unchanged (routes, permissions, grouping all frozen per the brief). Visual change only: the "HR Processes" collapsible group and primary nav items get slightly more restrained typographic weight differentiation so the primary five (Home, Insights, Ask Compass, Cases, Tasks) read as the main spine and the rest as clearly secondary — mirroring the Settings grouping work already done, applied one level up.

---

## Design Tokens

Proposed, restrained, built from what already exists rather than replacing it.

**Typography scale** (down from the current ~9 ad hoc sizes to 6, all still using the existing DM Serif Display / DM Sans pairing — no new fonts):
| Role | Face | Size | Weight |
|---|---|---|---|
| Identity heading (case/person name, Home greeting) | DM Serif Display | 26px | 400 |
| Page title (screen-level, non-identity) | DM Sans | 20px | 600 |
| Section heading | DM Sans | 13px, uppercase, tracked | 700 |
| Body | DM Sans | 13–14px | 400/500 |
| Metadata / caption | DM Sans | 11–12px | 500 |
| Micro (badges, timestamps) | DM Sans | 11px | 600 |

**Spacing scale**: 4 / 8 / 12 / 16 / 24 / 32 / 48px — one consistent rhythm, replacing today's inconsistent ad hoc padding values.

**Surface hierarchy**: 3 tiers only — page background (existing warm paper `#FDFAF5`, kept), primary surface (white card, used for genuine grouping), inline (no background, used for the majority of content that doesn't need a container).

**Border usage**: one weight (`1px`), one colour (`#E8E0D0`, kept), used only at tier boundaries — never inside a surface to separate sub-items (spacing does that instead).

**Radius**: 2 values only — `8px` for surfaces, `999px` (true pill) for status badges. Every other current value collapses into one of these two.

**Shadow**: none on cards (flat/bordered stays the language); reserved for genuinely elevated layers (modals, popovers) exactly as today.

**Semantic colour**: red (`#B4432C`-family, already used) = overdue/urgent only; amber = attention/warning only; green = positive/complete only; purple = interactive/primary only. No other category gets a dedicated colour — case-type badges, meeting-type tags, etc. move to neutral grey with text, not a colour wheel.

**Button hierarchy**: primary (filled purple, one per screen/section), secondary (outline), tertiary (text-only link), destructive (red, outline, only for genuinely destructive actions), icon-only (repeated row actions).

**Content widths**: cap primary reading content at ~1200px on very large monitors (currently uncapped in places) so 1920px+ doesn't stretch text/rows uncomfortably wide; laptop widths (1440 and below) are unaffected.

---

## Component Strategy

A small set of reusable presentation primitives, not a design-system rewrite:

- **PageHeader** — title + optional one-line context, consistent across Cases/Insights/Settings/People.
- **SectionHeading** — the small-caps label pattern already used in several places, formalised as one component.
- **WorkQueue** — the Needs Attention row-list pattern, generalised for reuse (already exists in effect; formalise it as the canonical "list of things needing action" primitive).
- **DataRow** — the single-row list-item pattern for Cases/People, replacing per-screen bespoke card markup.
- **StatusIndicator** — the severity-dot + label pattern, one implementation used everywhere status/urgency is shown.
- **EmptyState** — one small, consistent "nothing here yet" treatment, replacing several different current empty-state renderings.
- **ActionBar** — primary + "More actions ▾" pattern, used in the Case Workspace header and anywhere else multiple actions currently compete.
- **CaseHeader** — the compact identity strip described above, a single component reused if a case identity ever needs to render elsewhere (e.g. a search result).

---

## What Should Be Removed Visually

- The org-wide overdue banner from above the Case Workspace header (relocated, not deleted).
- Per-field-group bordered cards in Overview where content is thin or absent.
- The seven-filter always-visible row on Cases (collapsed behind a trigger).
- The second card layer in Cases' person → proceeding nesting.
- The bordered "Compass Recommendations" panel as a competing card (demoted to ambient).
- The 8-tile uniform metric wall on Organisational Intelligence's default view (regrouped, shrunk, demoted below narrative content).
- Per-row "New meeting" buttons on every People row (hover/icon instead).
- The large empty response box on Ask Compass before any conversation.
- Excess colour categorisation on badges/tags that isn't genuine urgency (case-type tags, meeting-type tags → neutral).

## What Should Remain

Explicitly protected, not touched for consistency's sake alone:
- The warm paper background + white surface palette (`#FDFAF5` / `#FFFFFF`) — it already reads as considered and calm; do not replace it.
- DM Serif Display / DM Sans pairing — already a good, distinctive brand choice.
- The Needs Attention row-list pattern (Phase 7.5C) — already correct, becomes the template for other queues rather than being redone.
- Settings' grouped navigation (Phase 7.5C) — already does its job well.
- The notification popover's positioning fix (Phase 7.5C) — logic untouched, only its visual density/grouping reviewed per §17.
- Ask Compass's existing calm framing copy and AI/human boundary language — already right.
- Every guardrail/quality-check/decision-support signal's underlying logic and content — this exercise touches presentation only.

## Responsive / Laptop Strategy

Primary target 1440×900; also verified conceptually at 1366×768, 1920×1080, 1024×768 (brief §20). No phone-specific redesign. The token system above (capped content width, consistent spacing scale) is what actually protects the 1920px case — without a cap, wide monitors stretch line length and row density uncomfortably; with one, the 1440px experience is simply centred with more margin, not restructured. At 1366×768 and 1024×768, the ActionBar's primary+menu collapse (replacing 5 buttons with 1+1) is what prevents the Case Workspace header from wrapping awkwardly, which is the one real risk at narrower widths today.

## Implementation Risk Map

**VISUAL ONLY** (CSS/spacing/typography — lowest risk, do first):
- Type scale consolidation across all screens
- Spacing/radius/border token consolidation
- Settings page-title demotion
- Semantic-colour cleanup on badges/tags
- Content-width cap for large monitors

**PRESENTATIONAL STRUCTURE** (component composition changes, no behaviour change — medium risk, needs care but no logic touched):
- Case Workspace header → compact strip + ActionBar (More actions ▾)
- Overview tab card consolidation
- Cases list card → row-list conversion
- People card → row-list conversion
- Compass Recommendations card → ambient strip
- Organisational Intelligence regrouping
- Tab visual regrouping (primary row + More ▾) — **routes and active-tab logic unchanged**

**INTERACTION CHANGE** (flagged separately, needs explicit sign-off before implementation):
- Moving the org-wide overdue banner out of the Case Workspace's render tree entirely (a real relocation, not just restyling — touches where a component mounts, even though the banner's own logic doesn't change)
- Collapsing Cases' 7-filter row behind a trigger (changes a filter's default visibility, which is a real interaction change even though no filter logic changes)
- Any "hover-to-reveal" treatment on People's per-row action (changes discoverability of an existing action, worth explicit confirmation before implementing)

---

## THE 15 HIGHEST-IMPACT DESIGN CHANGES

Ranked by expected impact against the brief's own commercial-quality test.

1. **Case Workspace header: 5 equal buttons → 1 primary + "More actions ▾"**
   *Problem*: no visual hierarchy of actions on the single most-viewed screen in the product. *Solution*: ActionBar primitive. *Impact*: highest — this is the literal "hero experience" screen. *Risk*: Presentational structure. *Affects*: `CaseViewScreen.jsx` header.

2. **Move the org-wide overdue banner out of the Case Workspace**
   *Problem*: a case-specific screen leads with other cases' information. *Solution*: relocate to Home/sidebar only. *Impact*: very high — fixes the very first thing a user sees on every case. *Risk*: Interaction change (flagged for explicit approval). *Affects*: `App.jsx` render tree, `AppSidebar.jsx`.

3. **Card-soup reduction in Case Workspace Overview**
   *Problem*: 4 identically-weighted cards regardless of content. *Solution*: consolidate, drop cards for near-empty sections. *Impact*: high. *Risk*: Presentational structure. *Affects*: `OverviewTab.jsx`.

4. **Demote Compass Recommendations from card to ambient strip**
   *Problem*: AI competes visually with the user's actual workload. *Solution*: small dot + one line, no box. *Impact*: high — directly answers the brief's core AI-treatment ask. *Risk*: Presentational structure. *Affects*: `HomeScreen.jsx` right column.

5. **Cases: collapse the 2-level card nesting into a flat row list**
   *Problem*: card soup, hardest-hit screen after Case Workspace. *Solution*: DataRow primitive. *Impact*: high. *Risk*: Presentational structure. *Affects*: `CasesScreen` (or equivalent list component).

6. **Organisational Intelligence: insight-before-metrics reframing**
   *Problem*: pure metric wall, no narrative. *Solution*: promote trend/theme content, shrink and regroup the tile grid. *Impact*: high — this is the screen most likely to be shown to an HR Director in a demo. *Risk*: Presentational structure. *Affects*: `InsightsScreen.jsx` / Organisational Intelligence tab.

7. **Settings page-title demotion**
   *Problem*: administrative screen visually competes with Home/Case Workspace. *Solution*: smaller, plain heading. *Impact*: medium-high, very cheap. *Risk*: Visual only. *Affects*: `SettingsScreen.jsx`.

8. **Cases: collapse the 7-filter row behind a trigger**
   *Problem*: heavy chrome before any content, most sessions don't need it. *Solution*: single "Filter" trigger + kept quick-pills. *Impact*: medium-high. *Risk*: Interaction change (flagged). *Affects*: `CasesScreen`.

9. **Type-scale and spacing token consolidation, applied globally**
   *Problem*: ~9 ad hoc heading sizes, inconsistent spacing, "amateur" inconsistency the brief names directly. *Solution*: the 6-size scale and 7-step spacing rhythm above. *Impact*: medium-high, compounds across every screen. *Risk*: Visual only — the single lowest-risk, highest-leverage change on this list. *Affects*: shared style constants, all screens.

10. **Tab visual regrouping (primary row + secondary "More ▾")**
    *Problem*: 12 flat, equal tabs. *Solution*: 5 primary + 7 secondary, no route changes. *Impact*: medium. *Risk*: Presentational structure. *Affects*: `CaseViewScreen.jsx` tab bar.

11. **People: card → row list, per-row CTA → hover/icon**
    *Problem*: repeated loud purple CTAs on a scanning screen. *Solution*: DataRow primitive, subdued action. *Impact*: medium. *Risk*: Presentational structure (row conversion) + Interaction change (hover reveal, flagged). *Affects*: `PeopleScreen.jsx`.

12. **Semantic-colour cleanup on non-urgency badges**
    *Problem*: case-type/meeting-type tags use decorative colour, diluting what colour means elsewhere. *Solution*: neutral grey + text for anything that isn't genuine urgency/status. *Impact*: medium, improves trust in the signals that *do* use colour. *Risk*: Visual only. *Affects*: badge styling across Cases/People/Case Workspace.

13. **Notification popover: actionable/informational grouping**
    *Problem*: flat undifferentiated feed. *Solution*: light visual grouping by whether an item is actionable; logic (including the recent viewport-position fix) untouched. *Impact*: medium. *Risk*: Visual only. *Affects*: `ActivityBell.jsx` content rendering (not its positioning logic).

14. **Ask Compass: collapse the empty response box**
    *Problem*: decorative empty state, brief §18. *Solution*: short prompt line instead of a large bordered box. *Impact*: medium, cheap. *Risk*: Visual only. *Affects*: `GlobalAssistantScreen.jsx` (or equivalent).

15. **Content-width cap for large monitors**
    *Problem*: uncapped rows/text stretch uncomfortably on 1920px+. *Solution*: ~1200px cap, centred. *Impact*: medium, protects the design system's own consistency across the required viewport range. *Risk*: Visual only. *Affects*: shared page-shell layout.

---

## "If Compass were being demonstrated to an HR Director tomorrow, what currently prevents it from feeling like a premium commercial product?"

Being direct, as asked:

**The Case Workspace header would be the moment it stops feeling premium.** An HR Director opening a real case for the first time would see five identically-styled buttons with no indication of which one matters right now, sitting below an orange banner about three unrelated overdue items from other cases entirely — before they've even read whose case they're looking at. That's the single highest-stakes five seconds in a sales demo, and today it reads as unfinished, not restrained.

**Second**: the Organisational Intelligence screen, if shown, would read as an internal BI tool rather than something built specifically for ER work — eight uniform metric tiles with no story is exactly the generic-dashboard impression the brief is trying to avoid, and it's one of the screens most likely to actually get demoed to a director-level buyer.

**Third, more diffusely**: the sheer number of bordered cards across Cases, Case Workspace Overview, and People adds up to a cumulative impression of "assembled from components" rather than "designed as one product" — no single instance of this is embarrassing on its own, but the pattern, repeated dozens of times per session, is what currently reads as "AI-generated application" rather than "considered SaaS product." Fixing the *default* — cards must earn their border — does more for the premium feeling than any individual screen change on this list.

None of these are functional problems. All three are genuinely fixable through the presentation-only and presentational-structure changes above, without touching the hardened product underneath.

---

**Nothing in this document has been implemented. Awaiting direction approval (or amendment) before Phase 2 begins.**
