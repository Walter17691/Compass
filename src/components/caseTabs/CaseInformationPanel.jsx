import { KEY_DATE_FIELDS } from '../../lib/caseKeyDates';
import { caseInformationItems } from '../../lib/caseSurface';
import { ProcessChecklistPanel } from '../ProcessChecklistPanel';
import { COLOR, TYPE } from '../../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 — the basic facts of a case, in a section that says so.
//
// Description, who referred it, whether this employee has been here before and
// the dates that matter were all reachable only by opening "Checks and
// analysis" — a heading that promised neither. They are now simply case
// information.
//
// Owner is deliberately NOT here. It is already in the case header; repeating
// it was one of the duplications this wave exists to remove.
//
// The meeting-derived rating is not here either. It comes from the most recent
// meeting's AI assessment, which makes it Compass analysis, not a case fact.
// ─────────────────────────────────────────────────────────────────────────

const DATE_LABEL = {
  fitNoteEndDate: "Fit note expires",
  probationReviewDate: "Probation review",
  ohReferralDate: "OH referral date",
  ohReportReceivedDate: "OH report received",
  suspensionReviewDate: "Suspension review",
};

export function CaseInformationPanel({
  cs, cases, saveCases, repeatCount = 0, dateRelevance = {}, processTemplate = null,
}) {
  const items = caseInformationItems(cs, { repeatCount });
  const visibleDateFields = KEY_DATE_FIELDS.filter(d => dateRelevance[d.field]);
  // The OH report date only makes sense once a referral date exists — the same
  // condition the previous surface used.
  const dateFields = visibleDateFields.map(d => d.field);
  if (dateFields.includes("ohReferralDate") && cs.ohReferralDate) {
    dateFields.splice(dateFields.indexOf("ohReferralDate") + 1, 0, "ohReportReceivedDate");
  }
  const patch = fields => saveCases(cases.map(x => x.id===cs.id ? {...x, ...fields} : x));

  const showChecklist = !!processTemplate && (
    processTemplate.required_documents?.length>0 ||
    processTemplate.suggested_meetings?.length>0 ||
    processTemplate.suggested_role_ids?.length>0 ||
    !!processTemplate.policy_category ||
    processTemplate.target_days>0
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      {items.map(item => (
        <div key={item.id}>
          <div style={{...TYPE.metadata,color:COLOR.inkFaint,marginBottom:4}}>{item.label}</div>
          <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.6}}>{item.value}</div>
        </div>
      ))}

      {/* A blank description is not news on the default surface — but this IS
          the place a reader comes to look at case information, so saying it is
          empty here is useful rather than noisy. */}
      {!cs.description&&(
        <div>
          <div style={{...TYPE.metadata,color:COLOR.inkFaint,marginBottom:4}}>Description</div>
          <div style={{fontSize:13,color:COLOR.inkFaint}}>No description recorded.</div>
        </div>
      )}

      {dateFields.length>0&&(
        <div>
          <div style={{...TYPE.metadata,color:COLOR.inkFaint,marginBottom:10}}>Key dates</div>
          <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
            {dateFields.map(field => (
              <div key={field}>
                <label htmlFor={`case-info-${field}`} style={{fontSize:11,color:"#8A8EA3",display:"block",marginBottom:4}}>{DATE_LABEL[field]}</label>
                <input id={`case-info-${field}`} type="date" value={cs[field]||""}
                  onChange={e=>patch({[field]: e.target.value||null})}
                  style={{fontSize:13,border:"1px solid #E8EAF2",borderRadius:6,padding:"6px 10px",color:"#0F1224"}}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {showChecklist&&(
        <div>
          <div style={{...TYPE.metadata,color:COLOR.inkFaint,marginBottom:10}}>Process checklist</div>
          <ProcessChecklistPanel template={processTemplate} />
        </div>
      )}
    </div>
  );
}
