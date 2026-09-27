import { describe, it, expect } from 'vitest';
import { getProcessType, getStageDefinitions, stageLabel, hasGuidedStages, PROCESS_TYPES } from '../lib/processStages';
import { getNextStep, hasGuidedProcess } from '../lib/nextStep';

describe('processStages', () => {
  // Phase E1.4A split this in two. It used to assert that EVERY registered
  // process type had a stage sequence ending in "closed" — which was only true
  // because five types that Compass owns no stage model for were pointed at
  // DISCIPLINARY_STAGES. That made the assertion a statement of the defect.
  it('every process type Compass OWNS a stage model for ends in "closed"', () => {
    const guided = PROCESS_TYPES.filter(p => p.stages.length > 0);
    expect(guided.map(p => p.id).sort()).toEqual(
      ['flexible_working', 'grievance', 'long_term_sickness', 'misconduct', 'probation']
    );
    guided.forEach(p => {
      expect(p.stages.length, p.id).toBeGreaterThan(1);
      expect(p.stages[p.stages.length - 1].id, p.id).toBe('closed');
    });
  });

  it('a process type Compass owns no stage model for declares none', () => {
    // Not "borrows the disciplinary one". Not "has a placeholder". None.
    const unguided = PROCESS_TYPES.filter(p => p.stages.length === 0);
    expect(unguided.map(p => p.id).sort()).toEqual(
      ['appeal', 'attendance', 'capability', 'other', 'redundancy']
    );
  });

  it('no process type borrows another process type\'s stage model', () => {
    // The precise defect: five entries were the SAME array object as misconduct's.
    const byId = Object.fromEntries(PROCESS_TYPES.map(p => [p.id, p.stages]));
    PROCESS_TYPES.filter(p => p.stages.length > 0 && p.id !== 'misconduct')
      .forEach(p => expect(p.stages, p.id).not.toBe(byId.misconduct));
    PROCESS_TYPES.filter(p => p.stages.length > 0 && p.id !== 'grievance')
      .forEach(p => expect(p.stages, p.id).not.toBe(byId.grievance));
  });

  it('resolves known synonyms onto the same canonical entry', () => {
    expect(getProcessType('attendance').id).toBe('attendance');
    expect(getProcessType('absence').id).toBe('attendance');
    expect(getProcessType('attendance/sickness').id).toBe('attendance');
    expect(getProcessType('performance').id).toBe('capability');
    expect(getProcessType('capability').id).toBe('capability');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(getProcessType('  Probation  ').id).toBe('probation');
    expect(getProcessType('FLEXIBLE WORKING').id).toBe('flexible_working');
  });

  it('falls back to "other" for an unrecognized or missing case type', () => {
    expect(getProcessType('something made up').id).toBe('other');
    expect(getProcessType(undefined).id).toBe('other');
    expect(getProcessType('').id).toBe('other');
  });

  it('long-term sickness follows the spec\'s own worked stage sequence', () => {
    const ids = getStageDefinitions('long-term sickness').map(s => s.id);
    expect(ids).toEqual([
      'absence_identified', 'contact_welfare', 'medical_evidence', 'occupational_health',
      'adjustments_considered', 'review', 'capability_consideration', 'decision', 'closed',
    ]);
  });

  it('misconduct and grievance keep the exact stage ids caseStage.js already infers, unchanged', () => {
    expect(getStageDefinitions('misconduct').map(s => s.id)).toEqual(
      ['intake', 'investigation', 'inv_report', 'disciplinary', 'outcome', 'appeal', 'closed']
    );
    expect(getStageDefinitions('grievance').map(s => s.id)).toEqual(
      ['intake', 'hearing', 'outcome', 'appeal', 'closed']
    );
  });

  it('stageLabel returns the human label, or the raw id if not found', () => {
    expect(stageLabel('probation', 'check_in')).toBe('Check-in');
    expect(stageLabel('probation', 'not_a_real_stage')).toBe('not_a_real_stage');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.4A — the stage half of the same fail-safe.
//
// E1.4 stopped unsupported process types receiving another process's NEXT-STEP
// guidance. The stage registry was still handing them another process's STAGE
// MODEL, so Compass would refuse to say what to do next while simultaneously
// drawing the case as "Concern raised -> Investigation -> Disciplinary hearing
// -> Outcome -> Appeal". 770 production cases were being drawn that way.
describe('E1.4A — no process type inherits another process\'s stages', () => {
  const stageIds = t => getStageDefinitions(t).map(s => s.id);
  const DISCIPLINARY = ['intake', 'investigation', 'inv_report', 'disciplinary', 'outcome', 'appeal', 'closed'];

  describe('validated stage models are untouched', () => {
    it('misconduct keeps the exact disciplinary sequence', () => {
      expect(stageIds('misconduct')).toEqual(DISCIPLINARY);
    });

    it('investigation, disciplinary and conduct concern all resolve to it', () => {
      ['investigation', 'disciplinary', 'conduct concern'].forEach(t => {
        expect(stageIds(t), t).toEqual(DISCIPLINARY);
      });
    });

    it('the appeal STAGE remains part of that one misconduct process', () => {
      // A6: the appeal stage inside a misconduct case is not the same thing as
      // a standalone case typed "appeal", and must survive untouched.
      expect(stageIds('misconduct')).toContain('appeal');
      expect(stageIds('misconduct').indexOf('appeal')).toBe(5);
      expect(stageIds('misconduct').indexOf('appeal'))
        .toBeGreaterThan(stageIds('misconduct').indexOf('disciplinary'));
      expect(stageLabel('misconduct', 'appeal')).toBe('Appeal');
    });

    it('grievance, probation, flexible working and long-term sickness keep theirs', () => {
      expect(stageIds('grievance')).toEqual(['intake', 'hearing', 'outcome', 'appeal', 'closed']);
      expect(stageIds('probation')[0]).toBe('probation_started');
      expect(stageIds('flexible working')[0]).toBe('request_received');
      expect(stageIds('long-term sickness')[0]).toBe('absence_identified');
      ['grievance', 'probation', 'flexible working', 'long-term sickness'].forEach(t => {
        expect(stageIds(t), t).not.toEqual(DISCIPLINARY);
      });
    });
  });

  describe('unsupported types inherit nothing', () => {
    // Production populations from the E1.4A audit.
    const cases = [
      ['capability', 162], ['performance', 0],
      ['attendance', 0], ['absence', 28], ['attendance/sickness', 0],
      ['redundancy', 0], ['appeal', 0], ['other', 0], ['informal', 14],
      ['something nobody configured', 0],
    ];
    cases.forEach(([type, rows]) => {
      it(`${type} (${rows} production cases) gets no stage model`, () => {
        expect(stageIds(type)).toEqual([]);
        expect(stageIds(type)).not.toEqual(DISCIPLINARY);
        expect(hasGuidedStages(type)).toBe(false);
      });
    });

    it('an untyped case gets no stage model — all 566 of them', () => {
      [undefined, null, '', '   '].forEach(t => {
        expect(stageIds(t), String(t)).toEqual([]);
        expect(hasGuidedStages(t), String(t)).toBe(false);
      });
    });

    it('hasGuidedStages is true for exactly the five owned models', () => {
      ['misconduct', 'investigation', 'grievance', 'probation',
       'flexible working', 'long-term sickness'].forEach(t => {
        expect(hasGuidedStages(t), t).toBe(true);
      });
    });

    it('the empty model cannot be mutated into a real one', () => {
      // A shared array handed to five registry entries would otherwise let one
      // caller's push corrupt every unsupported process type at once.
      const stages = getStageDefinitions('capability');
      expect(Object.isFrozen(stages)).toBe(true);
      expect(() => { stages.push({ id: 'intake', label: 'Concern raised' }); }).toThrow();
      expect(getStageDefinitions('capability')).toEqual([]);
    });
  });

  describe('adversarial — reintroducing a disciplinary stage fallback must be caught', () => {
    it('capability and misconduct must not share a stage model', () => {
      expect(stageIds('misconduct')).toEqual(DISCIPLINARY);
      expect(stageIds('capability')).toEqual([]);
      expect(getStageDefinitions('capability')).not.toBe(getStageDefinitions('misconduct'));
    });

    it('DISCIPLINARY_STAGES is referenced by exactly one registry entry', () => {
      const sharing = PROCESS_TYPES.filter(p => p.stages === getStageDefinitions('misconduct'));
      expect(sharing.map(p => p.id)).toEqual(['misconduct']);
    });

    it('stageLabel does not invent a label for an unsupported process', () => {
      // It falls back to the raw id, as it always has for an unknown stage —
      // it must not resolve "investigation" into "Investigation" for a
      // capability case, because that would mean the model came back.
      expect(stageLabel('capability', 'investigation')).toBe('investigation');
      expect(stageLabel('misconduct', 'investigation')).toBe('Investigation');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The two halves must agree.
//
// E1.4 governs what Compass RECOMMENDS; E1.4A governs what it DRAWS. The whole
// defect this pair closes was those two answers disagreeing: the engine refusing
// to suggest a disciplinary next step while the registry still drew the case as a
// disciplinary process. If they ever drift apart again, that state returns.
describe('E1.4 + E1.4A — guidance and stages agree on every process type', () => {
  const ALL = [
    'misconduct', 'disciplinary', 'conduct concern', 'investigation',
    'grievance', 'discrimination', 'whistleblowing',
    'probation', 'flexible working', 'flexible_working',
    'long-term sickness', 'long term sickness', 'long_term_sickness',
    'capability', 'performance', 'attendance', 'absence', 'attendance/sickness',
    'redundancy', 'appeal', 'other', 'informal',
    'something nobody configured', '', '   ', undefined, null,
  ];

  it('a type with no next-step recipe also has no stage sequence, and vice versa', () => {
    const disagreements = ALL.filter(t =>
      hasGuidedProcess({ caseType: t }) !== hasGuidedStages(t));
    expect(disagreements).toEqual([]);
  });

  it('the guided set is exactly the five processes Compass owns end to end', () => {
    const guided = ALL.filter(t => hasGuidedStages(t));
    expect([...new Set(guided.map(t => getProcessType(t).id))].sort()).toEqual(
      ['flexible_working', 'grievance', 'long_term_sickness', 'misconduct', 'probation']
    );
  });

  it('an unsupported type gets neither a next step nor a stage sequence', () => {
    ['capability', 'absence', 'redundancy', 'appeal', 'other', 'informal', undefined, ''].forEach(t => {
      const cs = { id: 'c', caseType: t, stage: 'investigation', meetings: [] };
      expect(getNextStep(cs), String(t)).toBeNull();
      expect(getStageDefinitions(t), String(t)).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A5 — the appeal STAGE of a misconduct process is not case_type='appeal'.
//
// E1.4A removed DISCIPLINARY_STAGES from the registry entry named "appeal". The
// risk that creates is obvious and worth an explicit walk: that in doing so the
// appeal stage INSIDE a misconduct case was damaged too. It was not. They are
// different things that happen to share a word.
describe('A5 — investigation -> disciplinary -> appeal -> closure inside ONE misconduct case', () => {
  const walk = ['intake', 'investigation', 'inv_report', 'disciplinary', 'outcome', 'appeal', 'closed'];

  it('the misconduct stage sequence is exactly that progression, in order', () => {
    expect(getStageDefinitions('misconduct').map(s => s.id)).toEqual(walk);
  });

  it('every stage in the walk still has its human label', () => {
    expect(walk.map(id => stageLabel('misconduct', id))).toEqual(
      ['Concern raised', 'Investigation', 'Investigation review',
       'Disciplinary hearing', 'Outcome', 'Appeal', 'Closed']
    );
  });

  it('the engine still guides every open stage of that walk', () => {
    // Each open stage of a misconduct case must still produce a next step; only
    // "closed" is silent. This is the progression E1.4A must not have touched.
    walk.filter(s => s !== 'closed').forEach(stage => {
      const step = getNextStep({ id: 'c', caseType: 'misconduct', stage, meetings: [] });
      expect(step, stage).not.toBeNull();
      expect(step.action, stage).toBeTruthy();
    });
    expect(getNextStep({ id: 'c', caseType: 'misconduct', stage: 'closed', meetings: [] })).toBeNull();
  });

  it('a case typed "appeal" is a different thing and gets neither', () => {
    expect(getStageDefinitions('appeal')).toEqual([]);
    expect(getNextStep({ id: 'c', caseType: 'appeal', stage: 'appeal', meetings: [] })).toBeNull();
    // But the appeal STAGE of a misconduct case is entirely unaffected.
    expect(getNextStep({ id: 'c', caseType: 'misconduct', stage: 'appeal', meetings: [] })).not.toBeNull();
  });
});
