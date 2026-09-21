import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Live meeting question UX (Human UAT, P2). Prep questions are shown to the
// chair DURING the hearing, so q.text has to be a question they can say out
// loud. Every generated question was arriving as chair-facing guidance
// ("Ask the employee whether...", "No formal grounds have been recorded. At
// the outset, ask..."), across BOTH generators — 0 of 9 live questions on the
// UAT appeal were directly askable.
//
// These pin the deterministic prompt contract we control. They deliberately do
// not assert model output: that would be a brittle probabilistic test, and the
// repo's standing rule is to test the invariants rather than the generation.
const app = readFileSync('src/App.jsx', 'utf8');

const contract = (() => {
  const start = app.indexOf('const LIVE_QUESTION_CONTRACT');
  const end = app.indexOf('export default function Compass');
  expect(start).toBeGreaterThan(-1);
  return app.slice(start, end);
})();

describe('question wording contract — definition (1-6)', () => {
  it('1/2/3. requires a directly askable, interrogative question ending in a question mark', () => {
    expect(contract).toMatch(/ONE question the chair could say out loud to the employee, word for word, exactly as written/);
    expect(contract).toMatch(/single interrogative sentence addressed to the employee/);
    expect(contract).toMatch(/must end with a question mark/);
  });

  it('4. requires one sentence, one conversational objective', () => {
    expect(contract).toMatch(/single interrogative sentence/);
    expect(contract).toMatch(/Ask about one thing at a time/);
    expect(contract).toMatch(/write two questions rather than joining them with/);
  });

  it('5. requires it to be usable live, at a glance', () => {
    expect(contract).toMatch(/displayed to the chair during the live meeting/);
    expect(contract).toMatch(/usable at a glance/);
    expect(contract).toMatch(/Keep it short enough to use live/);
  });

  it('6. gives ~20 words as guidance, explicitly not a brittle hard limit', () => {
    expect(contract).toMatch(/around 20 words is a good target/);
    expect(contract).toMatch(/a genuinely necessary question may run a little longer/);
    expect(contract).toMatch(/never pad one out, and never truncate one into something unclear/);
  });

  it('6b. forbids inflating the question count to satisfy the one-thing-at-a-time rule', () => {
    expect(contract).toMatch(/Do not inflate the overall number of questions/);
  });
});

describe('banned meta / procedural language (7-13)', () => {
  // Every phrase the UAT pack actually produced, plus the ones named in the
  // product decision.
  const banned = [
    'Ask the employee...',
    'Ask whether...',
    'Confirm with the employee...',
    'The chair should...',
    'Explore whether...',
    'Establish whether...',
    'Ensure...',
    'At the outset, ask...',
    'The case record shows...',
    'No formal grounds have been recorded...',
  ];

  it('7-12. names each banned chair-facing opener', () => {
    for (const phrase of banned) {
      expect(contract).toContain(phrase);
    }
    expect(contract).toMatch(/must never contain instructions aimed at the chair/);
  });

  it('13. forbids leading case context and context+instruction+question stacking', () => {
    expect(contract).toMatch(/must never contain explanation or case background before the question/);
    expect(contract).toMatch(/Never stack context, then an instruction, then a question into one field/);
  });

  it('13b. shows the conversion rather than only prohibiting', () => {
    expect(contract).toMatch(/What outcome are you seeking from your appeal\?/);
    expect(contract).toMatch(/Were you aware of the vehicle policy requirement at the time\?/);
    expect(contract).toMatch(/Are you accompanied today, or are you happy to proceed without a companion\?/);
  });

  it('13c. does not mechanically convert every instruction into a question', () => {
    expect(contract).toMatch(/Do not mechanically convert every procedural instruction you have been given into a question/);
    expect(contract).toMatch(/produce a question only where actually asking it helps conduct this meeting/);
  });
});

