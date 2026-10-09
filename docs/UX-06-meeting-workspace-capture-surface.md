# UX-06 — Restore the live-meeting workspace as the primary capture surface

**Status:** recorded, not scheduled. **Not part of B3.** Raised 2026-10-09
during B3 discovery so it is not lost; B3 must not implement it.

## The problem

Ordinary manual note-taking during a live meeting currently goes through a
chat-style composer at the bottom of the screen. A chat composer is the wrong
affordance for a manager chairing a meeting: it frames each note as a message in
a conversation rather than as a line in a contemporaneous record, it biases
towards short utterances, and it competes for the same screen position and
mental model as the assistant.

## What UX-06 should do

Restore the **main live-meeting workspace as the manager's primary notepad and
manual capture surface** — the large, central, always-available place where
notes are typed as the meeting happens.

**Keep Ask Compass in the separate right-side assistant panel.** The assistant
and the record are different things and should not share one input. That
separation is the point of the change, not a side effect of it.

## Properties that must be preserved

These already hold today and are the reason this is a UX change rather than a
rewrite. Any implementation must carry all of them forward:

- **Chronological capture** — entries stay in the order they happened
- **Speaker attribution** — who said what survives the change of surface
- **Stable event identity** — an entry keeps its id across edits and reloads
- **Idempotency** — a retried or replayed write does not duplicate an entry
- **Source fidelity** — manual notes, transcript lines and audio-derived text
  remain distinguishable; a typed note must never be presentable as a
  transcribed utterance, or vice versa
- **Audio and transcript capture** — unaffected, continuing in parallel
- **Auditability** — the same audit trail, with no gap introduced at the
  boundary between the old and new surfaces
- **Meeting resumption** — a meeting interrupted and resumed keeps everything
  captured before the interruption

## Constraints

- UX change first. Do not take the opportunity to alter the meeting data model,
  the transcript pipeline or the signing flow.
- Existing meetings created through the composer must continue to render and
  resume correctly. There is no migration of historical entries.
- Scope and sequence to be agreed before any implementation.
