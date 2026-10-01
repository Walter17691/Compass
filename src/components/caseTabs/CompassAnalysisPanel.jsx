import { CaseReadinessBadge } from '../CaseReadinessBadge';
import { UnansweredQuestionsPanel } from '../UnansweredQuestionsPanel';
import { InconsistenciesPanel } from '../InconsistenciesPanel';
import { CaseRiskPanel } from '../CaseRiskPanel';
import { AutomationSuggestionsPanel } from '../AutomationSuggestionsPanel';
import { SignalCard } from '../SignalCard';
import { PolicyCitation } from '../PolicyCitation';
import { AIAssistantTab } from './AIAssistantTab';
import { COLOR, TYPE } from '../../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 — one home for Compass's advisory intelligence.
//
// Compass's read of a case was scattered: a readiness score and "Unanswered
// questions" sat in a box called "Case readiness" inside "Checks and analysis",
// the risk rating sat on a summary line next to the case owner as though it
// were an administrative fact, "Ask Compass for its take" had a full-width
// purple strip of its own below the header, and the AI assistant was a separate
// section. Four surfaces for one idea.
//
// They are one section now, progressive and collapsed by default.
//
// ┌─ WHAT THIS IS NOT ──────────────────────────────────────────────────────┐
// │ Not a new capability. Every panel here already existed, with the same   │
// │ data, the same handlers and the same gates. Nothing was added, no score │
// │ was invented, and no new AI call exists.                                │
// │                                                                          │
// │ Not a decision-maker. Everything here is advisory; the human decides.   │
// │                                                                          │
// │ Not Guardrails. Those are deterministic process-risk signals and stay   │
// │ prominent on the main surface, exactly as Wave B.1 left them.           │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

const RISK_STYLE = {
  HIGH: { color:"#C84B2F", bg:"#FEF0EB" },
  MEDIUM: { color:"#B87520", bg:"#FEF5E7" },
};

function Block({ title, hint, children }) {
  return (
    <div>
      {title&&<div style={{...TYPE.metadata,color:COLOR.inkFaint,marginBottom:hint?2:8}}>{title}</div>}
      {/* Walter could not tell what these controls were for. Each one now says. */}
      {hint&&<div style={{...TYPE.metadata,color:COLOR.inkQuiet,marginBottom:8,maxWidth:620,lineHeight:1.5}}>{hint}</div>}
      {children}
    </div>
  );
}

export function CompassAnalysisPanel({
  cs, readiness, currentRisk,
  nextAction = {}, caseIntel = {}, caseActions = {},
  caseSignals = {}, automation = {}, riskItems = [], ai = {},
}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {/* Compass's read of how ready this case is. It was beside the next-step
          action, where it looked like part of the instruction rather than an
          assessment the manager is free to disagree with. */}
      {readiness?.applicable&&(
        <Block title="Case readiness"
          hint="Compass's score for how well-covered this case looks. A quality indicator, not a legal compliance guarantee.">
          <CaseReadinessBadge readiness={readiness}/>
        </Block>
      )}

      {/* The risk rating is the most recent meeting's AI assessment — it is a
          Compass opinion, not a field anyone set, so it belongs here rather than
          on a line next to the case owner. "Not assessed" simply means no
          meeting has been assessed yet, and is no longer shown as though it were
          an unfilled administrative field. */}
      {currentRisk&&(
        <Block title="Risk rating"
          hint="Compass's assessment of the most recent meeting. Nobody set this field by hand.">
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:11,fontWeight:700,color:RISK_STYLE[currentRisk]?.color||COLOR.ink,background:RISK_STYLE[currentRisk]?.bg||COLOR.surface,borderRadius:4,padding:"3px 9px"}}>{currentRisk} RISK</span>
            <span style={{...TYPE.metadata,color:COLOR.inkQuiet}}>From Compass&apos;s assessment of the most recent meeting.</span>
          </div>
        </Block>
      )}

      {/* Wave B.2 corrective — ONE front door, not two.
          "Compass's suggested next action" was a heading and "Ask Compass for its
          take" was the button underneath it, and they are the same capability:
          generateNextBestAction. Two names for one job reads as two features. The
          block is named for the job and the button is named for the act, and each
          capability below now says plainly what it is for — which is the whole
          complaint about this area. */}
      <Block title="Suggested next step"
        hint="One procedural step, grounded in a named fact from this case. Never a sanction or an outcome — those are yours.">
        {nextAction.signal ? (
          <>
            <SignalCard
              signal={nextAction.signal}
              onDismiss={nextAction.onDismiss}
              onMarkNotRelevant={nextAction.onMarkNotRelevant}
              onAskWhy={nextAction.onAskWhy}
              extraActions={nextAction.extraActions}
            />
            {nextAction.policyRef&&(
              <div style={{marginTop:8}}>
                <PolicyCitation
                  policyName={nextAction.policyRef.label}
                  clauseHeading={nextAction.policyRef.clauseHeading}
                  clauseText={nextAction.policyRef.clauseText}
                />
              </div>
            )}
          </>
        ) : (
          <button onClick={nextAction.onGenerate} disabled={nextAction.loading}
            style={{fontSize:12,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"6px 14px",color:COLOR.purple,cursor:nextAction.loading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
            {nextAction.loading ? "Compass is thinking…" : "Suggest a next step"}
          </button>
        )}
      </Block>

      <UnansweredQuestionsPanel
        cs={cs}
        covered={caseIntel.unansweredCovered?.[cs.id]||[]}
        stillToExplore={caseSignals.unanswered||[]}
        loading={caseIntel.unansweredLoading?.[cs.id]}
        onGenerate={caseIntel.generateUnansweredQuestions}
        createCaseTask={caseActions.createCaseTask}
        changeSignalStatus={caseActions.changeSignalStatus}
        onAskWhy={caseActions.onAskWhy}
      />

      <InconsistenciesPanel
        cs={cs}
        signals={caseSignals.inconsistencies||[]}
        loading={caseIntel.inconsistencyLoading}
        onCheck={caseIntel.generateInconsistencies}
        changeSignalStatus={caseActions.changeSignalStatus}
        createCaseTask={caseActions.createCaseTask}
        allegations={caseIntel.allegations||[]}
        onLinkAllegation={caseActions.linkSignalToAllegation}
        onAskWhy={caseActions.onAskWhy}
      />

      <CaseRiskPanel riskItems={riskItems} onAskWhy={caseActions.onAskWhy} />

      <AutomationSuggestionsPanel
        suggestions={automation.suggestions}
        automationLevels={automation.automationLevels}
        cs={cs}
        onResendReminder={automation.onResendReminder}
      />

      <AIAssistantTab
        cs={cs}
        chatHistory={ai.chatHistory||[]}
        chatInput={ai.chatInput}
        setChatInput={ai.setChatInput}
        chatProcessing={ai.chatProcessing}
        sendChat={ai.sendChat}
        overview={ai.overview}
        overviewLoading={ai.overviewLoading}
        generateOverview={ai.generateOverview}
        overviewSources={ai.overviewSources}
        onAskWhy={caseActions.onAskWhy}
      />
    </div>
  );
}
