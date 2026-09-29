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
// ─────────────────────────────────────────────────────────────────────────
// Phase E1.5 — canonical location, and the employees that have none.
//
// People does NOT filter by authorisation. It never did and must not start: the
// roster it receives has already been through employee_records RLS, so a Location
// Manager is handed only their own employees by the database. Filtering here would
// be a second, weaker copy of the rule — and the copy is the one people trust.
//
// What IS added here is an HR-only way to find employees with no canonical
// location. They are not a separate store or a separate table; they are the same
// canonical rows, seen through a filter. While unassigned, only HR can see them at
// all, which is exactly why HR needs to be able to find them.
// ─────────────────────────────────────────────────────────────────────────
export function PeopleScreen({ cases, employeeRecords = [], wellbeingNotes = [], concernReferrals = [], dsarRequests = [], setActiveEmployeeId, setScreen, setMeetingSetup,
                               locations = [], isHR = false, authorisedLocationIds = null, onCreateEmployee,
                               employeeRecordsLoading = false, onStartActivity,
                               employmentEvents = [], archived = false }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocationId, setNewLocationId] = useState("");
  const [saving, setSaving] = useState(false);

  // A Location Manager may only create INTO a location they are authorised for,
  // and cannot create an unassigned employee at all. RLS enforces both; this only
  // decides what the form is allowed to offer, so it never presents a choice the
  // database is going to refuse.
  const assignable = authorisedLocationIds
    ? locations.filter(l => authorisedLocationIds.includes(l.id))
    : locations;
  const mayLeaveUnassigned = isHR;
  const fullRoster = useMemo(
    () => buildEmployeeRoster({ employeeRecords, cases, wellbeingNotes, concernReferrals, dsarRequests, employmentEvents }),
    [employeeRecords, cases, wellbeingNotes, concernReferrals, dsarRequests, employmentEvents]
  );
  // Phase E1.7 — People means CURRENT employees; Archive is the same canonical
  // rows whose effective employment state is former. One projection, no second
  // store, no scheduled move: an employee with a future leaving date stays in
  // People until that date arrives, and appears in Archive from then on.
  const roster = useMemo(
    () => fullRoster.filter(p => archived ? !p.isCurrent : p.isCurrent),
    [fullRoster, archived]
  );
  // Two employees may legitimately answer to one name once UNIQUE(org_id,name)
  // is removed. Rows stay distinguishable when that happens rather than becoming
  // an unresolvable pair of identical links.
  const sharedNames = useMemo(() => rosterNamesSharedBy(roster), [roster]);
  // Searching a name is fine — it narrows a list, it does not decide identity.
  const searched = search
    ? roster.filter(p =>
        [p.name, p.jobTitle, p.location, p.department, p.employeeNumber]
          .some(v => (v || "").toLowerCase().includes(search.toLowerCase())))
    : roster;
  const unassignedCount = roster.filter(p => !p.locationId).length;
  const filteredPeople = view === "unassigned" ? searched.filter(p => !p.locationId) : searched;
  const locationName = (id) => locations.find(l => l.id === id)?.name || "";
  const { visible: people, hasMore, loadMore, total } = useLoadMore(filteredPeople, 20);

  return (
    <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"32px 28px"}}>
      <PageHeader
        title={archived ? "Archive" : "People"}
        subtitle={archived ? "Former employees. Their Employee File and history are retained." : "Everyone currently employed"}
        actions={
          <div style={{display:"flex",gap:SPACE.sm,alignItems:"center",flexWrap:"wrap"}}>
            <input aria-label="Search people" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people…"
              style={{padding:"8px 12px",fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,background:COLOR.surface,color:COLOR.ink,fontFamily:FONT.sans,outline:"none",width:200}}/>
            {!archived&&onCreateEmployee&&assignable.length>0&&(
              <button type="button" onClick={()=>setAdding(a=>!a)}
                style={{padding:"8px 12px",fontSize:13,fontWeight:600,background:COLOR.purple,border:"none",borderRadius:RADIUS.button,color:COLOR.paper,cursor:"pointer",fontFamily:FONT.sans}}>
                Add employee
              </button>
            )}
          </div>
        }
      />

      {/* HR-only filter. Not shown to a Location Manager: every employee they can
          see has a location by definition, so the filter would always be empty,
          and the count itself would disclose how many employees exist outside
          their scope. */}
      {!archived&&isHR&&unassignedCount>0&&(
        <div role="tablist" aria-label="Filter people" style={{display:"flex",gap:SPACE.lg,borderBottom:`1px solid ${COLOR.border}`,marginBottom:SPACE.md}}>
          {[["all",`Everyone · ${roster.length}`],["unassigned",`No location assigned · ${unassignedCount}`]].map(([id,label])=>(
            <button key={id} role="tab" aria-selected={view===id} type="button" onClick={()=>setView(id)}
              style={{...TYPE.rowContext,fontWeight:view===id?700:500,color:view===id?COLOR.ink:COLOR.inkFaint,background:"none",border:"none",
                      borderBottom:`2px solid ${view===id?COLOR.purple:"transparent"}`,padding:`${SPACE.md}px 2px`,minHeight:44,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
              {label}
            </button>
          ))}
        </div>
      )}

      {view==="unassigned"&&(
        <p style={{...TYPE.metadata,color:COLOR.inkQuiet,margin:`0 0 ${SPACE.md}px`,lineHeight:1.6,maxWidth:620}}>
          These employees have no assigned location yet, so only HR can see them. Open a record to assign one.
          Compass won't choose a location from an older free-text entry on its own.
        </p>
      )}

      {adding&&(
        <div style={{border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,padding:SPACE.lg,marginBottom:SPACE.lg,background:COLOR.surface,maxWidth:620}}>
          <div style={{...TYPE.rowContext,color:COLOR.ink,marginBottom:SPACE.md}}>Add an employee</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:SPACE.md}}>
            <div>
              <label htmlFor="new-employee-name" style={{...TYPE.metadata,color:COLOR.inkSoft,display:"block",marginBottom:SPACE.xs}}>Full name</label>
              <input id="new-employee-name" value={newName} onChange={e=>setNewName(e.target.value)}
                style={{width:"100%",fontSize:13,border:`1px solid ${COLOR.borderStrong}`,borderRadius:RADIUS.surface,padding:`${SPACE.sm}px ${SPACE.md}px`,fontFamily:FONT.sans,color:COLOR.ink,background:COLOR.surface,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label htmlFor="new-employee-location" style={{...TYPE.metadata,color:COLOR.inkSoft,display:"block",marginBottom:SPACE.xs}}>Location</label>
              <select id="new-employee-location" value={newLocationId} onChange={e=>setNewLocationId(e.target.value)}
                style={{width:"100%",fontSize:13,border:`1px solid ${COLOR.borderStrong}`,borderRadius:RADIUS.surface,padding:`${SPACE.sm}px ${SPACE.md}px`,fontFamily:FONT.sans,color:newLocationId?COLOR.ink:COLOR.inkQuiet,background:COLOR.surface,outline:"none",boxSizing:"border-box"}}>
                <option value="">{mayLeaveUnassigned?"Choose a location…":"Choose a location…"}</option>
                {assignable.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                {/* Offered to HR only, and worded so choosing it is a decision
                    rather than the result of leaving a field alone. */}
                {mayLeaveUnassigned&&<option value="__unassigned__">No location yet — HR only until one is assigned</option>}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:SPACE.sm,marginTop:SPACE.md,flexWrap:"wrap"}}>
            <button type="button" disabled={!newName.trim()||!newLocationId||saving}
              onClick={async()=>{
                setSaving(true);
                const chosen = newLocationId==="__unassigned__" ? null : newLocationId;
                const res = await onCreateEmployee?.(newName, chosen);
                setSaving(false);
                if(res?.ok){ setNewName(""); setNewLocationId(""); setAdding(false); }
              }}
              style={{...TYPE.metadata,fontWeight:700,background:(!newName.trim()||!newLocationId||saving)?COLOR.border:COLOR.purple,border:"none",borderRadius:RADIUS.button,
                      padding:"8px 14px",color:COLOR.paper,cursor:(!newName.trim()||!newLocationId||saving)?"default":"pointer",fontFamily:FONT.sans}}>
              {saving?"Adding…":"Add employee"}
            </button>
            <button type="button" onClick={()=>{setAdding(false);setNewName("");setNewLocationId("");}}
              style={{...TYPE.metadata,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.button,padding:"8px 14px",color:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans}}>
              Cancel
            </button>
          </div>
        </div>
      )}
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
                  {/* Canonical location where there is one. The legacy free-text
                      value is still shown when there is no canonical location, so a
                      record does not look emptier than it is — but it is labelled
                      as unassigned, because for permission purposes it is. */}
                  <span>{[p.jobTitle,locationName(p.locationId)||p.location,p.employeeNumber?`#${p.employeeNumber}`:null].filter(Boolean).join(" · ")||"No further details on file"}</span>
                  {isHR&&!p.locationId&&(
                    <span style={{fontSize:11,color:COLOR.inkFaint}}>· no location assigned</span>
                  )}
                  {/* Counts from canonical relationships only. Zero is a real
                      answer for an employee whose history was never reconciled. */}
                  <span>· {p.caseCount} case{p.caseCount!==1?"s":""}{p.openCaseCount>0?` (${p.openCaseCount} open)`:""}</span>
                  {sharedNames.has((p.name||"").trim().toLowerCase())&&(
                    <span style={{fontSize:11,color:COLOR.amber}}>· another employee shares this name</span>
                  )}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                {archived&&p.leavingDate&&<span style={{fontSize:11,color:COLOR.inkFaint}}>Left {p.leavingDate}</span>}
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
            {/* Phase E1.6 — the roster-wide way in to recording an activity.
                Carries the canonical UUID and lands on that employee's Activity
                tab, so the manager says what happened rather than choosing
                between "a case" and "a meeting". The roster here is already
                RLS-filtered, so this offers nobody the viewer cannot access. */}
            <button type="button" onClick={()=>{setActiveEmployeeId(p.id);setScreen(SCREENS.EMPLOYEE_FILE);onStartActivity?.();}}
              style={{fontSize:12,background:"none",border:"none",padding:"5px 8px",color:COLOR.purple,cursor:"pointer",fontWeight:600,fontFamily:FONT.sans,flexShrink:0}}>+ Start conversation</button>
            <button type="button" onClick={()=>{setMeetingSetup(s=>({...s,employee:p.name,employeeId:p.id}));setScreen(SCREENS.HOME+"_meeting");}}
              style={{fontSize:12,background:"none",border:"none",padding:"5px 8px",color:COLOR.purple,cursor:"pointer",fontWeight:600,fontFamily:FONT.sans,flexShrink:0,marginRight:4}}>+ New meeting</button>
          </DataRow>
        ))}
        {/* Phase E1.5A — the roster is no longer seeded from a browser cache, so
            until the authorised fetch answers there is genuinely nothing to show.
            Saying "loading" is the truthful answer; "no employees on the roster"
            would be a claim Compass cannot yet make. */}
        {people.length===0&&!archived&&(employeeRecordsLoading
          ? <EmptyState message="Loading the employee roster…"/>
          : <EmptyState message={
              search?"No people match your search."
              :view==="unassigned"?"Every employee has an assigned location."
              :"No employees on the roster yet — add them in Settings → Employee data"}/>)}
        {people.length===0&&archived&&<EmptyState message={employeeRecordsLoading?"Loading…":search?"No former employees match your search.":"No former employees yet."}/>}
        {hasMore&&(
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,cursor:"pointer",fontSize:13,color:COLOR.purple,fontWeight:600,fontFamily:FONT.sans,marginTop:SPACE.sm}}>
            Load more ({people.length} of {total})
          </button>
        )}
      </div>
    </div>
  );
}
