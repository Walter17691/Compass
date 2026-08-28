# Document M — Pilot Session Pack (Scenario 5 only)

A convenience extract for the live pilot session only — everything you need in one place so you're not flipping between Documents B/C/D/E/F mid-session. This does not replace them; if anything here ever seems to disagree with A–L, those are the authoritative source.

**Tester:** Experienced HR/ER professional · **Scenario:** 5 — Disciplinary → Outcome → Appeal · **Target length:** 45–60 minutes

**Known seeding limitation (Phase 8B) — read before the session:** the pre-seeded case (Grace Oduya) has the full investigation content in its Overview/Description and Investigation Report fields, and correctly sits at the "inv_report" stage with Compass's own real next-step guidance ("Proceed to disciplinary — send invitation") — verified against the app's actual logic, not assumed. What it does **not** have is separate structured entries in the Meetings or Evidence tabs (Grace's interview, Kian's witness statement, CCTV/safety-record entries) — that content only exists as narrative text in the investigation report, not as tab-level records. If the tester goes looking for it there and finds it empty, that's a known seeding gap, not a Compass defect — don't log it as a finding; note it in your own facilitator log instead so it's clear why, and mention this limitation to the tester if they get stuck specifically because of it (this is one of the few places where telling them something is appropriate, since it's about the seeded data, not the product).

---

## FACILITATOR COPY

### Recording consent (read before pressing record)

> "Before we start, I'd like to record the screen and our voices — it's just so I can review the session properly afterward rather than relying only on notes I scribble in the moment. Everything on screen will be a fictional test case at a made-up company, nothing real. The recording's just for internal review, not shared externally. Are you OK with that? ... If not, that's completely fine — we'll just go ahead without recording."

If declined: proceed with the session, relying on live Document E notes only. Note the decline on Document E's header.

### Opening script (read close to verbatim)

> "Thanks for doing this. I'm going to give you a situation, the way it might actually land on your desk, and ask you to use Compass to manage it, however you'd naturally do that. There's no correct sequence of clicks I'm looking for — I'm here to watch how the product works for a real person, not to test whether you can guess what's in my head.
>
> A few things:
> - Please think out loud as much as you can — what you're looking for, what you expect to happen, if something surprises you.
> - If you get stuck, that's genuinely useful information, not a failure on your part — tell me you're stuck rather than quietly working around it, and I'll ask you a question back before I help.
> - Everything in this scenario is fictional — no real employees, no real cases.
> - This should take somewhere between 45 and 60 minutes.
>
> Ready? Here's the situation."

Then hand over the tester task sheet + investigation summary below, and stop talking.

### Observation reminders (keep this list visible throughout)

- Stay quiet by default. 20–30 seconds of silence is normal, not a cue to speak.
- Write down *navigation path*, not just outcome — what they clicked, hovered, backtracked from.
- Note their exact words for anything they seem unsure what to call.
- Timestamp every hesitation.
- The moment they interact with any AI output (a recommendation, a drafted letter, the AI Assistant tab): ask "How much would you trust this suggestion?" (1–5) and "What would you do before relying on it?" — right then, not saved for the end.
- Watch specifically for: do they review the pre-seeded investigation before acting, or skip straight to an outcome? Does Compass's own guardrail/quality functionality get noticed, or ignored? Do they treat the outcome as *their* decision, or expect Compass to tell them what sanction to apply?

### Intervention ladder (never skip to the bottom rung)

1. Silence.
2. "What would you expect to do here?"
3. "What information do you still need before you'd feel ready to do that?"
4. "There's a way to do that in Compass — where would you guess it might live?"
5. Direct help — only after genuine, sustained stalling (~2+ minutes) or an explicit request. Log which rung you used and exactly what you showed them.

### Stop conditions — stop the session immediately if:

- Cross-tenant data exposure (anything not Meridian Fulfilment Ltd (UAT))
- Wrong employee information shown against the case
- Another tester's case appears
- Irreversible data corruption
- A communication is sent externally to a real (non-synthetic) address
- Compass records a different outcome than the tester actually confirmed

Everything else — however bad it looks — gets logged, not fixed mid-session. See Document K's "do not fix during UAT" table if you need the full reasoning.

### Mid-session handoff — timing matters

**Only after** the tester has recorded an outcome and progressed the outcome letter, hand them the appeal email (below) and say only: *"Something's just come in — here you go."* Don't prompt further.

