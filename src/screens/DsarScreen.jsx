import { useState } from 'react';
import { SCREENS } from '../constants';
import { DateInput } from '../components/DateInput';
import { Btn, Card, Badge } from '../components/Primitives';
import { compileSubjectData } from '../lib/dsarCompile';
import { useLoadMore } from '../hooks/useLoadMore';
import { daysBetween } from '../lib/dateMath';
import { authedFetch } from '../lib/authedFetch';
import { WarningIcon } from '../components/Icons';
import { PageHeader } from '../components/design/PageHeader';
import { COLOR, RADIUS, FONT } from '../styles/tokens';
import { EmployeeSelect } from '../components/EmployeeSelect';
import { supabase } from '../supabase';
import { fetchDsarMeetings } from '../lib/meetingTableGateway';

const STATUS_LABEL = { received:"Received", in_progress:"In progress", ready_to_send:"Ready to send", completed:"Completed" };

function daysUntil(dueDate) {
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return daysBetween(today, due);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function RequestDetail({ req, cases, caseDecisions = [], employeeRecords, employeeActivities = [], employeeActivityRecords = [], employmentEvents = [], starterInstances, leaverInstances, wellbeingNotes, concernReferrals, allegations, caseSignals, caseTasks, hrReviewRequests, auditLog, dsarRequests, orgMembers, orgEvents, improvementInitiatives, managerCapabilityInsights, organisationThemes, caseAccess, redundancyCases, orgId, audit, updateDsarRequest, extendDsarRequest, promptDialog }) {
  const [compiled, setCompiled] = useState(null);
  const [compiling, setCompiling] = useState(false);

  // Phase 6.5 hardening (data-lifecycle review) — signing_requests,
  // employee_portal_accounts, employee_portal_invites, profiles and
  // case_views all have zero (or own-row-only) client-facing RLS by
  // design (see api/portal/_dsar-lookup.js's own header comment), so a
  // DSAR compile needs one real network round-trip first — this used to
  // be a purely synchronous, already-in-memory operation. Best-effort:
  // if the lookup itself fails, the rest of the export still compiles
  // rather than blocking the whole DSAR on one extra endpoint.
  const compile = async () => {
    setCompiling(true);
    let signingRequests = [];
    let portalAccounts = [];
    let portalInvites = [];
    let profiles = [];
    let caseViews = [];
    try {
      const r = await authedFetch(`/api/portal/dsar-lookup?orgId=${encodeURIComponent(orgId)}&employeeName=${encodeURIComponent(req.employeeName)}`);
      if (r.ok) { const d = await r.json(); signingRequests = d.signingRequests || []; portalAccounts = d.portalAccounts || []; portalInvites = d.portalInvites || []; profiles = d.profiles || []; caseViews = d.caseViews || []; }
    } catch (e) { console.error('dsar-lookup failed:', e.message); }

    // ── Phase E2A — meetings held outside a case now reach the package ───────
    //
    // E2 gave public.meetings a canonical employee_id, which removed the reason
    // this was withheld: attribution no longer depends on the name on the meeting.
    //
    // Deliberately through the ORDINARY authenticated client, not through
    // /api/portal/dsar-lookup above. That endpoint uses the service role to read
    // tables the browser cannot, and routing meetings through it would make
    // completeness a reason to widen access. E2's meeting policies apply here
    // unchanged, so the compiler is only ever handed rows the person compiling
    // this request may already read.
    //
    // A failure does NOT block the package — but it must not look like "there
    // were none" either, so the disposition below reports it.
    let standaloneMeetings = [];
    let meetingFetchFailed = false;
    const meetingResult = await fetchDsarMeetings(supabase, { orgId });
    if (meetingResult.ok) standaloneMeetings = meetingResult.meetings;
    else meetingFetchFailed = true;
    setCompiled(compileSubjectData(req.employeeName, {
      // Phase E0.6 — the canonical subject, where the request recorded one. With
      // it, cases/wellbeing/referrals are selected by employee_id and a same-name
      // record that has not been attributed is reported rather than absorbed.
      canonicalEmployeeId: req.employeeId || null,
      // Phase E1.6 — activities join subject data from day one rather than
      // becoming a blind spot discovered later. Selected by employee_id only.
      employeeActivities, employeeActivityRecords, employmentEvents,
      // WAVE D4.3 — the authoritative decision history. Passed through the
      // ordinary authenticated client like everything else here, so
      // case_decisions' own RLS (which delegates to cases) decides what the
      // person compiling the package may read. Completeness is never a reason
      // to widen access, which is the same rule E2A applied to meetings.
      caseDecisions,
      // Phase E2A — standaloneMeetings ARE now passed. The two reasons recorded
      // below for withholding them were both resolved by E2 (canonical
      // employee_id) and E2A (a content-bearing, RLS-scoped read). The original
      // reasoning is kept because it is why the gap existed, and why closing it
      // needed identity first.
      standaloneMeetings,
      meetingFetchFailed,
      // ── the ORIGINAL position, for the record ───────────────────────────
      //
      // The audit finding: this parameter has existed since Phase 4C.1 but no
      // caller ever supplied it, so every package has silently omitted meetings
      // held outside a case. It is a genuine completeness gap — that content is
      // unambiguously the employee's personal data.
      //
      // It is NOT closed here, deliberately. Two reasons, in order:
      //   1. public.meetings has no employee_id until E2, so the only available
      //      basis is the name on the meeting — the inference this programme
      //      exists to remove. Compass would be guessing whose record it is.
      //   2. The existing discovery gateway is metadata-only by design (no
      //      record, transcript, summary or notes). Disclosing the content needs
      //      a new content-bearing read path, which belongs with meeting identity
      //      in E2 rather than bolted on here.
      //
      // So the package REPORTS the exclusion instead of pretending completeness —
      // see standaloneMeetingsDisposition, surfaced on this screen below.
      cases, employeeRecords, starterInstances, leaverInstances, wellbeingNotes, concernReferrals, allegations, caseSignals, caseTasks, hrReviewRequests, auditLog, signingRequests, portalAccounts, dsarRequests, orgMembers, profiles, caseViews, portalInvites, orgEvents, improvementInitiatives, managerCapabilityInsights, organisationThemes, caseAccess, redundancyCases }));
    setCompiling(false);
    // Phase 6.5 hardening (data-lifecycle review) — "DSAR generated" is
    // one of the privacy actions this whole review was asked to make
    // auditable. Just the fact and the subject's name — never any of the
    // compiled record content itself.
    audit?.("DSAR data compiled", req.employeeName);
  };

  const days = daysUntil(req.dueDate);
  const overdue = days < 0;

  const handleExtend = async () => {
    const values = await promptDialog({
      title:"Extend DSAR deadline",
      message:"UK GDPR allows extending the response deadline by up to 2 further months for complex or numerous requests — but the individual must be told within the original 1-month window, with reasons. This sets the new due date 2 months later and records why.",
      fields:[{key:"reason", label:"Reason (e.g. complex/numerous requests)", placeholder:"e.g. request spans multiple systems and 3 years of records", required:true}],
      confirmLabel:"Extend by 2 months",
    });
    if(!values) return;
    extendDsarRequest(req, values.reason);
  };

  // Design System Convergence pass, Phase 3 — was its own bordered Card
  // per request, every one identically shaped whether compiled or not.
  // DSAR is explicitly an operational register (item 3) — request name,
  // received date, statutory deadline, status, and next action should be
  // immediately comparable across rows, so the collapsed row is now a
  // compact line inside one shared list. The compiled-data panel below
  // is genuinely the "interpretation/exceptional conditions" case Phase
  // 3 reserves real cards for (name-collision warnings, flagged
  // third-party mentions, evidence needing manual review) — it keeps its
  // own contained surface, appearing only once a request is actually
  // compiled, same as before. Every field, handler, and control is
  // unchanged.
  return (
    <div style={{padding:"14px 16px",borderBottom:"1px solid #F1EBDD"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:12}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:14,fontWeight:600,color:"#1A1535"}}>{req.employeeName}</div>
          <div style={{fontSize:12,color:"#9B9098"}}>{req.requestedBy?`Requested by ${req.requestedBy} · `:""}Received {req.receivedDate}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:600,color:overdue?"#C84B2F":"#7C5CFC",background:overdue?"#FEF0EB":"#EDE8FF",borderRadius:20,padding:"3px 10px"}}>{STATUS_LABEL[req.status]}</span>
          <div style={{fontSize:11,color:overdue?"#C84B2F":"#9B9098",marginTop:4}}>Due {req.dueDate}{overdue?` · ${Math.abs(days)}d overdue`:` · ${days}d left`}</div>
          {req.extended&&<div style={{fontSize:11,color:"#7C5CFC",marginTop:4}}>Extended — {req.extensionReason||"complex request"}</div>}
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:compiled?10:0,flexWrap:"wrap"}}>
        <select aria-label={`Status for ${req.employeeName}'s DSAR request`} value={req.status} onChange={e=>updateDsarRequest(req.id, {status:e.target.value})} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
          {Object.entries(STATUS_LABEL).filter(([v])=>v!=="completed"||req.reviewedFlaggedSections).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <Btn variant="secondary" onClick={compile} disabled={compiling}>{compiling?"Compiling…":compiled?"Recompile data":"Compile data"}</Btn>
        {/* Phase E0 — the export is GATED on identity, not merely annotated.
            Before this, the collision warning rendered BELOW an always-enabled
            download button, so the safeguard could be read after the damage. An
            ambiguous identity means Compass would be guessing which of two real
            people these records belong to, and a DSAR must prefer "identity
            requires reconciliation" over disclosing the wrong person's history. */}
        {compiled&&!compiled.identityRequiresReconciliation&&<Btn variant="secondary" onClick={()=>{downloadJson(compiled, `DSAR_${req.employeeName.replace(/\s+/g,"_")}_${req.receivedDate}.json`);audit?.("DSAR response downloaded", req.employeeName);}}>Download response package</Btn>}
        {compiled&&compiled.identityRequiresReconciliation&&(
          <span style={{fontSize:12,color:"#C84B2F",alignSelf:"center"}}>Download blocked — employee identity requires reconciliation</span>
        )}
        {!req.extended&&req.status!=="completed"&&<Btn variant="ghost" onClick={handleExtend}>Extend deadline</Btn>}
      </div>

      {compiled&&(() => {
        // Slice 2 — review-required items now come from TWO classifiers: the
        // case/meeting one and the new allegation one. Merged here so the
        // reviewer sees one list and one count; a flag that never reaches this
        // banner is a flag nobody acts on.
        const reviewRequired = [
          ...(compiled.caseDisclosure?.reviewRequired || []),
          ...(compiled.allegationDisclosure?.reviewRequired || []),
          // SECURITY FIX — the containment decisions for the four sources that
          // used to emit other people's records wholesale (actedAsStaff cases,
          // wellbeing notes and HR reviews; the redundancy pool; and the
          // subject's own HR review snapshots). Without this merge the
          // withholding would happen and no reviewer would ever learn of it,
          // which is the failure mode this block's own comment warns about.
          ...(compiled.thirdPartyContainment?.reviewRequired || []),
          // Already produced by the compiler and previously merged nowhere.
          ...(compiled.signingDisclosure?.reviewRequired || []),
        ];
        const unrecognisedWithheld = [...new Set([
          ...(compiled.caseDisclosure?.unrecognisedFieldsWithheld || []),
          ...(compiled.allegationDisclosure?.unrecognisedFieldsWithheld || []),
          // The third source, previously merged nowhere.
          ...(compiled.signingDisclosure?.unrecognisedFieldsWithheld || []),
          ...(compiled.thirdPartyContainment?.unrecognisedFieldsWithheld || []),
        ])].sort();
        return (
        <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 14px"}}>
          {compiled.identityRequiresReconciliation&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FEF0EB",border:"1px solid #F0C4B0",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#C84B2F" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#C84B2F"}}>
                <strong>Identity requires reconciliation — this response cannot be downloaded.</strong> More than one employee answers to "{req.employeeName}" in this organisation, so Compass cannot tell which person these records belong to. Confirm which employee the request concerns before compiling a response; sending this package could disclose another person's confidential history.
              </div>
            </div>
          )}
          {compiled.identityStatus==="unreconciled"&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FEF0EB",border:"1px solid #F0C4B0",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#C84B2F" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#C84B2F"}}>
                {/* E0.5A — this state now BLOCKS. The wording says what Compass
                    could not establish, and deliberately does NOT suggest the
                    records are missing or incomplete: they are all present, and
                    nothing has been deleted. What is missing is the link between
                    them and a canonical employee. */}
                <strong>Employee identity requires reconciliation — this response cannot be downloaded.</strong> These records were gathered by matching the name "{req.employeeName}", and there is no canonical employee record to confirm they all belong to one person. Nothing is missing and nothing has been removed. Link this person to an employee record, then compile again.
              </div>
            </div>
          )}
          {/* Phase E2A — meetings held outside a case ARE now included, by
              canonical employee reference. The copy therefore had to change: it
              told the reviewer they were excluded, which would now be false. A
              notice that promises something the model does not do is worse than
              no notice.

              Two situations still need saying out loud, and they are different
              facts: the read FAILED (so completeness is unknown), or Compass
              deliberately WITHHELD internal analysis. */}
          {/* ── Wave 0 — what was held back from the CASES, and why ──────────
              Historical formal meetings ARE included. Compass's own analysis of
              the employee is not. Said plainly, because a redaction nobody can
              see is a decision nobody made — and the decision is the reviewer's,
              not Compass's. Deliberately NOT phrased as what the law requires. */}
          {compiled.caseDisclosure?.internalFieldsWithheld?.length>0&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#6B6375" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}>
                <strong>Compass's own analysis has been held back from this package.</strong>{" "}
                Meeting records, notes taken, signed documents and outcomes are included.
                HR advisory notes, generated risk ratings and unfinished drafts are not
                {compiled.caseDisclosure.meetingsWithWithheldContent>0
                  ? ` (${compiled.caseDisclosure.meetingsWithWithheldContent} meeting${compiled.caseDisclosure.meetingsWithWithheldContent===1?"":"s"} affected)`
                  : ""}. Check this is right for this request before you respond.
              </div>
            </div>
          )}
          {reviewRequired.length>0&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#B87520" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#7A5C1A",lineHeight:1.6}}>
                <strong>{reviewRequired.length} item{reviewRequired.length===1?"":"s"} need{reviewRequired.length===1?"s":""} your decision.</strong>{" "}
                Compass has not included {reviewRequired.length===1?"it":"them"} either way:
                <ul style={{margin:"4px 0 0",paddingLeft:16}}>
                  {reviewRequired.slice(0,4).map((r,i)=>(
                    <li key={i}>{r.reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {unrecognisedWithheld.length>0&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#B87520" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#7A5C1A",lineHeight:1.6}}>
                <strong>Compass found information it does not recognise and has left it out.</strong>{" "}
                This usually means Compass has been updated and this screen has not. Ask for it to be
                reviewed before you treat this package as complete.
              </div>
            </div>
          )}
          {compiled.standaloneMeetingsDisposition?.readFailed&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#B87520" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#7A5C1A",lineHeight:1.6}}>
                <strong>Meetings held outside a case could not be read.</strong> None are included, and this package
                cannot be described as their complete record. Compile it again before responding.
              </div>
            </div>
          )}
          {/* ── WHAT WAS HELD BACK, AND WHY (containment slice) ──────────
              The HR Director must be able to see what is being withheld pending
              review, and on what basis — a withholding nobody is told about is
              indistinguishable from data Compass does not hold. */}
          {(compiled.thirdPartyContainment?.thirdPartyFieldsWithheld?.length>0||compiled.thirdPartyContainment?.legallyWithheld?.length>0)&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#F4F2FA",border:"1px solid #DDD8EE",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#5B4B8A" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#3D3357",lineHeight:1.6}}>
                <strong>Another person's information has been held back from this response.</strong>{" "}
                {compiled.thirdPartyContainment.thirdPartyFieldsWithheld.length} item
                {compiled.thirdPartyContainment.thirdPartyFieldsWithheld.length===1?"":"s"} of third-party data
                {compiled.thirdPartyContainment.legallyWithheld.length>0?`, and ${compiled.thirdPartyContainment.legallyWithheld.length} withheld on a recorded justification`:""}.
                {" "}This is not permanent: each item names its source record so you can assess it. Records where the
                requester appears as manager, investigator or reviewer are listed under "Also named as…" below —
                those contain the requester's own words as well as someone else's, so the review decides what of
                theirs is released.
                {compiled.thirdPartyContainment.legallyWithheld.length>0&&(
                  <div style={{marginTop:6}}>
                    {compiled.thirdPartyContainment.legallyWithheld.map((w,i)=>(
                      <div key={i} style={{fontSize:11,color:"#5B4B8A",marginTop:2}}>
                        <strong>{w.source}.{w.field}</strong> — {w.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {compiled.standaloneMeetingsDisposition?.internalAnalysisWithheld?.length>0&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#6B6375" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}>
                <strong>Compass's own analysis of {compiled.standaloneMeetingsDisposition.internalAnalysisWithheld.length}{" "}
                meeting{compiled.standaloneMeetingsDisposition.internalAnalysisWithheld.length===1?"":"s"} has been held back.</strong>{" "}
                The employee's own record and the notes taken at the meeting are included. HR advisory notes, unfinished
                review drafts and generated risk scoring are not — decide whether an exemption genuinely applies before
                relying on that.
              </div>
            </div>
          )}
          {compiled.standaloneMeetingsDisposition?.witnessInterviewsExcluded>0&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#6B6375" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}>
                <strong>{compiled.standaloneMeetingsDisposition.witnessInterviewsExcluded} witness
                interview{compiled.standaloneMeetingsDisposition.witnessInterviewsExcluded===1?"":"s"} {compiled.standaloneMeetingsDisposition.witnessInterviewsExcluded===1?"is":"are"} not
                treated as this person's own record.</strong> An interview where someone attended as a witness belongs to
                the process being investigated. Where it mentions this person, it appears under third-party mentions.
              </div>
            </div>
          )}
          {compiled.unattributedWellbeingNotes?.length>0&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#6B6375" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}>
                <strong>{compiled.unattributedWellbeingNotes.length} wellbeing note{compiled.unattributedWellbeingNotes.length===1?"":"s"} recorded under this name {compiled.unattributedWellbeingNotes.length===1?"is":"are"} not included.</strong>{" "}
                {compiled.unattributedWellbeingNotes.length===1?"It has":"They have"} not been confirmed as belonging to this
                employee, so {compiled.unattributedWellbeingNotes.length===1?"it is":"they are"} left out rather than
                risk disclosing another person's record.
              </div>
            </div>
          )}
          {compiled.possibleNameCollision&&!compiled.identityRequiresReconciliation&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FEF0EB",border:"1px solid #F0C4B0",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#C84B2F" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#C84B2F"}}>
                <strong>Possible name collision.</strong> More than one employee record or case email matches "{req.employeeName}" — this org may have two different people with this name. Verify every record below genuinely belongs to the same individual before sending this response; do not rely on the name match alone.
              </div>
            </div>
          )}
          <div style={{fontSize:12,color:"#1A1535",marginBottom:8}}>
            {compiled.cases.length} case{compiled.cases.length!==1?"s":""} · {compiled.onboarding.length} onboarding record{compiled.onboarding.length!==1?"s":""} · {compiled.offboarding.length} offboarding record{compiled.offboarding.length!==1?"s":""} · {compiled.caseTasks.length} task{compiled.caseTasks.length!==1?"s":""} · {compiled.signingRequests.length} signing request{compiled.signingRequests.length!==1?"s":""} · {compiled.portalAccounts.length} portal account{compiled.portalAccounts.length!==1?"s":""} · {compiled.dsarRequests.length} prior DSAR request{compiled.dsarRequests.length!==1?"s":""} · {compiled.employeeRecord?"employee record found":"no employee record on file"}
          </div>
          {compiled.orgMembership.length>0&&(
            <div style={{fontSize:12,color:"#1A1535",marginBottom:8}}>
              Also a Compass user on this team ({compiled.orgMembership.map(m=>m.role).join(", ")}) · {compiled.caseViews.length} case view{compiled.caseViews.length!==1?"s":""} · {compiled.portalInvites.length} portal invite{compiled.portalInvites.length!==1?"s":""} on record for them
            </div>
          )}
          {(compiled.actedAsStaff.cases.length+compiled.actedAsStaff.employeeRecords.length+compiled.actedAsStaff.wellbeingNotes.length+compiled.actedAsStaff.hrReviewRequests.length)>0&&(
            <div style={{fontSize:12,color:"#1A1535",marginBottom:8}}>
              Also named as manager/investigator/officer/reviewer on other employees' records: {compiled.actedAsStaff.cases.length} case{compiled.actedAsStaff.cases.length!==1?"s":""}, {compiled.actedAsStaff.employeeRecords.length} employee record{compiled.actedAsStaff.employeeRecords.length!==1?"s":""}, {compiled.actedAsStaff.wellbeingNotes.length} wellbeing note{compiled.actedAsStaff.wellbeingNotes.length!==1?"s":""}, {compiled.actedAsStaff.hrReviewRequests.length} HR review request{compiled.actedAsStaff.hrReviewRequests.length!==1?"s":""} — included in the download below.
            </div>
          )}
          {compiled.subjectMentionsInOrgNarratives.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#C84B2F",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>Flagged — named in organisational insight content</div>
              {compiled.subjectMentionsInOrgNarratives.map((f,i)=>(
                <div key={i} style={{fontSize:12,color:"#6B6375",padding:"6px 0",borderBottom:"1px solid #EDE5D8"}}>
                  {f.field}{f.date?` (${f.date})`:""}: <span style={{fontStyle:"italic"}}>"...{f.snippet}..."</span>
                </div>
              ))}
              <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>Compass's organisational insights aren't meant to name individuals — this needs manual review before sending.</div>
            </div>
          )}
          {compiled.flaggedThirdPartyMentions.length>0?(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#C84B2F",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>Flagged — mentions another named individual</div>
              {compiled.flaggedThirdPartyMentions.map((f,i)=>(
                <div key={i} style={{fontSize:12,color:"#6B6375",padding:"6px 0",borderBottom:"1px solid #EDE5D8"}}>
                  <strong style={{color:"#1A1535"}}>{f.mentionedName}</strong> in {f.meetingType} ({f.date}), {f.field}: <span style={{fontStyle:"italic"}}>"...{f.snippet}..."</span>
                </div>
              ))}
              <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>These mentions of other people need manual review/redaction before sending — this tool flags them, it does not redact automatically.</div>
            </div>
          ):(
            <div style={{fontSize:12,color:"#1A7A4A",marginBottom:10}}>No other named individuals detected in the compiled records.</div>
          )}
          {compiled.evidenceRequiringReview.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#B87520",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>Evidence files — not included automatically</div>
              {compiled.evidenceRequiringReview.map((ev,i)=>(
                <div key={i} style={{fontSize:12,color:"#6B6375",padding:"6px 0",borderBottom:"1px solid #EDE5D8"}}>
                  <strong style={{color:"#1A1535"}}>{ev.name}</strong> ({ev.type}, {ev.date})
                </div>
              ))}
              <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>Compass can't scan file content (photos, PDFs, CCTV, witness statements) for other people's data the way it scans text. Open each file, check it only concerns {req.employeeName} (or redact/exclude what doesn't), then attach it to the response manually.</div>
            </div>
          )}
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#1A1535",cursor:"pointer"}}>
            <input type="checkbox" checked={!!req.reviewedFlaggedSections} onChange={e=>updateDsarRequest(req.id, {reviewedFlaggedSections:e.target.checked})} style={{cursor:"pointer"}}/>
            I have reviewed the flagged sections{compiled.evidenceRequiringReview.length>0?" and evidence files":""} (required before marking as completed)
          </label>
        </div>
        );
      })()}
    </div>
  );
}

export function DsarScreen({ canAdministerDsar = false, dsarRequests, createDsarRequest, updateDsarRequest, extendDsarRequest, promptDialog, cases, caseDecisions = [], employeeRecords, employeeActivities = [], employeeActivityRecords = [], employmentEvents = [], starterInstances, leaverInstances, wellbeingNotes, concernReferrals, allegations, caseSignals, caseTasks, hrReviewRequests, auditLog, orgMembers, orgEvents, improvementInitiatives, managerCapabilityInsights, organisationThemes, caseAccess, redundancyCases, orgId, audit, setScreen }) {
  const [form, setForm] = useState({ employeeId:null, employeeName:"", requestedBy:"", receivedDate:new Date().toISOString().split("T")[0] });
  // Explicit, and deliberately not inferred from an empty roster match.
  const [offRoster, setOffRoster] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const sorted = [...dsarRequests].sort((a,b)=>{
    if((a.status==="completed")!==(b.status==="completed")) return a.status==="completed"?1:-1;
    return new Date(a.dueDate)-new Date(b.dueDate);
  });
  const { visible: visibleRequests, hasMore, loadMore, total } = useLoadMore(sorted, 15);

  const submit = () => {
    if(!form.employeeName.trim()||!form.receivedDate) return;
    createDsarRequest(form);
    setForm({ employeeName:"", requestedBy:"", receivedDate:new Date().toISOString().split("T")[0] });
    setShowForm(false);
  };

  // ── DEFAULT-DENY, belt and braces ───────────────────────────────────────
  //
  // Placed HERE, after every hook, not at the top of the component. An early
  // return above `useState`/`useLoadMore` would change the number of hooks
  // rendered when the prop flips and React would throw "rendered fewer hooks
  // than expected" — a correctness bug introduced by a security guard, which is
  // the worst kind.
  //
  // The real boundary is the render condition in src/App.jsx (which also closes
  // the `?screen=dsar` deep link) plus the RLS policy. This exists so the
  // screen refuses on its own if a future call site forgets the gate. It
  // defaults to FALSE: a security prop that defaults open is not a gate.
  if (!canAdministerDsar) {
    return (
      <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
        <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"16px 32px"}}>
          <PageHeader title="DSAR requests" subtitle="Subject access requests"/>
        </div>
        <div style={{padding:32}}>
          <Card>
            <div style={{fontSize:13,color:"#6B6880",lineHeight:1.6}}>
              Only an HR Director can work on subject access requests.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      {/* Design System Convergence pass, Phase 2 — standard PageHeader. */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"16px 32px"}}>
        <PageHeader title="DSAR requests" subtitle="Statutory response deadline: 1 calendar month from receipt" meta={`${dsarRequests.filter(r=>r.status!=="completed").length} open`}
          actions={<Btn onClick={()=>setShowForm(s=>!s)}>{showForm?"Cancel":"+ Log new request"}</Btn>}/>
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"28px 24px"}}>
        {showForm&&(
          <Card style={{marginBottom:20}}>
            <div style={{marginBottom:12}}>
              {/* Phase E0.6 — was a free-text input with a <datalist> of names,
                  which threw the uuid away and made the subject a string.
                  The canonical path is now first.

                  The off-roster escape below is NOT a convenience: a DSAR may
                  legitimately concern a former employee with no record, or
                  someone whose identity is precisely what is in dispute.
                  Refusing to record the request would block a legal obligation
                  on a data-modelling preference. So the name-only route stays —
                  chosen deliberately, and clearly marked as unidentified. */}
              {!offRoster ? (
                <>
                  <EmployeeSelect
                    inputId="dsar-form-employee-name"
                    label="Employee"
                    employeeRecords={employeeRecords}
                    value={form.employeeId || null}
                    onChange={(id, employee)=>setForm(p=>({...p, employeeId:id, employeeName:employee?.name||""}))}
                  />
                  <button type="button" onClick={()=>{ setOffRoster(true); setForm(p=>({...p, employeeId:null, employeeName:""})); }}
                    style={{marginTop:6,background:"none",border:"none",padding:0,fontSize:12,color:"#6B6375",textDecoration:"underline",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                    This person is not on the employee roster
                  </button>
                </>
              ) : (
                <>
                  <label htmlFor="dsar-form-employee-name" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Subject name (not on the roster)</label>
                  <input id="dsar-form-employee-name" value={form.employeeName} onChange={e=>setForm(p=>({...p,employeeName:e.target.value,employeeId:null}))} placeholder="e.g. a former employee" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
                  <div style={{fontSize:12,color:"#6B6375",marginTop:6,lineHeight:1.5}}>
                    Recorded by name only. Compass cannot confirm which employee record this is, so the response
                    package will not be assembled from a canonical identity.
                  </div>
                  <button type="button" onClick={()=>{ setOffRoster(false); setForm(p=>({...p, employeeName:"", employeeId:null})); }}
                    style={{marginTop:6,background:"none",border:"none",padding:0,fontSize:12,color:"#6B6375",textDecoration:"underline",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                    Choose from the employee roster instead
                  </button>
                </>
              )}
            </div>
            <div style={{marginBottom:12}}>
              <label htmlFor="dsar-form-requested-by" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Requested by (optional, if different from employee)</label>
              <input id="dsar-form-requested-by" value={form.requestedBy} onChange={e=>setForm(p=>({...p,requestedBy:e.target.value}))} placeholder="e.g. their solicitor" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
            </div>
            <div style={{marginBottom:16}}>
              <label htmlFor="dsar-form-received-date" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Date received</label>
              <DateInput id="dsar-form-received-date" value={form.receivedDate} onChange={e=>setForm(p=>({...p,receivedDate:e.target.value}))}/>
              <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>Due date will be calculated automatically as one calendar month from this date.</div>
            </div>
            <Btn onClick={submit} disabled={!form.employeeName.trim()||!form.receivedDate}>Log request</Btn>
          </Card>
        )}

        {sorted.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0"}}>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1A1535",marginBottom:8}}>No DSAR requests logged</div>
            <div style={{fontSize:13,color:"#9B9098"}}>Log a request when someone asks what personal data you hold on them.</div>
          </div>
        ):(
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,overflow:"hidden"}}>
            {visibleRequests.map(req=>(
              <RequestDetail key={req.id} req={req} cases={cases} caseDecisions={caseDecisions} employeeRecords={employeeRecords} employeeActivities={employeeActivities} employeeActivityRecords={employeeActivityRecords} employmentEvents={employmentEvents} starterInstances={starterInstances} leaverInstances={leaverInstances} wellbeingNotes={wellbeingNotes} concernReferrals={concernReferrals} allegations={allegations} caseSignals={caseSignals} caseTasks={caseTasks} hrReviewRequests={hrReviewRequests} auditLog={auditLog} dsarRequests={dsarRequests} orgMembers={orgMembers} orgEvents={orgEvents} improvementInitiatives={improvementInitiatives} managerCapabilityInsights={managerCapabilityInsights} organisationThemes={organisationThemes} caseAccess={caseAccess} redundancyCases={redundancyCases} orgId={orgId} audit={audit} updateDsarRequest={updateDsarRequest} extendDsarRequest={extendDsarRequest} promptDialog={promptDialog}/>
            ))}
          </div>
        )}
        {hasMore&&(
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,cursor:"pointer",fontSize:13,color:COLOR.purple,fontWeight:600,fontFamily:FONT.sans}}>
            Load more ({visibleRequests.length} of {total})
          </button>
        )}
      </div>
    </div>
  );
}
