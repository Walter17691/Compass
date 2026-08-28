# Document C — Six UAT Scenario Packs

All scenarios are set at the same fictional employer, **Meridian Fulfilment Ltd**, a mid-sized UK warehousing and delivery company (~340 employees, sites in Reading and Swindon) — enough shared context that a facilitator running back-to-back sessions doesn't have to re-orient, without ever repeating a named employee across scenarios. **Every name, date, email address, and incident below is fictional.** No real Compass production record was used to construct any of these.

**Per-session naming note:** if the same scenario is run with more than one tester, append a session tag to the employee's name when creating the case in Compass (e.g. "Dean Ashworth (S1)" → "Dean Ashworth (S1b)") so cases don't collide in the shared UAT org, and record the exact case name used in Document E.

**How to use this document:** give the tester *only* Document D's task sheet for their scenario, plus the raw material blocks below (emails, statements, etc.) reproduced as-is — as a printed sheet, a PDF, or pasted into an email to the tester's own inbox if you want the "receiving an email" framing to feel literal. Do **not** give the tester the "Facilitator context" sections — those are for you only, so you know what a thorough investigation *should* surface, in order to score the session accurately.

---

## Scenario 1 — Straightforward Misconduct Investigation

**Tests:** whether a first-time user can independently begin and structure a case from a plain manager report.

### Raw material given to the tester

> **From:** Priya Nathan, Shift Manager, Reading DC1
> **To:** HR
> **Subject:** Incident on the floor yesterday — Dean Ashworth
>
> Hi,
>
> I wanted to flag something that happened on the late shift yesterday (Tuesday 18th). Dean Ashworth had a real go at Callum Reeves in front of most of the packing line — shouting, calling him useless, told him to "get out of his way or he'd move him himself." It went on for a good minute or two before I got over there and broke it up.
>
> Callum looked pretty shaken. I've not had a formal complaint from him yet but I think he will raise one, he said he wants to "think about it overnight."
>
> This isn't the first time I've heard Dean's had a short fuse with people but it's the first time I've seen it myself. Not sure what happens next but I didn't think I could just let this go.
>
> Priya

