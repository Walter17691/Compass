import { derivePeopleForCase } from '../../lib/casePeople';

const ROLE_COLOR = { Employee: "#7A2FD8", Chair: "#B87520", Witness: "#C84B2F" };

export function PeopleTab({ cs }) {
  const people = derivePeopleForCase(cs);
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FFFFFF",borderBottom:"1px solid #E3E5EE"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#7A2FD8"}}>Participants ({people.length})</div>
      </div>
      <div style={{padding:"16px"}}>
        {people.length===0 && <div style={{fontSize:13,color:"#8A8EA3"}}>No one recorded on this case yet.</div>}
        {people.map(p => (
          <div key={p.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #F0F1F7"}}>
            <div style={{fontSize:13,color:"#0F1224",fontWeight:500}}>{p.name}</div>
            <div style={{display:"flex",gap:6}}>
              {p.roles.map(r => <span key={r} style={{fontSize:10,fontWeight:600,color:ROLE_COLOR[r]||"#4A4E63",background:(ROLE_COLOR[r]||"#4A4E63")+"18",borderRadius:4,padding:"2px 8px"}}>{r}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
