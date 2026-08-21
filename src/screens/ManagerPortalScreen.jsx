import { SCREENS } from '../constants';
import { Card, Badge } from '../components/Primitives';
import { myAssignedCases, myMeetingsToConduct, myTasksDue, myDocumentsToReview, myHrResponses, myConcernsSubmitted, myUpcomingDeadlines } from '../lib/managerPortal';
import { groupDueSoon } from '../lib/deadlines';
import { getNextStep } from '../lib/nextStep';
import { investigationReviewStatusLabel } from '../lib/approvals';
import { referralStatusMeta } from '../lib/concernReferrals';

const DEADLINE_GROUPS = [
  { key:"overdue", label:"Overdue", color:"#C84B2F" },
  { key:"today", label:"Due today", color:"#B87520" },
  { key:"tomorrow", label:"Due tomorrow", color:"#6B6375" },
  { key:"later", label:"Later", color:"#6B6375" },
];

const SectionCard = ({ title, count, children, empty }) => (
  <Card style={{marginBottom:16}}>
    <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>{title}{count>0?" ("+count+")":""}</div>
    {count===0 ? <div style={{fontSize:13,color:"#9B9098"}}>{empty}</div> : children}
  </Card>
);

// Doubles as a plain display row (no onClick) and a clickable one — only
// the clickable case is real interactive content that needs a real
// button, so this branches rather than always rendering one.
const Row = ({ onClick, children }) => onClick ? (
  <button onClick={onClick} style={{width:"100%",background:"none",border:"none",padding:"9px 0",borderBottom:"1px solid #F5F1EA",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>{children}</button>
) : (
  <div style={{padding:"9px 0",borderBottom:"1px solid #F5F1EA"}}>{children}</div>
);

// Manager Enablement (Phase 4, MP16, §1) — "My People Actions". Built
// last in Track D since it's purely an aggregation over data every
// earlier phase already produces (managerPortal.js) — nothing computed
// here is new, this is a manager-appropriate front door onto it. Gated
// !isHR the same way every other role check in this app already is
// (AppSidebar.jsx) — HR runs the full Cases/Tasks/Concerns screens
// directly rather than a narrowed view of their own.
export function ManagerPortalScreen({ cases, caseAccess, caseTasks, hrReviewRequests, concernReferrals, dueSoon, currentUser, fmtDate, setScreen, setActiveCaseId, setActiveCaseStage }) {
  const openCase = (caseId) => { setActiveCaseId(caseId); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW); };

  const myCases = myAssignedCases(cases, caseAccess, currentUser?.user_id);
  const meetingsToConduct = myMeetingsToConduct(myCases);
  const tasksDue = myTasksDue(caseTasks, currentUser?.name);
  const documentsToReview = myDocumentsToReview(myCases, currentUser?.name);
  const hrResponses = myHrResponses(hrReviewRequests, currentUser?.user_id);
  const concernsSubmitted = myConcernsSubmitted(concernReferrals, currentUser?.user_id);
  const deadlines = myUpcomingDeadlines(dueSoon, myCases.map(c=>c.id));
  // Manager Enablement (Phase 4, MP17, §22/§23) — grouped presentation
  // only; myUpcomingDeadlines above still returns the flat, RLS-scoped
  // list every other consumer of dueSoon already works with.
  const groupedDeadlines = groupDueSoon(deadlines);

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:"40px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>My People Actions</h2>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px"}}>Everything you're assigned to, in one place.</p>

      <SectionCard title="Cases assigned to me" count={myCases.length} empty="No cases assigned to you at the moment.">
        {myCases.map(cs=>(
          <Row key={cs.id} onClick={()=>openCase(cs.id)}>
            <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{cs.employeeName}</div>
            <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{cs.myRoles.join(", ")}{getNextStep(cs)?" · "+getNextStep(cs).label:""}</div>
          </Row>
        ))}
      </SectionCard>

      <SectionCard title="Meetings to conduct" count={meetingsToConduct.length} empty="No meetings currently need to be held.">
        {meetingsToConduct.map(cs=>(
          <Row key={cs.id} onClick={()=>openCase(cs.id)}>
            <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{cs.employeeName}</div>
            <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{getNextStep(cs)?.label}</div>
          </Row>
        ))}
      </SectionCard>

      <SectionCard title="Tasks due" count={tasksDue.length} empty="No open tasks assigned to you.">
        {tasksDue.map(t=>(
          <Row key={t.id} onClick={()=>openCase(t.caseId)}>
            <div style={{fontSize:13,color:"#1A1535"}}>{t.name}</div>
            <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{t.dueDate?"Due "+fmtDate(t.dueDate):"No due date"}</div>
          </Row>
        ))}
      </SectionCard>

      <SectionCard title="Documents to review" count={documentsToReview.length} empty="No notetaker records awaiting your review.">
        {documentsToReview.map((d,i)=>(
          <Row key={i} onClick={()=>openCase(d.caseId)}>
            <div style={{fontSize:13,color:"#1A1535"}}>{d.employeeName}</div>
            <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{d.meetingType} notes submitted for review</div>
          </Row>
        ))}
      </SectionCard>

      <SectionCard title="Requests from HR" count={hrResponses.length} empty="No responses from HR yet.">
        {hrResponses.map(r=>(
          <Row key={r.id} onClick={()=>r.case_id&&openCase(r.case_id)}>
            <div style={{fontSize:13,color:"#1A1535"}}>{r.case_employee_name||"A case"}</div>
            <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{investigationReviewStatusLabel(r.status)}{r.comments?" — "+r.comments:""}</div>
          </Row>
        ))}
      </SectionCard>

      <SectionCard title="Upcoming deadlines" count={deadlines.length} empty="Nothing due in the next two weeks.">
        {DEADLINE_GROUPS.filter(g=>groupedDeadlines[g.key].length>0).map(g=>(
          <div key={g.key} style={{marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:g.color,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{g.label}</div>
            {groupedDeadlines[g.key].map((d,i)=>(
              <Row key={i} onClick={()=>d.caseId&&openCase(d.caseId)}>
                <div style={{fontSize:13,color:"#1A1535"}}>{d.employeeName} — {d.label}</div>
                <div style={{fontSize:11,color:d.overdue?"#C84B2F":"#9B9098",marginTop:2}}>{d.overdue?d.daysOverdue+" day"+(d.daysOverdue!==1?"s":"")+" overdue":"Due "+d.deadlineDate}</div>
              </Row>
            ))}
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Concerns I've submitted" count={concernsSubmitted.length} empty="You haven't raised any concerns.">
        {concernsSubmitted.map(r=>{
          const meta = referralStatusMeta(r.status);
          return (
            <Row key={r.id}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                <div style={{fontSize:13,color:"#1A1535"}}>{r.employeeName}</div>
                <Badge color={meta.color}>{meta.label}</Badge>
              </div>
            </Row>
          );
        })}
      </SectionCard>
    </div>
  );
}
