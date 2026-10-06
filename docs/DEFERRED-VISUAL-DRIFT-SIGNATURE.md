# Deferred: visual-system drift in the signature experience

**Raised during TRUST-SIG-03 (2026-10-06). Deliberately NOT fixed in that slice**
— the brief was explicit that TRUST-SIG-03 must not perform a broad visual
redesign, so this is recorded for a later, discrete cleanup.

## The established system

Archivo as the one interface font, navy (`#1A1535` / `#0F1224`), white surfaces,
restrained violet, **no blue accent**.

## What actually ships in these surfaces

A cream/beige/amber palette that predates the current system and has no basis in
it. It is self-consistent, which is why it has survived — it reads as
*intentional* rather than as drift.

| Surface | Tokens | Role it plays today |
|---|---|---|
| `public/sign.html` — the employee signature page | `#FDFAF5` (×3), `#F1EBDD`, `#E8E0D0` | page and panel backgrounds, borders |
| `SignedRecordModal` — manager "signed copy" | `#F5E6C4` (×6), `#7A5C1A` (×6), `#FEF5E7` (×4), `#FFFDF8`, `#FDFAF5`, `#EDE5D8`, `#E8E0D0` | every notice and every "attention" panel |
| `ResponseReviewForm` (new in TRUST-SIG-03) | `#FDFAF5`, `#EDE5D8`, `#E4DCD0`, `#C9BEAE`, `#7A5C1A` | **inherited deliberately**, to match the modal it sits inside rather than introduce a second language |
| `MeetingsTab` signature badges | amber tones via `TONE_STYLE` | the ATTENTION tone |

Also present and worth deciding on: `SignedRecordModal`'s title uses
`DM Serif Display`, not Archivo.

## Why it is not a one-line swap

The amber is **load-bearing**, not decorative. It is how `TONE.ATTENTION` is
expressed — "the participant said something you need to look at" — as distinct
from `TONE.DONE` (green `#1A7A4A`) and `TONE.REFUSED`. TRUST-SIG-02 established
that a comment or a dispute must be visible without being alarming, so whatever
replaces cream/amber has to keep a **three-way** distinction between done,
needs-attention and refused, inside the navy/white/violet system and still
without a blue accent.

That is a design decision about the tone palette, not a find-and-replace.

## Recommended later slice

**TRUST-VIS-01 — bring the signature experience onto the design system.**

1. Define the three tones (`DONE` / `ATTENTION` / `REFUSED`) as system tokens,
   in one place, with the no-blue-accent constraint stated.
2. Point `TONE_STYLE` at them, so `MeetingsTab` and `SignedRecordModal` change
   together and cannot diverge again.
3. Replace the cream surfaces in `SignedRecordModal`, `ResponseReviewForm` and
   `public/sign.html` — the employee page last, since it is the one surface a
   non-user sees and it should change only once the tokens are settled.
4. Decide on `DM Serif Display` in the modal title.

Scope it as presentation-only: no semantic change, no wording change, and
`confirmationSemantics.js` untouched. The axe smoke tests already cover these
components, so contrast regressions would be caught.
