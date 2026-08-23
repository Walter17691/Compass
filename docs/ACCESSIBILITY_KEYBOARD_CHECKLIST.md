# Manual keyboard-testing checklist

Phase 6.5 hardening (accessibility and UX reliability pass). Automated
tooling (`eslint-plugin-jsx-a11y`, wired into `npx eslint src`; `jest-axe`,
see `src/test/axeSmoke.test.jsx`) catches missing labels, invalid ARIA,
and static contrast/markup issues. It does **not** catch real keyboard
operability, focus order, or what a screen reader actually announces —
those need a human, on a real keyboard, with sound (or a screen reader)
on. This checklist is that manual pass.

## How to run it

- Unplug or ignore the mouse/trackpad entirely for the duration of the test.
- Use **Tab** / **Shift+Tab** to move forward/back, **Enter** or **Space**
  to activate, **Escape** to close, and arrow keys where a control implies
  them (native `<select>`, radio groups).
- Chrome/Firefox/Safari all differ slightly in default focus-ring
  rendering and `:focus-visible` behaviour — test in at least two browsers
  if you're signing off a release, not just development.
- For screen-reader passes: VoiceOver (macOS, `Cmd+F5`) or NVDA (Windows,
  free) are enough; you don't need every screen reader, just one, run
  properly (i.e. actually listen to what it says, don't just watch the
  visual highlight).

## General, every screen

- [ ] Tab reaches every interactive element on the screen, in a sensible
      (visually top-to-bottom, left-to-right) order — no jumps into an
      unrelated part of the page.
- [ ] Every focused element shows a **visible** focus indicator (the
      app-wide `:focus-visible` box-shadow ring, or the input border/
      shadow change) — nothing is focused with no visible change at all.
- [ ] Nothing that looks clickable is actually unreachable by Tab (a
      "clickable div" regression).
- [ ] No keyboard trap: you can always Tab (or Escape, in a modal) your
      way back out of whatever you tabbed into.
- [ ] Loading, error, and empty states are visually and behaviourally
      distinct — a "Retry" affordance on a genuine failure, not a
      call-to-action for creating the first record (see the org-data-load
      banner, below).

## Modals and dialogs (the shared `useModalA11y` contract)

Applies to every dialog in the app: Confirm/Prompt/WhySources/quality-
check modals, Assign Investigator, Handoff, Reassign, HR Intervention,
Escalate to HR, Outcome, Onboarding Wizard, Command Bar (Cmd/Ctrl+K),
Schedule Meeting.

- [ ] Opening the dialog moves focus **into** it (onto its first real
      control, not left on whatever triggered it).
- [ ] **Tab** from the last focusable element inside wraps back to the
      first — focus never escapes into the page behind the dialog.
- [ ] **Shift+Tab** from the first element wraps back to the last.
- [ ] **Escape** closes the dialog from anywhere inside it, regardless of
      which control currently has focus.
- [ ] Closing the dialog (Escape, Cancel, ×, or completing the action)
      returns focus to whatever originally opened it — you should be able
      to keep working from where you were, not have to re-find your place.
- [ ] A screen reader announces the dialog's own name/title when it opens
      (`aria-modal`, `role="dialog"`/`"alertdialog"`, and either
      `aria-labelledby` pointing at a visible heading or a direct
      `aria-label`) — not just silence, and not the page content behind it.

## Case navigation

- [ ] From the Cases list, Tab reaches every case row as a real,
      individually-focusable button — Enter/Space opens that case.
- [ ] The per-row selection checkbox is a separate Tab stop from the
      row's own "open this case" button — selecting a case for bulk
      action never accidentally navigates into it, and vice versa.
- [ ] Filter selects, search, and "Load more" are all reachable and
      operable without a mouse.
- [ ] Inside a case (CaseViewScreen), every tab (Overview/Meetings/
      Evidence/Allegations/Tasks/Documents/Themes/Outcome/AI) is reachable
      and switches on Enter/Space, and the tab's own content becomes
      reachable immediately after (no dead zone).

## Meetings

- [ ] The "Schedule meeting" flow (Calendar screen) is fully keyboard-
      operable end to end: opening the modal, filling every field
      (case/type/date/time/duration/attendees/description), and
      submitting.
- [ ] The month-grid day cells and per-day meeting chips are real buttons,
      reachable and operable, not inert unless a mouse hovers.
- [ ] During a live meeting (RecordScreen), the transcript area, note
      input, and quality-check modal (on ending the meeting) are all
      keyboard-reachable — a manager shouldn't need a mouse mid-meeting.

## Evidence

