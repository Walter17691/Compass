import { ChecklistScreen } from './checklist/ChecklistScreen';

const OWNER_COLORS = {"HR":"#7C5CFC","Line Manager":"#D4882A","IT":"#4A6FA5","Facilities":"#4A7C6F","New Starter":"#888"};

export function NewStarterScreen({ activeStarter, setActiveStarter, starterView, setStarterView, newStarterForm, setNewStarterForm, starterTemplates, createStarterInstance, starterInstances, aiCustomiseChecklist, starterAiProcessing, toggleStarterTask, updateStarterTaskNote, addStarterTask, removeStarterTask, reassignStarterTaskOwner }) {
  return (
    <ChecklistScreen
      title="New starter onboarding"
      subtitle="AI-customised induction journeys. Track every task from offer accepted to end of probation."
      active={activeStarter} setActive={setActiveStarter}
      view={starterView} setView={setStarterView}
      form={newStarterForm} setForm={setNewStarterForm}
      templates={starterTemplates}
      createInstance={createStarterInstance}
      instances={starterInstances}
      aiCustomise={aiCustomiseChecklist}
      aiProcessing={starterAiProcessing}
      toggleTask={toggleStarterTask}
      updateTaskNote={updateStarterTaskNote}
      addTask={addStarterTask}
      removeTask={removeStarterTask}
      reassignTaskOwner={reassignStarterTaskOwner}
      dateFieldKey="startDate"
      dateFieldLabel="Start date"
      createButtonLabel="Create onboarding journey"
      createDisabled={!newStarterForm.name||!newStarterForm.startDate}
      addButtonLabel="+ Add starter"
      allButtonLabel="All starters"
      emptyTitle="No starters yet"
      emptySubtitle="Create an onboarding journey for each new hire."
      emptyButtonLabel="+ Add first starter"
      ownerColors={OWNER_COLORS}
      listSecondaryLine={s => `Start: ${new Date(s.startDate).toLocaleDateString("en-GB")} · Manager: ${s.manager||"Not set"}`}
      sidebarLine1={s => `Start date: ${new Date(s.startDate).toLocaleDateString("en-GB")}`}
      sidebarLine2={s => `Manager: ${s.manager||"Not set"}`}
    />
  );
}
