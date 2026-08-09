// Placeholder — the case-wide AI Q&A and structured AI Case Overview are
// built in a later phase (getCaseContext(), same shape as the existing
// getPolicyCtx()/getCaseHistoryContext() pattern). Shown as a real,
// honest "not yet" state rather than omitting the tab the rest of the
// workspace already promises.
export function AIAssistantTab() {
  return (
    <div style={{textAlign:"center",padding:"48px 24px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0"}}>
      <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8}}>AI Case Assistant</div>
      <div style={{fontSize:13,color:"#9B9098",maxWidth:420,margin:"0 auto"}}>Coming in a future update — ask questions about this case and get a structured overview of established and disputed facts, drawn only from what's recorded here.</div>
    </div>
  );
}
