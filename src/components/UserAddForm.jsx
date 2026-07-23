import { useState } from "react";
import { Btn } from "./Primitives";

export function UserAddForm({ onAdd }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("HR Manager");
  const [email, setEmail] = useState("");
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <input placeholder="Full name" value={name} onChange={e=>setName(e.target.value)}
          style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none"}} />
        <select value={role} onChange={e=>setRole(e.target.value)}
          style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none"}}>
          {["HR Director","HR Manager","Line Manager","HR Administrator"].map(r=><option key={r}>{r}</option>)}
        </select>
      </div>
      <input placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)}
        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
      <Btn onClick={()=>{if(name.trim()){onAdd(name.trim(),role,email.trim());setName("");setRole("HR Manager");setEmail("");}}} disabled={!name.trim()} style={{width:"100%",fontSize:12,padding:"8px"}}>Add user</Btn>
    </div>
  );
}
