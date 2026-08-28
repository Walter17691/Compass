# Document B — Facilitator Guide

## Your job in one sentence

Watch what a real HR professional does when given a realistic situation and Compass, say as little as possible, and write down everything — especially the parts that feel awkward to write down.

## Before the session

1. Confirm the tester's profile (Document A) and which scenario(s) they're assigned (see the allocation matrix in the README).
2. Log into the UAT organisation as the correct role for that scenario (most scenarios need HR-director-equivalent access; note in Document E if a scenario deliberately uses a manager-level or non-HR account).
3. Confirm the case does **not** already exist in the UAT org from a previous session (if scenarios repeat across testers, use a fresh synthetic employee name per session so cases don't collide — see Document C's per-session naming note).
4. Have Document E (Observation Sheet) and Document C's scenario pack for this session open and ready. Start screen recording.
5. Do **not** show the tester Home, a case, or any part of the product before the session starts. Their very first interaction with the screen is data.

## Opening script

Read this close to verbatim — consistency across sessions matters more than sounding natural:

> "Thanks for doing this. I'm going to give you a situation, the way it might actually land on your desk, and ask you to use Compass to manage it, however you'd naturally do that. There's no correct sequence of clicks I'm looking for — I'm here to watch how the product works for a real person, not to test whether you can guess what's in my head.
>
> A few things:
>
> - Please think out loud as much as you can — what you're looking for, what you expect to happen, if something surprises you.
> - If you get stuck, that's genuinely useful information, not a failure on your part — tell me you're stuck rather than quietly working around it, and I'll ask you a question back before I help.
> - Everything in this scenario is fictional — no real employees, no real cases.
> - This should take somewhere between 45 and 60 minutes. We can stop earlier if you finish, or pause if you need to.
>
> Ready? Here's the situation."

Then hand over Document D's task sheet for the assigned scenario(s) and stop talking.

## What to do during the session

**Do:**
- Sit slightly behind/beside the tester, not directly over their shoulder.
- Write down navigation choices as they happen, not just outcomes — *which* nav item they clicked first, whether they hovered over something and moved away, whether they used search instead of navigation.
- Note the exact words a tester uses for things ("I'm going to open a... case? Investigation? Not sure what this is called") — terminology confusion is a real finding.
- Time each major task from when the tester starts reading the task sheet to when they consider it done (self-reported "done" — don't correct them in the moment even if they've missed something; that gap is itself the finding).
- Ask the AI-trust question (brief Section 11) immediately after any task where the tester interacts with a Compass Recommendation, an AI-drafted letter, or the AI Assistant tab — don't save it to the end, memory of the specific moment fades.

**Do not:**
- Explain what a button does before they've tried clicking it or asked.
- Correct a wrong assumption in the moment ("actually that's not what that means") — let them proceed on the wrong assumption and log where it leads. Correct it only in the debrief, not during the task.
- Praise or discourage particular choices ("good idea to check the Timeline first") — even positive steering changes behaviour.
- Fill silences. A tester staring at a screen for 15 seconds thinking is data, not a cue for you to speak.

## The intervention ladder

Never jump straight to the answer. Use the lowest rung that unsticks the tester, and log which rung you used (Document E has a field for this).

1. **Silence.** Give it real time — 20–30 seconds of visible hesitation is normal and not yet a reason to speak.
2. **Neutral reflection.** If they ask "what do I click?", respond: *"What would you expect to do here?"* or *"What are you trying to accomplish right now?"* Do not hint at the answer.
3. **Open re-direction to their own goal.** *"What information do you still need before you'd feel ready to do that?"* — nudges them back toward the task's actual goal without naming a screen or button.
4. **Named but non-specific help.** *"There's a way to do that in Compass — where would you guess it might live?"* — confirms the capability exists without saying where.
5. **Direct assistance.** Only once a tester has genuinely stalled for a meaningful stretch (use judgement — roughly 2+ minutes of unproductive searching, or visible frustration that's derailing the rest of the session) or explicitly asks you to just show them. Show them the minimum needed to continue, then let them proceed unassisted from there. Log this as SUCCESS WITH ASSISTANCE (or FAILURE if they still couldn't complete it) and record exactly what you showed them.

**When to intervene immediately, skipping the ladder:**
- The tester is about to send a real email, issue a real letter, or take an action with an external-world consequence outside the synthetic scenario (shouldn't happen in a UAT org, but stop it immediately if it looks like it might).
- The tester is visibly distressed or the session is clearly not going to produce useful data (technical failure, tester unwell, etc.) — pause or end the session rather than push through.
- Safety/data issue: the tester is about to enter anything that looks like real personal data rather than the provided synthetic material.

## When to stop testing and fix something immediately

Most findings wait for the debrief and Document G. A small number don't. Stop the session (or at minimum flag for immediate escalation after it) if you observe:

- A tester viewing, editing, or being able to reach another organisation's case data (tenant isolation failure) — this is a **stop everything** event, not a UAT-P0 log entry to file later.
- A tester's action appears to silently fail to save (they believe they've recorded an outcome/note and it visibly hasn't persisted) — verify immediately before the tester leaves, because this may indicate real data loss risk, not just a UX gap.
- Anything that looks like it exposed one tester's synthetic data to a session they weren't part of, or any real (non-synthetic) personal data appearing anywhere in the UAT org.

Everything else — however severe as a UX or trust problem — gets logged in Document G and triaged afterward, not fixed mid-UAT. Do not open the codebase during a session.

## Debrief (last 5–10 minutes of the session)

1. Ask the Section 11 AI-trust questions for any AI interactions not yet covered.
2. Run Document F (post-test questionnaire) — verbally is fine, facilitator records answers.
3. Ask the two closing questions verbatim:
   - *"If Compass disappeared tomorrow, which feature would you miss most?"*
   - *"What is the one thing that would stop you using Compass?"*
4. Thank them, stop recording, and immediately (same day) transfer raw notes into Document E and any defects into Document G while memory is fresh — do not batch this across multiple sessions.

## A note on your own bias

You (the facilitator) built this product across the preceding phases of this engagement. You will feel every hesitation as a personal verdict, and the instinct to explain, defend, or rescue the tester will be strong. The entire value of this exercise depends on resisting that instinct. If you notice yourself wanting to jump in below rung 1 of the ladder, that is the signal to write down what just happened instead.