- [ ] The evidence upload control (drag-and-drop dropzone, both the
      "new case" flow and an existing case's Evidence tab) is reachable
      by Tab and triggerable by Enter/Space — not just droppable/
      clickable with a mouse. Check this explicitly: it's a visually-
      hidden-but-focusable `<input type="file">`, easy to regress back to
      `display:none` (which silently removes it from the tab order again)
      without a visible symptom in normal mouse-driven testing.
  - [ ] EvidenceDropzone (`src/components/EvidenceDropzone.jsx`)
  - [ ] PrepScreen's supporting-document upload
- [ ] Removing an uploaded evidence item (the × / Remove control) is
      reachable and has an accessible name that includes which item it
      removes, not just "Remove" with no context when there are several.

## Process workflows (onboarding/offboarding checklists, redundancy, OH)

- [ ] Checklist task rows (starter/leaver instances) — the done-toggle,
      the task name, owner, and due-date controls are all individually
      reachable and operable.
- [ ] The redundancy process-type picker (Individual/Collective) and
      every step in an active redundancy case are keyboard-operable.
- [ ] The Occupational Health panel's referral/report/recommendation
      fields, including its own date controls, are keyboard-operable.

## HR dashboards (Insights, HR Reports)

- [ ] Every Insights sub-tab (Organisational Intelligence/Trends & Themes/
      Manager Insights/Risk Map/Improvement Initiatives/Reports) is
      reachable and switches on Enter/Space.
- [ ] "Ask why" / "Show evidence" buttons throughout Insights open their
      modal with focus correctly moved in (same modal checklist above).
- [ ] Chart/bar-row content that links to a case or filters a view (e.g.
      Process Bottlenecks' per-case chips) is a real, reachable control,
      not a hover-only affordance.

## Manager portal

- [ ] ManagerPortalScreen's grouped due-soon list, delegated-case cards,
      and any "Assign"/"Reassign"/"Escalate" actions are all reachable
      and operable without a mouse.
- [ ] A manager can complete an entire investigation submission
      (including the quality-check modal's Go back / Create follow-up /
      Proceed anyway options) via keyboard only.

## Settings

- [ ] Every settings sub-section (Process Templates, Team Access,
      Notifications, Data & Privacy, etc.) is reachable via the settings
      nav rail using Tab/Enter, including the mobile `<select>` fallback.
- [ ] Grouped checkbox/radio-style controls (e.g. Process Templates'
      "Suggested roles to fill", Team Access' "Locations") are wrapped in
      a real `<fieldset>`/`<legend>` — a screen reader announces the
      group's own purpose before reading each checkbox, not a bare list
      of unlabelled checkboxes.

## OH (Occupational Health) workflows

- [ ] The OH referral/report recording flow's own date fields (referral
      date, report received date) are reachable, and each has a real,
      unambiguous accessible name distinct from any other date field on
      the same screen.
- [ ] OH recommendations list (accept/dismiss-style flow) is fully
      keyboard-operable.

## Date/deadline controls

- [ ] Every `DateInput` on the site: its native date picker opens on
      Enter/Space (browser-native `<input type="date">` behaviour) and
      the field has a real associated `<label htmlFor>`, not just visual
      proximity to a label. Spot-check at least: DSAR "Date received",
      Prep "Meeting date", Wellbeing follow-up date, Offboarding exit
      interview date, Onboarding checklist date fields, Assign
      Investigator's target completion date.
- [ ] Overdue/due-soon deadline lists (HomeScreen banner, Calendar,
      Manager Portal) convey urgency through real text ("3 days overdue"),
      not colour alone — confirm by viewing in grayscale/high-contrast
      mode or squinting: the words should still tell you everything the
      colour does.

## The org-data-load failure banner

This is new behaviour (`dataLoadIssues` in `src/App.jsx`,
`src/lib/dataLoadIssues.js`), worth a specific manual pass since it can't
be triggered by axe or a component-level unit test against a live
Supabase connection:

- [ ] Go offline (disconnect Wi-Fi, or use DevTools' Network → Offline)
      and reload the app while signed in. Confirm the banner appears
      ("Couldn't load…") rather than the app silently rendering every
      screen's empty state as if the organisation has no data at all.
- [ ] Confirm the banner's **Retry** button is keyboard-reachable and,
      once back online, a Retry click clears the banner and populates the
      screens correctly.
- [ ] Confirm **Dismiss** (×) hides the banner, and confirm a *genuinely
      new* failure (a different entity failing on a later attempt)
      re-shows it even after a previous dismissal.
- [ ] With a screen reader running, confirm the banner is announced when
      it appears (`role="status" aria-live="polite"`) without needing to
      already be focused on it.

## Known gaps / not covered by this pass

Recorded here rather than silently left unmentioned — see the review's
own final report for the full list and reasoning:

- The **employee-facing portal** (`src/portal/`) and pre-login
  screens (Login, OrgSetup) are separate render trees from the main app
  and only received the specific fixes made directly to their own files
  in this pass (e.g. `PortalSignatures.jsx`) — the app-wide focus-visible
  button/link styling now lives in `src/index.css`, the one stylesheet
  genuinely shared by every entry point, so it does cover them; the
  modal-focus-trap hook (`useModalA11y`) was only applied to modals
  audited in the main Compass app.
- Colour-contrast ratios were checked incidentally via axe's own
  `color-contrast` rule (part of the smoke suite) but not independently
  verified against WCAG AA with a dedicated contrast tool across every
  colour combination in the app's palette.
- Live screen-reader testing (an actual VoiceOver/NVDA pass reading every
  checklist item above aloud) has not been performed as part of this
  automated review — the checklist above is written so a human can run it,
  not as a claim that it already has been.
