import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Live Context neutrality (Human UAT, P1). During a live appeal hearing, Live
// Context told the chair that the recording error was "an immediate procedural
// risk" which "could undermine the fairness of the original decision and
// strengthen the appeal", and that the warning could be "difficult to uphold".
// The employee's own assertions had become findings and the appeal's merits had
// been predicted — shown to the person deciding it, mid-hearing.
//
// The old prompt commissioned exactly that: it asked the model to "flag any
// immediate legal or procedural risks". These tests pin the deterministic
// prompt contract; they deliberately assert nothing about model output.
const app = readFileSync('src/App.jsx', 'utf8');

// The updateLiveContext function body, from its declaration to the next state
// declaration after it.
const liveContextFn = (() => {
  const start = app.indexOf('const updateLiveContext = async (notes)');
  const end = app.indexOf('const [homeAttachment', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return app.slice(start, end);
})();

// The system prompt string alone, excluding the explanatory code comment
// above it (which quotes the old wording in order to explain why it went).
const systemPrompt = (() => {
  const start = liveContextFn.indexOf('system:"You are an HR advisor');
  const end = liveContextFn.indexOf('messages:[', start);
  expect(start).toBeGreaterThan(-1);
  return liveContextFn.slice(start, end);
})();

describe('Live Context is a neutral summary (1-5)', () => {
  it('1. defines itself as a neutral running summary of what is being said', () => {
    expect(liveContextFn).toMatch(/keeping a neutral running summary for the person chairing it/);
    expect(liveContextFn).toMatch(/reflect what is actually being said/);
    expect(liveContextFn).toMatch(/the issues raised, what the employee says, what they accept or dispute/);
  });

  it('2. requires attribution', () => {
    expect(liveContextFn).toMatch(/PRESERVE ATTRIBUTION/);
    expect(liveContextFn).toMatch(/Someone saying something establishes only that they said it/);
  });

  it('3. distinguishes employee account from established fact, with worked examples', () => {
    expect(liveContextFn).toMatch(/The employee says they were not aware of the vehicle policy requirement/);
    expect(liveContextFn).toMatch(/never .*The vehicle policy was not communicated/);
    expect(liveContextFn).toMatch(/what the employee says, alleges, believes, accepts or disputes/);
  });

  it('4. distinguishes an issue raised from a finding, and forbids collapsing the tiers', () => {
    expect(liveContextFn).toMatch(/Hold these apart and never collapse one into another/);
    expect(liveContextFn).toMatch(/a matter that has been raised for consideration/);
    expect(liveContextFn).toMatch(/something directly established by what has been said/);
  });

  it('5. permits open questions and clarification', () => {
    expect(liveContextFn).toMatch(/something that remains unclear and may need clarifying/);
    expect(liveContextFn).toMatch(/what still needs clarifying/);
  });
});

describe('prohibited merits / advisory behaviour (6-18)', () => {
  const prohibited = [
    ['6. credibility', /judge anyone's credibility/],
    ['7. deciding whether an assertion is true', /decide whether an account is true/],
    ['8. assertion becoming fact', /turn an assertion or allegation into an established fact/],
    ['9. unsupported procedural-defect conclusions', /conclude that a procedural defect occurred unless what was said directly establishes it/],
    ['10/11. strengthens or weakens an appeal', /say that anything strengthens or weakens an appeal/],
    ['12/13. defensible, indefensible or difficult to uphold', /say an outcome is defensible, indefensible or difficult to uphold/],
    ['14. outcome prediction', /predict the likely outcome/],
    ['15. uphold or dismiss recommendation', /recommend that an appeal be upheld or dismissed/],
    ['16. sanction recommendation', /recommend any sanction/],
    ['17. generic legal propositions used to judge merits', /introduce general propositions of law or good practice in order to judge the merits of what has just been said/],
    ['18. absence of evidence as proof or risk', /treat missing information as proof that something did or did not happen, or as a risk in its own right/],
  ];

  it('opens an explicit prohibition list', () => {
    expect(liveContextFn).toMatch(/DO NOT:/);
  });

  for (const [label, pattern] of prohibited) {
    it('prohibits ' + label, () => {
      expect(liveContextFn).toMatch(pattern);
    });
  }

  it('the old risk-flagging instruction is gone from the prompt itself', () => {
    // Scoped to the prompt: the code comment above it deliberately quotes the
    // old wording to record what was removed and why.
    expect(systemPrompt).not.toMatch(/flag any immediate legal or procedural risks/);
  });

  it('19. preserves neutral "may be relevant / may require clarification" formulations', () => {
    expect(liveContextFn).toMatch(/this may be relevant and may require clarification/);
    expect(liveContextFn).toMatch(/the employee has raised this as a concern/);
    expect(liveContextFn).toMatch(/it remains unclear from what has been said whether/);
  });
});

describe('immediate-action exception (20-22)', () => {
  it('20. the exception exists and names concrete in-room situations', () => {
    expect(liveContextFn).toMatch(/ONE EXCEPTION/);
    expect(liveContextFn).toMatch(/asking to be accompanied or for an adjournment/);
    expect(liveContextFn).toMatch(/do not understand the process/);
    expect(liveContextFn).toMatch(/appearing or saying they are distressed/);
    expect(liveContextFn).toMatch(/health, welfare or safeguarding matter/);
    expect(liveContextFn).toMatch(/communication or accessibility support/);
  });

  it('21. is scoped to what the notes themselves show, and forbids manufacturing one', () => {
    expect(liveContextFn).toMatch(/where the notes themselves show something needing the chair's attention DURING this meeting/);
    expect(liveContextFn).toMatch(/Do not manufacture such an issue where the notes do not show one/);
  });

  it('22. draws the in-room action vs case-merits judgement line explicitly', () => {
    expect(liveContextFn).toMatch(/An action to take in the room is always in scope/);
    expect(liveContextFn).toMatch(/A judgement about the merits of the case never is/);
  });
});

describe('output style is unchanged (23-27)', () => {
  it('23. still 2-3 short sentences', () => {
    expect(liveContextFn).toMatch(/In 2-3 short sentences/);
  });

  it('24/25/26. plain prose, no questions, no bullet points', () => {
    expect(liveContextFn).toMatch(/No questions\. No bullet points\. Plain prose only\./);
  });

  it('27. still specific to what was said', () => {
    expect(liveContextFn).toMatch(/Be specific to what was said/);
  });

  it('is not turned into a checklist or a second prep pack', () => {
    expect(liveContextFn).not.toMatch(/## |Legal Checklist|Risk Flags|Unanswered Issues/);
  });
});

describe('call shape and inputs are unchanged (28-37)', () => {
  it('28/29. model and max_tokens unchanged', () => {
    expect(liveContextFn).toMatch(/model:"claude-sonnet-4-6"/);
    expect(liveContextFn).toMatch(/max_tokens:250/);
    expect(liveContextFn).toMatch(/stream:false/);
  });

  it('30. the 10-word gate is unchanged', () => {
    expect(liveContextFn).toMatch(/if\(notes\.trim\(\)\.split\(\/\\s\+\/\)\.length < 10\) return;/);
  });

  it('31. notes.slice(-2000) is unchanged', () => {
    expect(liveContextFn).toContain('notes.slice(-2000)');
  });

  it('33/34/35. no case context, signals, prep questions, allegations or outcome were added', () => {
    // Code identifiers — no case data of any kind is wired into this call.
    // ("allegation" as a word legitimately appears in the prompt's own
    // prohibition against turning an allegation into an established fact.)
    for (const forbidden of ['caseInfo', 'caseSignals', 'prepQuestions', 'allegationsForCase', 'carriedContext', 'buildMeetingPrepGrounding', 'buildMeetingPrepInstructions']) {
      expect(liveContextFn).not.toContain(forbidden);
    }
    // The user turn still carries only the meeting-type label and the notes.
    expect(liveContextFn).toContain('content:"Meeting: "+(meetingType?.label||"General")+"\\nNotes:\\n"+notes.slice(-2000)');
  });

  it('36. exactly one AI call, no new endpoint', () => {
    expect((liveContextFn.match(/authedFetch\(/g) || []).length).toBe(1);
    expect(liveContextFn).toContain('authedFetch("/api/chat"');
  });

  it('37. Live Context remains session-only — state, never persisted', () => {
    expect(liveContextFn).toMatch(/setLiveContext\(text\)/);
    expect(liveContextFn).not.toMatch(/supabase|\.insert\(|\.update\(|localStorage|saveMeeting|audit\(/);
  });

  it('32. the trigger cadence is unchanged — every 3rd utterance, plus the per-note call', () => {
    expect(app).toMatch(/transcript\.length>0 && transcript\.length%3===0/);
    expect(app).toContain('updateLiveContext(notes);');
    const record = readFileSync('src/screens/RecordScreen.jsx', 'utf8');
    expect(record).toContain('updateLiveContext(val);');
  });
});

// Deliberate boundary: B (question-status inference) is a separate, still-open
// P2 and was explicitly out of scope here. This proves the patch did not drift
// into it.
describe('question-status inference was NOT changed in this remediation', () => {
  const intelligenceFn = (() => {
    const start = app.indexOf('const updateMeetingIntelligence = async (notes)');
    expect(start).toBeGreaterThan(-1);
    return app.slice(start, start + 4000);
  })();

  it('the conservative status instruction is untouched', () => {
    expect(intelligenceFn).toMatch(/Only include a question you have real evidence for in the transcript — omit ones you're unsure about rather than guessing/);
  });

  it('the tracked-question filter and manual-status protection are untouched', () => {
    expect(intelligenceFn).toMatch(/prepQuestions\.filter\(q=>q\.statusSource!=="user"\)/);
    expect(app).toMatch(/setPrepQuestionStatusHelper\(acc, u\.id, u\.status, "ai"\)/);
  });

  it('both status-inference triggers are untouched', () => {
    expect(app).toContain('updateMeetingIntelligence(notes);');
    const record = readFileSync('src/screens/RecordScreen.jsx', 'utf8');
    expect(record).toContain('updateMeetingIntelligence(val);');
  });

  it('the question status model is untouched', () => {
    const lib = readFileSync('src/lib/prepQuestions.js', 'utf8');
    expect(lib).toContain('not_asked');
    expect(lib).toContain('statusSource');
  });
});
