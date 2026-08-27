import { getCaseStage } from './caseStage.js';
import { parseFlexDate, daysBetween, addWorkingDays as addWorkingDaysDate } from './dateMath.js';
import { DEFAULT_UK_JURISDICTION } from './ukBankHolidays.js';
import { isDisciplinaryMeeting, isInvestigationMeeting } from './meetingTypeMatch.js';

// Phase 6.5 hardening (structural remediation, Prompt 12 — Deadline
// Domain Model invariant). meeting.type is free descriptive text in
// practice ("Disciplinary hearing", not always the exact MEETING_TYPES
// label "Disciplinary" — confirmed by this file's own existing test
// fixtures), so classifying it via substring match (as this file and
// several siblings across the app already do — caseStage.js, nextStep.js,
// processTimeline.js, guardrails.js among them) is the app's real,
// established pattern, not itself the bug. The bug was a missing
// exclusion: "Disciplinary Appeal" legitimately contains the substring
// "disciplinary", so an appeal hearing was silently treated as an
// original disciplinary hearing below — generating a wrong "outcome
// letter due in 5 working days" deadline off the appeal meeting, and (via
// the appeal window check) a second, nonsensical "appeal window closes"
// deadline off a letter that IS the appeal outcome. isDisciplinaryMeeting/
// isInvestigationMeeting now live in meetingTypeMatch.js (Prompt 14,
// Section 8) so caseStage.js/nextStep.js/processTimeline.js/guardrails.js
// share this exact definition instead of each maintaining their own copy.