describe('reasoning contract and precedence (14-15)', () => {
  it('14. directs context, rationale and evidence to reasoning', () => {
    expect(contract).toMatch(/Put everything else in \\"reasoning\\": why the question matters, the relevant case context/);
    expect(contract).toMatch(/any evidence or unresolved issue behind it/);
    expect(contract).toMatch(/behind \\"Why ask this\?\\"/);
  });

  it('15. prep instructions govern content and safety, not the voice of q.text', () => {
    expect(contract).toMatch(/PRECEDENCE/);
    expect(contract).toMatch(/determine what is relevant, appropriate and safe to ask, and those limits always apply/);
    expect(contract).toMatch(/They do NOT determine the grammatical voice of the \\"text\\" field/);
    expect(contract).toMatch(/Where they are phrased as guidance to the chair, convert the underlying point into a question/);
  });
});

describe('both generators carry the contract, and nothing else changed (16-20)', () => {
  it('the contract is defined once and applied to both generators', () => {
    expect((app.match(/LIVE_QUESTION_CONTRACT/g) || []).length).toBe(3); // 1 definition + 2 uses
  });

  it('the Prepare-path generator applies it', () => {
    const i = app.indexOf('preparing structured questions for an upcoming Employee Relations meeting');
    const block = app.slice(i, i + 1400);
    expect(block).toContain('"+LIVE_QUESTION_CONTRACT,');
  });

  it('the auto-workspace sibling generator applies it too', () => {
    const i = app.indexOf('preparing an automatic workspace for an upcoming Employee Relations meeting');
    const block = app.slice(i, i + 1400);
    expect(block).toContain('"+LIVE_QUESTION_CONTRACT,');
  });

  it('16/17/18/19. JSON shape, categories, essential semantics and reasoning are unchanged', () => {
    const prep = app.slice(app.indexOf('preparing structured questions for an upcoming'), app.indexOf('preparing structured questions for an upcoming') + 900);
    expect(prep).toContain('\\"category\\":\\"agenda\\"|\\"evidence\\"|\\"clarification\\"|\\"unanswered\\"');
    expect(prep).toContain('\\"essential\\":true|false');
    expect(prep).toContain('\\"reasoning\\":\\"...\\"');
    expect(prep).toMatch(/Mark essential true only for questions central to the core issue/);
    expect(prep).toMatch(/this is shown to the user as \\"Why ask this\?\\"/);

    const auto = app.slice(app.indexOf('preparing an automatic workspace'), app.indexOf('preparing an automatic workspace') + 900);
    expect(auto).toContain('\\"category\\":\\"agenda\\"|\\"evidence\\"|\\"clarification\\"|\\"unanswered\\"');
    expect(auto).toContain('\\"allegationId\\"');
  });

  it('20. the existing question-count contracts are unchanged', () => {
    expect(app).toMatch(/produce 5 to 12 concise, specific questions/);
    expect(app).toMatch(/4-8 structured prep questions/);
  });

  it('no new AI call was introduced for the live screen', () => {
    const record = readFileSync('src/screens/RecordScreen.jsx', 'utf8');
    expect(record).not.toMatch(/authedFetch|streamClaude|api\/chat/);
  });
});

describe('frozen prep-pack narrative is untouched (35-36)', () => {
  it('35. the narrative prep instruction layer is not referenced by the question contract', () => {
    expect(contract).not.toMatch(/buildMeetingPrepInstructions|buildMeetingPrepGrounding/);
    // Still exactly one instruction builder — no parallel rule architecture.
    expect((app.match(/buildMeetingPrepInstructions\(/g) || []).length).toBe(1);
  });

  it('35b. the narrative prompt section list is unchanged', () => {
    expect(app).toContain('## Objectives\\n## Agenda\\n## Opening Script\\n## Evidence to Explore\\n## Unanswered Issues\\n## Potential Inconsistencies\\n## Closing Points\\n## Legal Checklist\\n## Risk Flags');
  });

  it('35c. narrative completion/fail-closed behaviour is unchanged', () => {
    expect(app).toContain('2048,\n          ({ truncated })=>{ prepTruncated = truncated; }');
    expect(app).toContain("The prep pack didn't finish generating. Please regenerate it.");
  });
});
