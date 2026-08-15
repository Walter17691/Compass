// Integrations & Workflow Automation (Phase 5, IP6, §25) — Command Bar
// core. A natural-language instruction is parsed by Claude (via
// /api/chat, the same shared endpoint every other AI call in this app
// already uses — no new serverless function needed, same Vercel
// function-budget reasoning as every other route this phase touches)
// into a small, itemized action plan the user confirms before anything
// executes.
//
// Initially maps onto exactly two already-existing, safe-to-execute-
// headlessly actions: creating a case task (App.jsx's createCaseTask)
// and opening a case (plain screen navigation) — deliberately not
// letter drafting. handleLetter is tightly coupled to whichever case/
// meeting is already "active" in session state, not addressable by an
// arbitrary case picked from a global command bar; giving it a real
// headless entry point is its own piece of work, left to IP12's smart
// email drafting rather than bolted on here. Later phases (IP7's
// multi-step workflows, IP12) extend this same action catalog once more
// actions have a safe headless path.
//
// The AI is never told real case ids — only employee names, the same
// trust boundary matchCaseByEmployeeName (lib/globalAssistant.js)
// already establishes for the rest of this app's AI features.
// Resolution back to a real caseId happens here, client-side, pure, over
// data the caller already has RLS-scoped access to.

import { matchCaseByEmployeeName } from './globalAssistant';

export const COMMAND_BAR_ACTION_TYPES = ["create_task", "open_case"];

export const COMMAND_BAR_SYSTEM_PROMPT = "You are Compass's Command Bar, turning a short HR instruction into a small, precise action plan. You may only propose actions of these exact types: \"create_task\" (add a task to a named employee's case — needs employeeName, taskName, and dueDate as an ISO YYYY-MM-DD date only if a date or relative date like \"Friday\" or \"in two weeks\" is mentioned, otherwise null) and \"open_case\" (just navigate to a named employee's case — needs employeeName, taskName and dueDate both null). The instruction may describe more than one distinct step (e.g. mentioning several employees, or several separate things to do) — when it does, return one action per step rather than merging them into one, so each can be reviewed and confirmed individually. Never propose any other action type, and never invent an employee name the instruction doesn't mention. If the instruction is ambiguous, unsupported, or names no employee, return an empty actions array and explain why in \"clarification\". Respond ONLY with valid JSON, no other text: {\"actions\":[{\"type\":\"create_task\"|\"open_case\",\"employeeName\":\"as mentioned\",\"taskName\":\"...\"|null,\"dueDate\":\"YYYY-MM-DD\"|null}],\"clarification\":\"...\"|null}";

// Resolves the AI's employee-name-addressed action plan against the
// cases this caller can actually see, producing what the UI renders as
// "Compass will: ..." and what App.jsx's confirmCommandBarPlan executes.
// Pure — no fetch, no case mutation. An action that can't be resolved
// (case not found, task action with no task name) is kept in the list
// with resolved:false and a summary explaining why, rather than silently
// dropped — the user should see what Compass couldn't do, not just what
// it could.
export function resolveCommandBarPlan(parsed, cases) {
  const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const actions = rawActions
    .filter(a => COMMAND_BAR_ACTION_TYPES.includes(a?.type) && a?.employeeName)
    .map(a => {
      const cs = matchCaseByEmployeeName(cases, a.employeeName);
      if (!cs) {
        return { ...a, resolved: false, summary: `Couldn't find a case for "${a.employeeName}".` };
      }
      if (a.type === "create_task") {
        const taskName = a.taskName?.trim();
        if (!taskName) return { ...a, resolved: false, summary: `No task description given for ${cs.employeeName}.` };
        return { ...a, resolved: true, caseId: cs.id, caseEmployeeName: cs.employeeName, taskName, summary: `Create task "${taskName}" on ${cs.employeeName}'s case${a.dueDate ? ` (due ${a.dueDate})` : ""}.` };
      }
      return { ...a, resolved: true, caseId: cs.id, caseEmployeeName: cs.employeeName, summary: `Open ${cs.employeeName}'s case.` };
    });
  return { actions, clarification: parsed?.clarification || null };
}