// UK statutory & ACAS deadline rules. Pure — no React, no I/O — so it can
// run client-side (App.jsx's dueSoon effect) and server-side (the digest
// cron function) against the same case data without duplicating the rules.
// dsarRequests (optional): open DSAR requests, each { employeeName,
// due_date, status }. Fed into the same due-soon array under category
// "dsar" so the existing overdue banner, Settings list, and digest cron
// all pick up DSAR deadlines automatically with no changes of their own.
// caseTasks (optional): open case_tasks rows, each { id, caseId, name,
// dueDate, status }, category "task" — appended as a fourth, separately
// defaulted param (not inserted before `today`) so every existing
// positional call site — the digest cron included — keeps working
// unchanged until it's ready to pass tasks through too.
// wellbeingNotes/leaverInstances/redundancyCases (optional, Phase 12 of
// the reasoning-layer build-out): same trailing-optional-param treatment
// — each is real, already-captured client-side state (WellbeingScreen's
// followUpDate, OffboardingScreen's lastWorkingDay, RedundancyScreen's
// consultationStartDate) that was never threaded into the unified
// due-soon output before now. redundancyCases is localStorage-only, not
// cloud-synced, so it's client-only by nature — the digest cron will
// simply never pass it and gets zero redundancy deadlines, same graceful
// omission as any caller that doesn't pass caseTasks.
// caseAccess (optional, Manager Enablement Phase 4, MP17, §22/§23): same
// trailing-optional-param treatment again — case_access rows, each
// {caseId, role, targetCompletionDate}, feeding MP7's own investigator
// target-completion-date field into this same unified output rather than
// a separate manager-only computation, so it shows up identically
// wherever dueSoon already does (HomeScreen's HR-facing overdue banner,
// ManagerPortalScreen's own grouped view, the digest cron) with no extra
// plumbing anywhere else.
// Phase 7 (Controlled Beta Infrastructure Gate 1) — ukJurisdiction is the
// same trailing-optional-param treatment as every other param added to
// this signature over time (see wellbeingNotes/leaverInstances/
// redundancyCases/caseAccess's own comments above): every existing call
// site keeps working unchanged, defaulting to England & Wales
// (ukBankHolidays.js's own default), while a caller that knows an org's
// real configured jurisdiction can pass it through.
export function computeDueSoon(cases, dsarRequests = [], today = new Date(), caseTasks = [], wellbeingNotes = [], leaverInstances = [], redundancyCases = [], caseAccess = [], ukJurisdiction = DEFAULT_UK_JURISDICTION) {
  const start = new Date(today);
  start.setHours(0,0,0,0);
  const due = [];

  const workingDaysFromDate = (dateStr, days) => addWorkingDaysDate(dateStr, days, ukJurisdiction);

  // caseId/createdBy/confidential ride along on every case-based deadline so
  // downstream consumers that leave Compass's own RLS-protected boundary —
  // the digest cron's email/webhook, the calendar-sync push to Google
  // Calendar — can decide whether it's safe to forward a given deadline
  // outside that boundary. In-app consumers (the overdue banner, this
  // function's cases[] input itself) don't need to check this: they already
  // only ever see cases the current user is authorised for, via RLS.
  const addDeadline = (employeeName, label, deadlineDate, category, key, meta={}) => {
    if(!deadlineDate||isNaN(deadlineDate)) return;
    deadlineDate.setHours(0,0,0,0);
    // DST-safe: a raw (deadlineDate-start)/86400000 ms diff is wrong
    // across a UK clock-change boundary (a local calendar day is 23 or
    // 25 hours long on the transition day), which previously made a
    // deadline's daysLeft count silently off by one right at that
    // boundary. daysBetween normalises both sides to UTC Y/M/D first,
    // sidestepping the DST artifact entirely.
    const diff = daysBetween(start, deadlineDate);
    if(diff<=14) due.push({employeeName,label,category,key,deadlineDate:deadlineDate.toLocaleDateString("en-GB"),daysLeft:Math.max(0,diff),daysOverdue:diff<0?Math.abs(diff):0,overdue:diff<0,confidential:false,caseId:null,createdBy:null,...meta});
  };

  cases.forEach(cs => {
    if(getCaseStage(cs)==="closed") return;
    const meetings = cs.meetings||[];
    const evidence = cs.evidence||[];
    const caseMeta = { confidential: !!cs.confidential, caseId: cs.id, createdBy: cs.createdBy||null };

    // Manual next steps
    meetings.forEach(m => {
      (m.nextSteps||[]).filter(s=>!s.done&&s.deadline).forEach(s => {
        const dl=parseFlexDate(s.deadline);
        addDeadline(cs.employeeName, s.step||"Next step due", dl, "next_step", `${cs.id}:nextstep:${m.id}:${s.step}`, caseMeta);
      });
    });

    // Disciplinary outcome — 5 working days from hearing
    const discMeetings = meetings.filter(m=>isDisciplinaryMeeting(m.type));
    discMeetings.forEach(m => {
      const hasOutcome = cs.outcome||meetings.some(mt=>mt.letterOutput&&(mt.type||"").toLowerCase().includes("outcome"));
      if(!hasOutcome) {
        const dl = workingDaysFromDate(m.savedAt||m.date, 5);
        if(dl) addDeadline(cs.employeeName, "Disciplinary outcome letter due (ACAS-recommended: 5 working days)", dl, "outcome", `${cs.id}:outcome`, caseMeta);
      }
    });

    // Appeal window — 5 working days from outcome letter
    const outcomeLetters = meetings.filter(m=>m.letterOutput&&isDisciplinaryMeeting(m.type));
    outcomeLetters.forEach(m => {
      const dl = workingDaysFromDate(m.savedAt||m.date, 5);
      if(dl) addDeadline(cs.employeeName, "Employee appeal window (ACAS-recommended: 5 working days)", dl, "appeal", `${cs.id}:appeal:${m.id}`, caseMeta);
    });

    // Investigation overrunning — 28 days. Manager Enablement (Phase 4,
    // MP19, §15) — a case HR has explicitly paused (a deliberate boolean,
    // not a new status) drops out of this and the investigation target
    // date below, since both are specifically about investigation
    // progress. Every other deadline this function computes (statutory
    // ones especially — grievance acknowledgement, appeal window,
    // suspension review — plus generic tasks/signatures) is NOT
    // investigation-specific and keeps firing regardless: pausing an
    // investigation doesn't lawfully pause a grievance acknowledgement,
    // and this feed is what the email digest cron reads too.
    if(!cs.investigationPaused&&(cs.stage==="investigation"||getCaseStage(cs)==="investigation")&&!cs.investigationReport) {
      const invMeetings = meetings.filter(m=>isInvestigationMeeting(m.type));
      if(invMeetings.length>0) {
        const first = invMeetings[0];
        const startStr = first.savedAt||first.date;
        const mStart = parseFlexDate(startStr);
        if(mStart) {
          const daysSince = daysBetween(mStart, start);
          if(daysSince>21) { const dl=new Date(mStart); dl.setDate(dl.getDate()+28); addDeadline(cs.employeeName,"Investigation overrunning — consider concluding (ACAS guidance)",dl,"investigation",`${cs.id}:investigation`, caseMeta); }
        }
      }
    }

    // MP7's own target completion date, set when an investigator is
    // assigned (AssignInvestigatorModal) — a deterministic reminder, not
    // an AI-inferred one, and the one new deadline source this phase
    // adds. One row per investigator ever assigned to this case, not
    // just the current one — a stale target from a since-reassigned
    // investigator still deserves a reminder rather than silently
    // vanishing.
    if(!cs.investigationPaused) {
      caseAccess.filter(a=>a.caseId===cs.id&&a.role==="investigator"&&a.targetCompletionDate).forEach(a => {
        addDeadline(cs.employeeName, "Investigation target completion date", parseFlexDate(a.targetCompletionDate), "investigation_target", `${cs.id}:invtarget:${a.id}`, caseMeta);
      });
    }

    // Grievance acknowledgement — 5 working days from receipt
    if((cs.caseType||"").toLowerCase()==="grievance"&&meetings.length===0&&cs.dateReceived) {
      const dl = workingDaysFromDate(cs.dateReceived, 5);
      if(dl) addDeadline(cs.employeeName, "Grievance acknowledgement due (ACAS-recommended: 5 working days)", dl, "grievance", `${cs.id}:grievance`, caseMeta);
    }

    // Pending signature chase — 7 days
    evidence.filter(e=>e.signStatus==="pending"&&e.signId).forEach(e => {
      const sent=e.sentAt||e.date;
      const sentDate=parseFlexDate(sent);
      if(sentDate) {
        const daysPending=daysBetween(sentDate, start);
        if(daysPending>7) { const dl=new Date(sentDate); dl.setDate(dl.getDate()+7); addDeadline(cs.employeeName,"Signature pending "+daysPending+" days — consider chasing",dl,"signature",`${cs.id}:signature:${e.id||e.signId}`, caseMeta); }
      }
    });

    // Phase 6.5 hardening (closes Prompt 11 audit finding 3.10, MEDIUM) —
    // every date field below this point (fitNoteEndDate through the
    // redundancy consultation start date further down) is parsed via
    // parseFlexDate rather than a raw `new Date(str)`. A bare "YYYY-MM-DD"
    // has no time-of-day meaning, but the native Date constructor parses
    // it as UTC midnight, which addDeadline's own local setHours(0,0,0,0)
    // then silently rolled back a calendar day for any timezone behind
    // UTC — see dateMath.js's own header comment on this exact fix.
    //
    // P16 — the four dated fields lib/caseStage.js's and
    // lib/processTimeline.js's own forward-reference comments named as
    // "P16's job": fit notes, probation review, OH referral, suspension
    // review. All direct HR-entered dates on the case (no dedicated form
    // existed to capture any of them before now), except the OH report,
    // which is a chase computed from the referral date the same way the
    // signature chase above works from a sent date — gated on the report
    // not yet being received so it stops nagging once one arrives.
    if(cs.fitNoteEndDate) {
      addDeadline(cs.employeeName, "Fit note expires — review or request an updated note", parseFlexDate(cs.fitNoteEndDate), "fit_note", `${cs.id}:fitnote`, caseMeta);
    }
    if(cs.probationReviewDate) {
      addDeadline(cs.employeeName, "Probation review due", parseFlexDate(cs.probationReviewDate), "probation", `${cs.id}:probation`, caseMeta);
    }
    if(cs.ohReferralDate && !cs.ohReportReceivedDate) {
      const dl = workingDaysFromDate(cs.ohReferralDate, 15);
      if(dl) addDeadline(cs.employeeName, "Occupational health report expected — chase if not received", dl, "oh_referral", `${cs.id}:oh`, caseMeta);
    }
    if(cs.suspensionReviewDate) {
      addDeadline(cs.employeeName, "Suspension review due", parseFlexDate(cs.suspensionReviewDate), "suspension", `${cs.id}:suspension`, caseMeta);
    }
  });

  dsarRequests.forEach(req => {
    if(req.status==="completed") return;
    addDeadline(req.employeeName||req.employee_name, "DSAR response due (statutory: 1 calendar month)", parseFlexDate(req.due_date||req.dueDate), "dsar", `dsar:${req.id}`);
  });

  caseTasks.forEach(task => {
    if(task.status==="done"||!task.dueDate) return;
    const cs = cases.find(c=>c.id===task.caseId);
    if(cs && getCaseStage(cs)==="closed") return;
    const dl = parseFlexDate(task.dueDate);
    addDeadline(cs?.employeeName||"Unassigned case", "Task due: "+task.name, dl, "task", `task:${task.id}`, cs ? { confidential: !!cs.confidential, caseId: cs.id, createdBy: cs.createdBy||null } : {});
  });

  // OH/wellbeing follow-up — WellbeingScreen already computes its own
  // "overdue" list locally from these same fields; this threads the real
  // dates into the unified output. Never case-linked (wellbeing notes are
  // employee-level, not case-scoped) and always confidential — loading
  // this data client-side is already gated to HR roles (App.jsx's org-load
  // effect only calls loadWellbeingNotes when isHR).
  wellbeingNotes.forEach(n => {
    if(n.followUpDone||!n.followUpDate) return;
    addDeadline(n.employeeName, "Wellbeing follow-up due", parseFlexDate(n.followUpDate), "wellbeing", `wellbeing:${n.id}`, { confidential: true });
  });

  // Notice period — a leaver's last working day approaching while
  // offboarding tasks (checklistTasks.js's own {done} flag) are still
  // open is worth a reminder; once every task is ticked off there's
  // nothing left to chase, so it drops out rather than nagging forever.
  leaverInstances.forEach(instance => {
    if(!instance.lastWorkingDay) return;
    if(!(instance.tasks||[]).some(t=>!t.done)) return;
    addDeadline(instance.name, "Last working day approaching — offboarding tasks still open", parseFlexDate(instance.lastWorkingDay), "leaver", `leaver:${instance.id}`);
  });

  // Collective redundancy consultation — TULRCA s.188 minimum consultation
  // period (30 days for 20-99 proposed redundancies, 45 for 100+) before
  // dismissals can take effect, timed from consultationStartDate. No
  // equivalent statutory minimum exists for individual redundancy, so
  // that type is left alone here.
  redundancyCases.forEach(r => {
    if(r.type!=="collective"||r.status==="complete") return;
    const startStr = r.collectiveInfo?.consultationStartDate;
    if(!startStr) return;
    const consultStart = parseFlexDate(startStr);
    if(!consultStart) return;
    const count = r.collectiveInfo?.count || (r.atRiskEmployees||[]).length;
    const minDays = count>=100 ? 45 : 30;
    const dl = new Date(consultStart);
    dl.setDate(dl.getDate()+minDays);
    addDeadline(r.reason||"Redundancy process", `Statutory consultation period ends (${minDays} days, ${count} affected)`, dl, "redundancy", `redundancy:${r.id}`);
  });

  due.sort((a,b)=>{ if(a.overdue&&!b.overdue) return -1; if(!a.overdue&&b.overdue) return 1; return a.overdue?b.daysOverdue-a.daysOverdue:a.daysLeft-b.daysLeft; });
  return due;
}

// Manager Enablement (Phase 4, MP17, §22/§23) — groups computeDueSoon's
// existing flat list into Overdue / Due Today / Due Tomorrow / Later for
// ManagerPortalScreen's own presentation. Deliberately not folded into
// computeDueSoon itself: every other consumer of dueSoon (HomeScreen's
// overdue banner, the digest cron, Settings) already works against the
// flat array and has no reason to change shape just because one more
// screen wants it grouped. daysLeft alone can't distinguish "due today"
// from "overdue" — computeDueSoon clamps it to 0 for any overdue item
// too (Math.max(0,diff)) — so the overdue flag is checked first.
export function groupDueSoon(dueSoon) {
  const list = dueSoon || [];
  return {
    overdue: list.filter(d => d.overdue),
    today: list.filter(d => !d.overdue && d.daysLeft === 0),
    tomorrow: list.filter(d => !d.overdue && d.daysLeft === 1),
    later: list.filter(d => !d.overdue && d.daysLeft > 1),
  };
}
