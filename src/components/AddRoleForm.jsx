import { useState } from "react";
import { Btn } from "./Primitives";

export function AddRoleForm({ onAdd }) {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState(5);
  return (
    <div style={{display:"flex",gap:8,marginTop:4}}>
      <input aria-label="Role title" placeholder="e.g. Sales Manager" value={title} onChange={e=>setTitle(e.target.value)}
        style={{flex:1,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none"}} />
      <select aria-label="Role access level" value={level} onChange={e=>setLevel(e.target.value)}
        style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none"}}>
        {[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>Level {n}</option>)}
      </select>
      <Btn onClick={()=>{if(title.trim()){onAdd(title.trim(),level);setTitle("");setLevel(5);}}} disabled={!title.trim()} style={{fontSize:12,padding:"8px 14px"}}>Add</Btn>
    </div>
  );
}
