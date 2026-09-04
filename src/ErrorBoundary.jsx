import { Component } from "react";
import { FONT } from "./styles/tokens";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled error in app:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{minHeight:"100vh",background:"#FDFAF5",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"DM Sans,system-ui,sans-serif"}}>
        <div style={{maxWidth:440,width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:32,textAlign:"center"}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1C1820",marginBottom:8}}>Something went wrong</div>
          <p style={{fontSize:13,color:"#6B6375",lineHeight:1.6,marginBottom:20}}>
            Compass hit an unexpected error and couldn't continue. Your data is safe — try again, or reload the page if the problem persists.
          </p>
          <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:this.state.error?.message ? 20 : 0}}>
            <button onClick={()=>this.setState({error:null})} style={{fontSize:13,padding:"9px 18px",background:"#7C5CFC",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>Try again</button>
            <button onClick={()=>window.location.reload()} style={{fontSize:13,padding:"9px 18px",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Reload page</button>
          </div>
          {this.state.error?.message && (
            <div style={{fontSize:11,color:"#9B9098",fontFamily:FONT.mono,background:"#FDFAF5",borderRadius:8,padding:"10px 12px",textAlign:"left",wordBreak:"break-word"}}>
              {this.state.error.message}
            </div>
          )}
        </div>
      </div>
    );
  }
}
