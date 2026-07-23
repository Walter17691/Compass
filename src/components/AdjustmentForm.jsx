import { useState } from "react";
import { Btn } from "./Primitives";

export function AdjustmentForm({ onAdd }) {
  const [adj, setAdj] = useState("");
  const [review, setReview] = useState("");
  return (
    <div style={{fontFamily:"DM Sans,system-ui,sans-serif",marginTop:14,borderTop:"1px solid #E8E0D0",paddingTop:14}}>
      <div style={{fontSize:11,color:"#6B6880",marginBottom:8,fontWeight:600}}>Add adjustment</div>
      <input placeholder="e.g. Flexible start time, additional breaks, remote working" value={adj} onChange={e=>setAdj(e.target.value)}
        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
      <input placeholder="Review date (optional)" value={review} onChange={e=>setReview(e.target.value)}
        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
      <Btn onClick={()=>{if(adj.trim()){onAdd({adjustment:adj.trim(),review});setAdj("");setReview("");}}} disabled={!adj.trim()} style={{fontSize:11,padding:"7px 14px"}}>Add adjustment</Btn>
    </div>
  );
}
