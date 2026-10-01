import { useState } from 'react';
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

// ── Progressive disclosure ──────────────────────────────────────────────────
//
// Human UAT: every question, every inconsistency and every action button was
// rendered at full weight at once, which turned the advisory home into a second
// operational dashboard. The intelligence should be in the system, not all over
// the screen — so each group states what it holds and reveals the detail on ask.
// Nothing is removed: expanded, every existing action is exactly as it was.
function Reveal({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,paddingTop:14}}>
      <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}
        style={{display:"flex",width:"100%",alignItems:"baseline",justifyContent:"space-between",gap:12,
                background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left",
                fontFamily:"DM Sans,system-ui,sans-serif"}}>
        <span style={{...TYPE.rowContext,color:COLOR.ink,fontWeight:600}}>{title}</span>
        <span style={{...TYPE.metadata,color:COLOR.inkQuiet,whiteSpace:"nowrap"}}>
          {summary}{" "}
          <span aria-hidden="true" style={{display:"inline-block",transition:"transform 120ms ease",
                transform:open?"rotate(90deg)":"none"}}>›</span>
        </span>
      </button>
      {open && <div style={{marginTop:14}}>{children}</div>}
    </div>
  );
}

export function CompassAnalysisPanel({
  cs, readiness, currentRisk,
  nextAction = {}, caseIntel = {}, caseActions = {},
  caseSignals = {}, automation = {}, riskItems = [], ai = {},
}) {
  const unanswered = caseSignals.unanswered || [];
  const inconsistencies = caseSignals.inconsistencies || [];
  const reviewCount = unanswered.length + inconsistencies.length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      {/* ── A. The one thing Compass suggests doing next ────────────────────
          First, because it is the only item here that proposes an action. */}
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

      {/* ── B. Things to review ─────────────────────────────────────────────
          Unanswered questions and potential inconsistencies are the same job —
          "what might this case be missing?" — so they are one area that states
          its size and reveals the detail on ask, rather than two long lists of
          fully-weighted cards. Every action inside is unchanged. */}
      <Reveal
        title="Things to review"
        summary={reviewCount ? `${reviewCount} to look at` : "Nothing outstanding"}
        defaultOpen={false}>
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          <UnansweredQuestionsPanel
            cs={cs}
            covered={caseIntel.unansweredCovered?.[cs.id]||[]}
            stillToExplore={unanswered}
            loading={caseIntel.unansweredLoading?.[cs.id]}
            onGenerate={caseIntel.generateUnansweredQuestions}
            createCaseTask={caseActions.createCaseTask}
            changeSignalStatus={caseActions.changeSignalStatus}
            onAskWhy={caseActions.onAskWhy}
          />
          <InconsistenciesPanel
            cs={cs}
            signals={inconsistencies}
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
        </div>
      </Reveal>

      {/* ── C. The neutral summary ──────────────────────────────────────────
          No large permanent branded card when nothing has been generated. */}
      <Reveal title="Case overview" summary={ai.overview ? "Generated" : "Not generated"}>
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
      </Reveal>

      {/* ── D/E. Compass's own read of the case ─────────────────────────────
          Readiness and the meeting-derived risk rating are assessments, not case
          state and not instructions. They sit LAST and quietly: an AI risk label
          must never visually compete with a deterministic procedural Guardrail,
          which is a different kind of claim entirely. */}
      {(readiness?.applicable || currentRisk) && (
        <Reveal
          title="Compass's read of this case"
          summary={currentRisk ? `Risk: ${currentRisk}` : "Readiness only"}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {currentRisk&&(
              <Block title="Risk rating"
                hint="Compass's assessment of the most recent meeting. Nobody set this field by hand, and it is advisory only.">
                <span style={{...TYPE.metadata,fontWeight:700,color:RISK_STYLE[currentRisk]?.color||COLOR.ink,
                              background:RISK_STYLE[currentRisk]?.bg||COLOR.rail,borderRadius:4,padding:"3px 9px"}}>{currentRisk} RISK</span>
              </Block>
            )}
            {readiness?.applicable&&(
              <Block title="Case readiness"
                hint="Compass's score for how well-covered this case looks. A quality indicator, not a legal compliance guarantee.">
                <CaseReadinessBadge readiness={readiness}/>
              </Block>
            )}
          </div>
        </Reveal>
      )}
    </div>
  );
}
