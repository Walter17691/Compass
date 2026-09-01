import { Component } from "react";

// Human UAT remediation, Batch 2, Part 3 — "Ask Compass during the
// meeting crashed" (HIGH PRIORITY). Root cause was a real bug (RecordScreen
// passed a pre-rendered array of JSX elements into MDRenderer's `text`
// prop, which calls `text.replace(...)` expecting a string) and has been
// fixed at the source. This boundary is deliberately scoped to just the
// Ask Compass response list, not layered on top of the fix as the actual
// solution: the app's own top-level ErrorBoundary (src/ErrorBoundary.jsx)
// already exists, but it wraps the ENTIRE app — a render error anywhere
// inside AI-generated response content, a genuinely higher-risk surface
// than a plain typed textarea, would otherwise unmount the whole app,
// including the meeting notes/transcript the user is actively typing
// elsewhere on the same screen, which have not necessarily been saved
// yet. Scoping the boundary here means a future, unforeseen rendering
// problem in an AI response can only ever take down this one panel,
// never the notes the user is mid-way through capturing.
export class AskCompassErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Ask Compass response failed to render:", error, info.componentStack);
  }

  componentDidUpdate(prevProps) {
    // A new question/answer arriving is the natural "try again" moment —
    // no separate retry button needed inside this small panel.
    if (this.state.error && prevProps.children !== this.props.children) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{fontSize:12,color:"#C84B2F",background:"#FEF0EB",border:"1px solid #C84B2F44",borderRadius:8,padding:"10px 12px"}}>
        Compass couldn't display that response, but your meeting notes are safe. Try asking again.
      </div>
    );
  }
}