**Additional facts available if the tester asks / looks for them** (not volunteered):
- Incident date: Tuesday 18th (this month, per the scenario's running date).
- Location: packing line, Reading DC1, covered by CCTV (camera 4, per the DC1 camera map — CCTV footage exists but has not yet been requested/reviewed by anyone).
- Callum Reeves does submit a witness statement the following day if the tester (in-scenario) asks Priya to get one — provide on request:

> **Witness statement — Callum Reeves, submitted 19th (day after incident)**
>
> Dean started having a go at me because I was going too slow putting labels on. He was right in my face, shouting, called me useless and said some other stuff I don't want to repeat. Told me to get out of the way or he'd move me himself. I was pretty shaken, my hands were shaking after. A few of the others on the line saw it too — Jade was right next to me.

- A second potential witness, Jade, is named but not yet approached by anyone — the tester may or may not think to request a statement from her (facilitator: note whether they do).

### Facilitator context (do not give to tester)

A thorough response identifies: this needs a formal case opened as a misconduct/conduct investigation; Dean as subject, Callum as complainant/witness, Priya as reporting manager; at least one allegation recorded (verbal abuse/aggressive conduct towards a colleague); the CCTV should be flagged as evidence to obtain before it's overwritten (most DVR systems only retain footage for a limited period — a competent HR professional would treat this as time-sensitive); Jade as a second witness worth approaching. There is no "trick" in this scenario — it exists to test basic case-opening fluency, not judgement under ambiguity.

---

## Scenario 2 — Complex Investigation

**Tests:** whether Compass helps the user manage complexity (multiple allegations, conflicting accounts, uneven evidence) rather than just store information.

### Raw material given to the tester

> **From:** Robert Nkemelu, Operations Manager, Swindon DC2
> **To:** HR
> **Subject:** Concerns about Ellen Marsh
>
> This is a difficult one and I want to do it properly.
>
> Two separate things have come to me about Ellen (Team Leader, inbound team).
>
> First — over the last few months I've had two people mention, separately, that Ellen can be pretty harsh with Tomasz, one of the newer starters on inbound. One of them (Sadia) said Ellen regularly speaks to him "like he's an idiot" in front of others and it's affected his confidence. The other (Gareth) mentioned something similar but was vaguer about it — more "I've noticed she's off with him" than specific examples.
>
> Second, and this only came up yesterday — one of our stock controllers flagged that the weekly cycle-count figures Ellen submitted for weeks 14-16 don't reconcile with the warehouse management system's own numbers. The gap isn't huge but it's consistent, always in the same direction, which looks less like a genuine counting error and more like the figures were adjusted. I've asked IT to pull what they can from the WMS but they've said the audit trail for that period is only partially intact — some kind of system migration happened around week 15 and not everything logged cleanly.
>
> I don't know if these two things are related. Sadia raised her concern about 3 months ago in a one-to-one with me but I honestly didn't follow it up properly at the time, which I probably should own up to. The stock figures thing is much more recent.
>
> Rob

**Witness statement — Sadia Iqbal, inbound team, provided on request:**

> Ellen's been off with Tomasz pretty much since he started. It's little digs mostly — "did you even read the instructions", stuff like that, but done in front of everyone, which is the bit that gets me. I mentioned it to Rob a while back. I don't think it's happened in the last few weeks actually, but it went on for a good couple of months before that.

**Witness statement — Gareth Owusu, inbound team, provided on request:**

> Yeah I've noticed Ellen's a bit sharp with Tomasz sometimes. I couldn't give you a specific date or exact words though, it's more a vibe than anything I could point to. She's a good team leader otherwise, I don't want this to sound like more than it is.

**Cycle-count data**, provided on request as a rough table (the tester receives this as a plain description, not a structured Compass import):

> Weeks 14, 15 and 16 cycle counts submitted by Ellen showed stock variances of -0.8%, -1.1% and -0.9% against the prior WMS baseline. Weeks 12, 13, 17 and 18 (submitted by other team leaders on rotation) showed variances between -0.1% and +0.2%. IT confirms the WMS audit log has a gap from mid-week 15 to early week 16 due to a scheduled migration; they cannot confirm who was logged in making adjustments during that window either way.

### Facilitator context (do not give to tester)

The two allegations are genuinely different in strength: the stock-discrepancy allegation has a real, if imperfect, documentary trail (a consistent pattern across three weeks, one team leader vs. the comparison group) but a genuine evidence gap (the audit log hole) that a thorough investigator should flag rather than either dismiss or treat as proof. The bullying allegation rests on one fairly specific, fairly serious witness account (Sadia) and one vague, unconfirmed one (Gareth) — a competent investigator should not treat these as equally weighted, and should notice that Sadia's own account says the behaviour "hasn't happened in the last few weeks," which matters for whether this is ongoing or historic. Rob's own admission that he didn't follow up 3 months ago is a process gap worth the tester noticing (did Compass's case-readiness/guardrail signals ever surface a version of "concern raised but not acted on" as a pattern worth asking about?). There is no clean answer here — the point is whether Compass's tools (Allegations tab structuring the two claims separately, Timeline reconstructing the chronology, evidence-quality signals) help the tester hold this complexity, or whether everything gets flattened into one undifferentiated case note.

---

## Scenario 3 — Grievance

**Tests:** whether Compass handles the employee-as-complainant perspective naturally, and whether HR can disentangle several bundled concerns into distinct issues.

### Raw material given to the tester

> **From:** Aisha Rahman, Customer Service Advisor
> **To:** HR
> **Subject:** I'd like to raise a grievance
>
> I've been putting off writing this but I don't think things are going to improve unless I say something formally.
>
> Since the new rota system started in March I've put in three separate flexible working requests to get Wednesdays off (my daughter's hospital appointments are always on Wednesdays, this is a standing thing not a one-off). All three have been turned down by my manager, Grant, with basically the same reason each time — "we can't spare you on Wednesdays" — but I've noticed at least two other people on the team have had ad-hoc days off at short notice on Wednesdays in the last couple of months without it apparently being a problem.
>
> On top of that, in a team meeting a few weeks ago Grant made a comment when I asked a process question — something like "maybe write it down this time so we don't have to go through this again" — in front of the whole team. It's a small thing on its own but it's part of a pattern where I feel like I get spoken to differently than the rest of the team.
>
> I like this job and I don't want to make a big thing of this if it can be sorted out sensibly, but three refusals and comments like that, I don't feel I'm being treated fairly compared to my colleagues.
>
> Aisha

