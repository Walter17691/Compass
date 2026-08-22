import { ChecklistScreen } from './checklist/ChecklistScreen';
import { Btn, Card } from '../components/Primitives';
import { DateInput } from '../components/DateInput';

const REASON_LABELS = {
  resignation: "Resignation",
  redundancy: "Redundancy",
  dismissal: "Dismissal",
  retirement: "Retirement",
  end_of_contract: "End of fixed-term contract",
  other: "Other",
};

const OWNER_COLORS = {"HR":"#7C5CFC","Line Manager":"#D4882A","IT":"#4A6FA5","Facilities":"#4A7C6F","Payroll":"#7A5C4A"};

export function OffboardingScreen({ activeLeaver, setActiveLeaver, leaverView, setLeaverView, newLeaverForm, setNewLeaverForm, leaverTemplates, createLeaverInstance, leaverInstances, aiCustomiseLeaverChecklist, leaverAiProcessing, toggleLeaverTask, updateLeaverTaskNote, addLeaverTask, removeLeaverTask, reassignLeaverTaskOwner, updateLeaverExitInterview, portalAccounts, revokePortalAccess }) {
  const hasPortalAccess = activeLeaver && (portalAccounts||[]).some(a=>a.employee_name===activeLeaver.name);

  return (
    <ChecklistScreen
      title="Employee offboarding"
      subtitle="AI-guided leaver checklists. Track access revocation, handover, final pay and exit interviews."
      active={activeLeaver} setActive={setActiveLeaver}
      view={leaverView} setView={setLeaverView}
      form={newLeaverForm} setForm={setNewLeaverForm}
      templates={leaverTemplates}
      createInstance={createLeaverInstance}
      instances={leaverInstances}
      aiCustomise={aiCustomiseLeaverChecklist}
      aiProcessing={leaverAiProcessing}
      toggleTask={toggleLeaverTask}
      updateTaskNote={updateLeaverTaskNote}
      addTask={addLeaverTask}
      removeTask={removeLeaverTask}
      reassignTaskOwner={reassignLeaverTaskOwner}
      dateFieldKey="lastWorkingDay"
      dateFieldLabel="Last working day"
      createButtonLabel="Create offboarding checklist"
      createDisabled={!newLeaverForm.name||!newLeaverForm.lastWorkingDay}
      addButtonLabel="+ Add leaver"
      allButtonLabel="All leavers"
      emptyTitle="No leavers yet"
      emptySubtitle="Create an offboarding checklist when someone hands in their notice."
      emptyButtonLabel="+ Add first leaver"
      ownerColors={OWNER_COLORS}
      listSecondaryLine={s => `Last day: ${new Date(s.lastWorkingDay).toLocaleDateString("en-GB")} · ${REASON_LABELS[s.reason]||"Not specified"}`}
      sidebarLine1={s => `Last working day: ${new Date(s.lastWorkingDay).toLocaleDateString("en-GB")}`}
      sidebarLine2={s => `Reason: ${REASON_LABELS[s.reason]||"Not specified"}`}
      renderExtraFormFields={() => (
        <div style={{marginBottom:14}}>
          <label htmlFor="offboarding-reason" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Reason for leaving</label>
          <select id="offboarding-reason" value={newLeaverForm.reason} onChange={e=>setNewLeaverForm(p=>({...p,reason:e.target.value}))}
            style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
            {Object.entries(REASON_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}
      renderExtraSidebar={(active) => (
        <>
          <Card style={{marginBottom:12}}>
            <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Exit interview</div>
            <label htmlFor="offboarding-exit-interview-date" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Date</label>
            <DateInput id="offboarding-exit-interview-date" value={active.exitInterviewDate||""} onChange={e=>updateLeaverExitInterview(active.id,{exitInterviewDate:e.target.value})} />
            <label htmlFor="offboarding-exit-interview-notes" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",margin:"12px 0 5px"}}>Notes</label>
            <textarea id="offboarding-exit-interview-notes" placeholder="What did they say? Reasons for leaving, feedback, anything to follow up on..."
              value={active.exitInterviewNotes||""}
              onChange={e=>updateLeaverExitInterview(active.id,{exitInterviewNotes:e.target.value})}
              rows={5}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#1A1535",boxSizing:"border-box"}} ></textarea>
          </Card>
          {hasPortalAccess&&(
            <Card style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Employee Portal</div>
              <div style={{fontSize:12,color:"#6B6880",marginBottom:10,lineHeight:1.6}}>{active.name} still has active Portal access — they can view their case status and documents.</div>
              <Btn variant="danger" onClick={()=>revokePortalAccess(active.name)} style={{width:"100%",fontSize:12,padding:"9px"}}>Revoke portal access</Btn>
            </Card>
          )}
        </>
      )}
    />
  );
}
