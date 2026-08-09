import { getCaseStage } from './caseStage.js';

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
export function computeDueSoon(cases, dsarRequests = [], today = new Date(), caseTasks = []) {
  const start = new Date(today);
  start.setHours(0,0,0,0);
  const due = [];

  const workingDaysFromDate = (dateStr, days) => {
    let start;
    if(dateStr && dateStr.includes('/')) { const p=dateStr.split('/'); start=new Date(p[2],p[1]-1,p[0]); }
    else { start=new Date(dateStr); }
    if(isNaN(start)) return null;
    let count=0; let d=new Date(start);
    while(count<days){ d.setDate(d.getDate()+1); const day=d.getDay(); if(day!==0&&day!==6) count++; }
    return d;
  };

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
    const diff = Math.ceil((deadlineDate-start)/(1000*60*60*24));
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
        const parts=s.deadline.split("/");
        const dl=parts.length===3?new Date(parts[2],parts[1]-1,parts[0]):new Date(s.deadline);
        addDeadline(cs.employeeName, s.step||"Next step due", dl, "next_step", `${cs.id}:nextstep:${m.id}:${s.step}`, caseMeta);
      });
    });

    // Disciplinary outcome — 5 working days from hearing
    const discMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("disciplinary")&&!(m.type||"").toLowerCase().includes("investigation"));
    discMeetings.forEach(m => {
      const hasOutcome = cs.outcome||meetings.some(mt=>mt.letterOutput&&(mt.type||"").toLowerCase().includes("outcome"));
      if(!hasOutcome) {
        const dl = workingDaysFromDate(m.savedAt||m.date, 5);
        if(dl) addDeadline(cs.employeeName, "Disciplinary outcome letter due (ACAS: 5 working days)", dl, "outcome", `${cs.id}:outcome`, caseMeta);
      }
    });

    // Appeal window — 5 working days from outcome letter
    const outcomeLetters = meetings.filter(m=>m.letterOutput&&(m.type||"").toLowerCase().includes("disciplinary"));
    outcomeLetters.forEach(m => {
      const dl = workingDaysFromDate(m.savedAt||m.date, 5);
      if(dl) addDeadline(cs.employeeName, "Employee appeal window closes (ACAS: 5 working days)", dl, "appeal", `${cs.id}:appeal:${m.id}`, caseMeta);
    });

    // Investigation overrunning — 28 days
    if((cs.stage==="investigation"||getCaseStage(cs)==="investigation")&&!cs.investigationReport) {
      const invMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("investigation"));
      if(invMeetings.length>0) {
        const first = invMeetings[0];
        const startStr = first.savedAt||first.date;
        if(startStr) {
          let mStart; if(startStr.includes('/')) { const p=startStr.split('/'); mStart=new Date(p[2],p[1]-1,p[0]); } else mStart=new Date(startStr);
          const daysSince = Math.ceil((start-mStart)/(1000*60*60*24));
          if(daysSince>21) { const dl=new Date(mStart); dl.setDate(dl.getDate()+28); addDeadline(cs.employeeName,"Investigation overrunning — consider concluding (ACAS guidance)",dl,"investigation",`${cs.id}:investigation`, caseMeta); }
        }
      }
    }

    // Grievance acknowledgement — 5 working days from receipt
    if((cs.caseType||"").toLowerCase()==="grievance"&&meetings.length===0&&cs.dateReceived) {
      const dl = workingDaysFromDate(cs.dateReceived, 5);
      if(dl) addDeadline(cs.employeeName, "Grievance acknowledgement due (ACAS: 5 working days)", dl, "grievance", `${cs.id}:grievance`, caseMeta);
    }

    // Pending signature chase — 7 days
    evidence.filter(e=>e.signStatus==="pending"&&e.signId).forEach(e => {
      const sent=e.sentAt||e.date;
      if(sent) {
        const sentDate=new Date(sent);
        const daysPending=Math.ceil((start-sentDate)/(1000*60*60*24));
        if(daysPending>7) { const dl=new Date(sentDate); dl.setDate(dl.getDate()+7); addDeadline(cs.employeeName,"Signature pending "+daysPending+" days — consider chasing",dl,"signature",`${cs.id}:signature:${e.id||e.signId}`, caseMeta); }
      }
    });
  });

  dsarRequests.forEach(req => {
    if(req.status==="completed") return;
    addDeadline(req.employeeName||req.employee_name, "DSAR response due (statutory: 1 calendar month)", new Date(req.due_date||req.dueDate), "dsar", `dsar:${req.id}`);
  });

  caseTasks.forEach(task => {
    if(task.status==="done"||!task.dueDate) return;
    const cs = cases.find(c=>c.id===task.caseId);
    if(cs && getCaseStage(cs)==="closed") return;
    const dl = task.dueDate.includes('/') ? (()=>{ const p=task.dueDate.split('/'); return new Date(p[2],p[1]-1,p[0]); })() : new Date(task.dueDate);
    addDeadline(cs?.employeeName||"Unassigned case", "Task due: "+task.name, dl, "task", `task:${task.id}`, cs ? { confidential: !!cs.confidential, caseId: cs.id, createdBy: cs.createdBy||null } : {});
  });

  due.sort((a,b)=>{ if(a.overdue&&!b.overdue) return -1; if(!a.overdue&&b.overdue) return 1; return a.overdue?b.daysOverdue-a.daysOverdue:a.daysLeft-b.daysLeft; });
  return due;
}
