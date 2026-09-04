import { derivePeopleForCase } from '../../lib/casePeople';

const ROLE_COLOR = { Employee: "#7C5CFC", Chair: "#B87520", Witness: "#C84B2F" };

export function PeopleTab({ cs }) {
  const people = derivePeopleForCase(cs);
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#7C5CFC"}}>Participants ({people.length})</div>
      </div>
      <div style={{padding:"16px"}}>
        {people.length===0 && <div style={{fontSize:13,color:"#9B9098"}}>No one recorded on this case yet.</div>}
        {people.map(p => (
          <div key={p.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #F5F1EA"}}>
            <div style={{fontSize:13,color:"#1A1535",fontWeight:500}}>{p.name}</div>
            <div style={{display:"flex",gap:6}}>
              {p.roles.map(r => <span key={r} style={{fontSize:10,fontWeight:600,color:ROLE_COLOR[r]||"#6B6375",background:(ROLE_COLOR[r]||"#6B6375")+"18",borderRadius:4,padding:"2px 8px"}}>{r}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
