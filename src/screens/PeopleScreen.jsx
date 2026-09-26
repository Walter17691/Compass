import { useMemo, useState } from 'react';
import { SCREENS } from '../constants';
import { buildEmployeeRoster, rosterNamesSharedBy } from '../lib/employeeContext';
import { useLoadMore } from '../hooks/useLoadMore';
import { PageHeader } from '../components/design/PageHeader';
import { DataRow, RowChevron } from '../components/design/DataRow';
import { EmptyState } from '../components/design/EmptyState';
import { FONT, COLOR, TYPE, SPACE, RADIUS, CONTENT_MAX_WIDTH } from '../styles/tokens';

// Phase 2B — calm structured list (Compass Design Vision §2), replacing
// the previous repeated bordered-card layout. People stays deliberately
// scoped to Compass's own ER use case (meeting history), not a general
// HRIS directory — same fields as before, just presented as rows.
// ─────────────────────────────────────────────────────────────────────────
// Phase E0.7 — People is the ROSTER, not a set of strings seen in cases.
//
// It used to build its list as `new Set(cases.map(c => c.employeeName))`, which
// meant:
//   * two colleagues sharing a display name collapsed into ONE row, with their
//     case histories merged and a single link to a merged Person View;
//   * a typo in one case created a whole new "person";
//   * the 396 real employees with no case yet were invisible entirely;
//   * the row's React key and its navigation were both the NAME.
//
// It is now employee_records, keyed by uuid, with counts drawn only from
// canonical relationships. Production is almost entirely unreconciled synthetic
// history, so most rows will show no activity — that is the truthful answer, and
// deliberately preferred to a number assembled from string matches.
// ─────────────────────────────────────────────────────────────────────────
export function PeopleScreen({ cases, employeeRecords = [], wellbeingNotes = [], concernReferrals = [], dsarRequests = [], setActiveEmployeeId, setScreen, setMeetingSetup }) {
  const [search, setSearch] = useState("");
  const roster = useMemo(
    () => buildEmployeeRoster({ employeeRecords, cases, wellbeingNotes, concernReferrals, dsarRequests }),
    [employeeRecords, cases, wellbeingNotes, concernReferrals, dsarRequests]
  );
  // Two employees may legitimately answer to one name once UNIQUE(org_id,name)
  // is removed. Rows stay distinguishable when that happens rather than becoming
  // an unresolvable pair of identical links.
  const sharedNames = useMemo(() => rosterNamesSharedBy(roster), [roster]);
  // Searching a name is fine — it narrows a list, it does not decide identity.
  const filteredPeople = search
    ? roster.filter(p =>
        [p.name, p.jobTitle, p.location, p.department, p.employeeNumber]
          .some(v => (v || "").toLowerCase().includes(search.toLowerCase())))
    : roster;
  const { visible: people, hasMore, loadMore, total } = useLoadMore(filteredPeople, 20);

  return (
    <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"32px 28px"}}>
      <PageHeader
        title="People"
        subtitle="Everyone on the employee roster"
        actions={
          <input aria-label="Search people" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people…"
            style={{padding:"8px 12px",fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,background:COLOR.surface,color:COLOR.ink,fontFamily:FONT.sans,outline:"none",width:200}}/>
        }
      />
      <div>
        {people.map(p=>(
          // "New meeting" is a real, separate control that must NOT
          // trigger the row's own navigation — a native <button> can't
          // nest another interactive control, so only the navigate-to-
          // person content is the button; "New meeting" stays a sibling,
          // now a small tertiary text action rather than a filled
          // purple button so a list of many people doesn't read as many
          // competing primary CTAs (Compass Design Vision §2) — but
          // still always visible, never hover-only.
          <DataRow key={p.id}>
            {/* Navigation carries the UUID. The name is a label on the way past. */}
            <button type="button" onClick={()=>{setActiveEmployeeId(p.id);setScreen(SCREENS.EMPLOYEE_FILE);}}
              style={{flex:1,minWidth:0,padding:"14px 4px",cursor:"pointer",background:"none",border:"none",textAlign:"left",font:"inherit",color:"inherit",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:COLOR.ink,marginBottom:2}}>{p.name||"(no name recorded)"}</div>
                <div style={{...TYPE.metadata,color:COLOR.inkFaint,fontWeight:400,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span>{[p.jobTitle,p.location,p.employeeNumber?`#${p.employeeNumber}`:null].filter(Boolean).join(" · ")||"No further details on file"}</span>
                  {/* Counts from canonical relationships only. Zero is a real
                      answer for an employee whose history was never reconciled. */}
                  <span>· {p.caseCount} case{p.caseCount!==1?"s":""}{p.openCaseCount>0?` (${p.openCaseCount} open)`:""}</span>
                  {sharedNames.has((p.name||"").trim().toLowerCase())&&(
                    <span style={{fontSize:11,color:COLOR.amber}}>· another employee shares this name</span>
                  )}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                {p.employmentStatus==="leaver"&&<span style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint}}>LEAVER</span>}
                <RowChevron/>
              </div>
            </button>
            {/* IA & User Journey pass, §37 audit finding — this used to
                prefill meetingSetup then navigate to Home, where Home's
                own "Start meeting" button calls freshMeetingSetup() and
                wipes the prefill the moment it's clicked, forcing a
                second, confusing step. PersonViewScreen's own "+ New
                meeting" already goes straight to the meeting-setup
                screen with the prefill intact — same destination here now. */}
            {/* Still prefills the NAME, because the meeting form's employee field
                is a display label until E2 gives meetings canonical parentage.
                It prefills a form the user confirms; it establishes nothing. */}
            <button type="button" onClick={()=>{setMeetingSetup(s=>({...s,employee:p.name}));setScreen(SCREENS.HOME+"_meeting");}}
              style={{fontSize:12,background:"none",border:"none",padding:"5px 8px",color:COLOR.purple,cursor:"pointer",fontWeight:600,fontFamily:FONT.sans,flexShrink:0,marginRight:4}}>+ New meeting</button>
          </DataRow>
        ))}
        {people.length===0&&<EmptyState message={search?"No people match your search.":"No employees on the roster yet — add them in Settings → Employee data"}/>}
        {hasMore&&(
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,cursor:"pointer",fontSize:13,color:COLOR.purple,fontWeight:600,fontFamily:FONT.sans,marginTop:SPACE.sm}}>
            Load more ({people.length} of {total})
          </button>
        )}
      </div>
    </div>
  );
}