**Additional facts available on request:**
- The two colleagues who reportedly had ad-hoc Wednesdays off: Leanne Foy and Marcus Webb, both on the same team. Neither has a standing flexible working arrangement on file — their absences were one-off approved by Grant informally, not through the same request process Aisha used.
- Grant Aldous (Customer Service Team Leader) has not yet been asked for his account — a witness statement or manager response is available on request:

> **Grant Aldous, Team Leader, provided on request:**
>
> I turned Aisha's requests down because Wednesdays are genuinely our busiest day for inbound calls and we're already tight on cover — it wasn't personal. I honestly didn't think about the two ad-hoc days for Leanne and Marcus in the same terms because those were one-offs I approved on the day, not a standing change to their contracted pattern like Aisha was asking for. Thinking about it now I can see how it looks though.
>
> The comment in the meeting — I don't remember saying it exactly like that but it's possible, it was a busy day and I was probably a bit short with everyone, not just Aisha. I didn't mean anything by it and I'd be genuinely upset if she felt singled out.

### Facilitator context (do not give to tester)

There are at least two distinct issues bundled into one grievance: (1) a discrimination-adjacent access-to-flexible-working concern (three formal requests refused vs. two informal one-offs granted to others — genuinely ambiguous, since "standing pattern change" and "ad-hoc day" are not identical requests, but close enough that a thorough HR professional should investigate rather than accept Grant's framing at face value) and (2) a treatment/conduct concern about the meeting comment. A good outcome here notices these are two separable issues that may need separate findings, checks whether Aisha's flexible working requests were handled via the correct statutory process (was there a proper written response with reasons and an appeal right each time, or informal refusals?), and treats "I don't want to make a big thing of this" as something to note but not as permission to under-investigate. This scenario deliberately does not tell the tester whether Grant's refusals were reasonable — that's a judgement call the process should surface evidence for, not something the scenario pack answers for them.

---

## Scenario 4 — Attendance / Occupational Health

**Tests:** whether Compass supports information-gathering, process management, and human judgement around a case that has no single "right answer" — not whether the tester knows employment law.

### Raw material given to the tester

> **From:** Priya Nathan, Shift Manager, Reading DC1
> **To:** HR
> **Subject:** Martin Kowalski — attendance
>
> Wanted to get your steer on Martin. Delivery driver, been with us just over two years, generally a good performer.
>
> Over the last four months he's had five separate short absences (1-2 days each — two "unwell", one "back playing up", one "stomach bug", one no specific reason given on the return form) plus one longer stretch of eight days back in month two which he said was flu that "really knocked him about."
>
> When he came back from the eight-day one we had an informal chat and he mentioned his back's "not been right for a while" and that lifting the heavier parcels has been getting harder. I told him informally to let the warehouse team know if he needs a hand with anything heavy and he seemed to appreciate that, but I haven't written any of that down anywhere or done anything more formal about it.
>
> I don't know if the back thing is connected to all the other absences or if it's just one of several separate things going on. He hasn't said anything else about his health beyond that one conversation. I don't want to make him feel got at, he's a good driver, but five absences plus an 8-day stretch in four months is starting to add up and I need to know what to do about it, and whether I should be doing something more formal about the back given what he said.
>
> Priya

**Additional facts available on request:**
- Martin has not had a return-to-work conversation formally recorded for any of the five short absences — only the 8-day one had any note taken (Priya's informal chat, not written down anywhere in Compass until now).
- No Occupational Health referral has been made.
- No fit note was provided for any of the absences (all were within the self-certification period, or Martin didn't submit one for the 8-day one — unclear, available if the tester asks Priya directly in the scenario, whose answer is: "I don't think he gave me one for the 8-day one, I'd have to check.").
- Martin has not been asked directly whether he considers his back issue to be a disability or ongoing condition — this has never been asked.

### Facilitator context (do not give to tester)

This scenario has no single correct outcome — the point is whether the tester's process is sound, not which decision they land on. A thorough response should: formally record a return-to-work conversation for the pattern of absence (not just the long one); recognise the back-pain disclosure as something that may trigger a duty to consider adjustments and/or an OH referral, but also recognise there genuinely isn't enough information yet to know if it's a disability under the Equality Act — the right move is to gather more information (via OH or directly with Martin), not to assume either way; use Compass's OH referral flow (consider_referral → hr_review → adjustments_considered → review_date) rather than leaving Priya's informal "let the warehouse team help him" arrangement undocumented; and treat the five short, varied-reason absences as a genuine attendance-pattern question distinct from the back issue, not automatically the same thing. A tester who immediately jumps to a formal warning without gathering more information, or who ignores the back-pain disclosure entirely, has missed the point of the scenario either way.

---

## Scenario 5 — Disciplinary → Outcome → Appeal

**Tests:** the highest-priority end-to-end journey — understanding a completed investigation, progressing to and recording a human outcome using Compass's quality/guardrail functionality, preparing the outcome communication, and handling an appeal.

### Raw material given to the tester

> **Investigation summary (already on file — this case starts with the investigation complete)**
>
> **Subject:** Grace Oduya, Warehouse Supervisor, Swindon DC2
> **Allegation:** On 4th, Grace was found to have wedged open and disabled the safety interlock on Conveyor Line 3's guard gate, allowing the line to keep running with the guard open, in order to clear a jam faster during a backlog. Ten minutes later, an operative (Kian Doyle) reached into the guarded area to clear a second jam, believing the line was stopped as per normal procedure when the guard is open, and narrowly avoided a hand injury when the belt engaged.
>
> **Evidence gathered during investigation:**
> - CCTV confirms Grace wedging the guard gate mechanism at approximately 14:12, and confirms Kian's near-miss at approximately 14:22.
> - Grace's investigation interview (12th): she accepts she disabled the interlock, says the line was "massively backed up," she'd done the same thing "once or twice before with no issue," and that she "didn't think it through" regarding anyone else being near the line. She says she didn't warn Kian or anyone else that the guard was disabled.
> - Kian's witness statement: confirms the near-miss, confirms no one had told him the guard was disabled, says "if I'd been half a second later I'd have lost fingers."
> - Site safety records confirm Conveyor Line 3's guard interlock is a Category 3 safety-critical control per the site's own risk assessment, not a minor procedural step.
> - No evidence found that Grace had disabled the interlock on any other occasion beyond her own account of "once or twice before" — this could not be independently corroborated either way.

### Facilitator context (do not give to tester)

This scenario deliberately starts past the investigation stage so the tester's work is disciplinary progression, outcome, and appeal — not investigation technique (already covered by Scenarios 1–2). Watch specifically for: does the tester review the existing investigation material before acting, or skip straight to recording an outcome; does Compass's guardrail/quality functionality (e.g. "a finding was recorded with little or no reasoning", case-readiness checks) get noticed and engaged with, or ignored; does the tester treat the outcome decision as theirs to make (Compass does not recommend a specific sanction — if the tester expects Compass to tell them what sanction to apply, that is itself a significant finding about AI/human-decision boundary understanding, see brief Section 11); is the outcome letter reviewed/edited by the tester before it's treated as final, or accepted verbatim.

**Appeal, introduced after the tester has recorded an outcome and progressed the letter** — give this to the tester once they reach that point:

> **From:** Grace Oduya
> **To:** HR
> **Subject:** Appeal
>
> I want to appeal the outcome. I accept I disabled the guard and I know that was wrong, I'm not disputing that bit. But I don't think the decision took into account that I've been a supervisor here for six years with no prior issues at all, and that I was covering two people's workload that day because we were short-staffed, which is why the line backed up in the first place. I don't think that context was properly considered.

**Facilitator note on the appeal:** check whether the tester's chosen Appeal Manager is genuinely independent of the original decision (was the original decision-maker also assigned to hear the appeal? Compass's own guardrail checks for exactly this — "the Appeal Manager made the original decision" — a tester who reaches this stage without Compass's guardrail catching a conflict, or who overrides it without a documented reason, is a real finding).

---

## Scenario 6 — Deliberately Messy / High-Risk Case

**Tests:** whether Compass genuinely helps HR identify problems *before* a decision is made — the tester is not told where the problems are.

### Raw material given to the tester

> **From:** Denise Okoro, IT Manager, Reading DC1
> **To:** HR
> **Subject:** Need to move fast on this — Simon Boateng
>
> I think we need to just move to dismiss Simon, it's pretty obvious what's happened here and I don't want this dragging on.
>
> Basically Simon's been accessing files he shouldn't on the shared drive — specifically stuff belonging to Nadia Cole, who he's had some personal tension with for a while (they used to be close, had some kind of falling out a few months back, not sure of the details). Nadia came to me a couple of weeks ago and said she thought Simon had been "going through her stuff," and I said I'd look into it, though to be honest with everything going on I didn't get round to actually checking anything at the time.
>
> Then yesterday Nadia messaged me again saying it happened again, and this time she was more specific — she thinks it was during the week of the 3rd, though she said before that she wasn't sure if it was "that week or the week before, one of those two." I pulled some access logs myself and I can see Simon's account did access a folder in Nadia's user area, timestamped the 5th.
>
> There was meant to be another person who saw something too — Nadia mentioned "Fola saw him at my desk when I wasn't there" — but I haven't actually spoken to Fola myself, that's just what Nadia told me.
>
> Given Simon's the one who set up most of our access permissions in the first place, I think we need to treat this seriously and quickly. Can we get this moving today or tomorrow?
>
> Denise

**Email chain, provided on request — this is a longer email from Simon, given if the tester reaches out to him or asks for "his side," which contains the key resolving fact buried in the middle:**

> **From:** Simon Boateng
> **To:** Denise Okoro (forwarded to HR)
> **Subject:** RE: RE: access query
>
> Hi Denise, following up properly since you asked me about this in passing last week.
>
> Been a mad few weeks tbh — we've had three password reset tickets from Nadia's area, the printer mapping broke again for that whole floor after the network change, and I was still catching up on the backlog from when Priti was off sick. On top of the usual stuff. I know things have been off between me and Nadia since earlier in the year, I'm not going to pretend that's not awkward, but I want to be clear this wasn't anything to do with that. On the 5th I was in her user folder because her account got flagged for a permissions error after the network change (this happened to two other people that week too, not just her, you can check the ticket queue) and I had to go in and reset her folder permissions manually since the automated tool wasn't picking it up properly that week — there's a ticket for it, should be #4471 or thereabouts. I didn't open or read any of her actual files, I was in the permissions/metadata level, not the file contents. Genuinely happy to walk someone through exactly what I did if that helps clear it up, I've got nothing to hide here.
>
> Simon

**Facilitator-only additional facts** (do not give to the tester unless they specifically request "the IT ticket queue" or "Fola's statement" — if they think to ask, provide; if they don't, that is itself the finding):

- Ticket #4471 does exist and does correspond to a permissions-reset job on the 5th, logged as system-generated (not proof Simon didn't also look at files, but real corroboration for his account).
- Fola has never been asked for a statement by anyone. If the tester tries to obtain one: "Fola isn't sure exactly what she saw — she remembers seeing Simon 'near' Nadia's desk on some occasion but can't confirm a date, and says she didn't see a screen or what he was doing."
- Denise (the reporting manager) is also the person who would normally be asked to help investigate IT-system questions in a case like this — a conflict of interest the tester should notice and route around.

### Facilitator context (do not give to tester)

This is the scenario specifically designed to test judgement under incomplete, contradictory, and pressured information. The deliberate problems: **missing witness evidence** (Fola referenced but never actually gives a clear statement); **contradictory/uncertain chronology** (Nadia can't confirm which week, Denise's own log evidence pins it to the 5th, Simon's account also lands on the 5th but with an innocent explanation); **procedural risk** (Denise is pushing for a fast dismissal before an investigation has happened at all, and Denise herself has a conflict of interest as both the reporting manager and the natural first port of call for IT-system verification); **unresolved allegation** ("it happened again" — Nadia's second, vaguer claim about a second occasion is never actually pinned down to a date or corroborated at all); **buried resolving information** (Simon's ticket number and explanation, in the middle of a casual, rambling email, is the single most important fact in the case and easy to skim past); and **pressure toward a premature decision** (Denise's opening line literally asks HR to "just move to dismiss" before anything has been investigated).

A strong result: the tester does *not* take Denise's framing at face value, requests the actual evidence (access logs, ticket queue) rather than accepting a manager's verbal summary, notices the conflicting chronology and treats it as unresolved rather than picking whichever date is convenient, recognises Denise's conflict of interest, and does not progress toward any disciplinary outcome without a proper investigation — regardless of how the case eventually resolves. A weak result: the tester builds a case file that takes Denise's account as settled fact, misses or doesn't act on Simon's ticket-number explanation, never surfaces the unresolved second-incident claim as a gap, and/or the case timeline in Compass ends up reflecting whichever version of events was typed in first rather than surfacing the contradiction between Nadia's uncertain date and the logged access date. Whether Compass's own guardrails/quality checks (evidence-linked-to-allegation, unanswered-questions-outstanding, finding-reasoning checks) catch any of this *without the tester manually forcing the issue* is the single most important observation in this scenario, and worth its own line in Document G regardless of what the human tester does.