### Closing questions (verbatim)

- "If Compass disappeared tomorrow, which feature would you miss most?"
- "What is the one thing that would stop you using Compass?"

---

## TESTER COPY

### Task sheet

> You are the HR Manager at Meridian Fulfilment Ltd. An investigation has already taken place into one of your Warehouse Supervisors, and the findings are attached. Use Compass to take this forward from here.
>
> Take as long as you need. Think out loud as you go.

### Investigation summary (hand over at the start)

> **Subject:** Grace Oduya, Warehouse Supervisor, Swindon DC2
> **Allegation:** On 4th, Grace was found to have wedged open and disabled the safety interlock on Conveyor Line 3's guard gate, allowing the line to keep running with the guard open, in order to clear a jam faster during a backlog. Ten minutes later, an operative (Kian Doyle) reached into the guarded area to clear a second jam, believing the line was stopped as per normal procedure when the guard is open, and narrowly avoided a hand injury when the belt engaged.
>
> **Evidence gathered during investigation:**
> - CCTV confirms Grace wedging the guard gate mechanism at approximately 14:12, and confirms Kian's near-miss at approximately 14:22.
> - Grace's investigation interview (12th): she accepts she disabled the interlock, says the line was "massively backed up," she'd done the same thing "once or twice before with no issue," and that she "didn't think it through" regarding anyone else being near the line. She says she didn't warn Kian or anyone else that the guard was disabled.
> - Kian's witness statement: confirms the near-miss, confirms no one had told him the guard was disabled, says "if I'd been half a second later I'd have lost fingers."
> - Site safety records confirm Conveyor Line 3's guard interlock is a Category 3 safety-critical control per the site's own risk assessment, not a minor procedural step.
> - No evidence found that Grace had disabled the interlock on any other occasion beyond her own account of "once or twice before" — this could not be independently corroborated either way.

### Appeal email (hand over only once instructed above)

> **From:** Grace Oduya
> **To:** HR
> **Subject:** Appeal
>
> I want to appeal the outcome. I accept I disabled the guard and I know that was wrong, I'm not disputing that bit. But I don't think the decision took into account that I've been a supervisor here for six years with no prior issues at all, and that I was covering two people's workload that day because we were short-staffed, which is why the line backed up in the first place. I don't think that context was properly considered.

---

## OBSERVATION COPY (fill live)

**Completion status per major task** — circle one each: reviewing the investigation / progressing to disciplinary / recording the outcome / preparing the outcome letter / handling the appeal:

`SUCCESS` · `SUCCESS WITH HESITATION` · `SUCCESS WITH ASSISTANCE` · `FAILURE`

**Assistance log**: rung used, what was shown, when —

**Hesitation points** (what, how long) —

**Key tester comments (verbatim)** —

**AI trust observations**:

| Interaction | Trust (1–5) | "What would you check first?" | Edited/verified, or accepted as-is? |
|---|---|---|---|
| | | | |

**Critical checks**:
- [ ] Did they review the investigation before acting?
- [ ] Did they notice/engage with any guardrail or quality-check signal?
- [ ] Did they treat the outcome as their own decision (not expect Compass to choose)?
- [ ] Did the Appeal Manager conflict-of-interest guardrail (if triggered) get noticed and handled correctly?

**Within ~5 seconds of first opening the case, could they say** (ask directly if not spontaneous): whose case / what type / what stage / what happened / what needs attention / what's next —

---

## POST-SESSION QUESTIONNAIRE (ask verbally)

1. Professional feel (1–10): ___
2. Ease of understanding (1–10): ___
3. Confidence managing a real case with Compass (1–10): ___
4. Usefulness of recommendations (1–10): ___
5. Trust in outputs (1–10): ___
6. Compared to your current process, would Compass: save substantial time / save some time / little difference / add some work / add substantial work
7. Would you want to use Compass at work? Definitely / Probably / Unsure / Probably not / Definitely not
8. "If Compass disappeared tomorrow, which feature would you miss most?"
9. "What is the one thing that would stop you using Compass?"
10. "Was there a moment you weren't sure whether Compass or you were meant to make the decision?"
11. "Was there anything Compass told you that you weren't sure you could rely on?"
12. Anything else?

**After the tester leaves**: transfer everything above into Document E and Document G (real IDs) the same day, before the next session.
