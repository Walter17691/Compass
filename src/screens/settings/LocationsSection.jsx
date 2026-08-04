import { Btn, Card } from '../../components/Primitives';

export function LocationsSection({ isHR, locations, deleteLocation, addLocation }) {
  if(!isHR) return null;
  return (
    <Card>
      <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Locations</div>
      <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Add office locations. Managers will be assigned to a location and will only see cases from their location.</p>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        {locations.map(l=>(
          <div key={l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F5F1EA",borderRadius:8,padding:"10px 14px"}}>
            <span style={{fontSize:14,color:"#1A1535"}}>{l.name}</span>
            <button onClick={()=>deleteLocation(l.id)} style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:12}}>Remove</button>
          </div>
        ))}
        {locations.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No locations added yet</div>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <input id="new-location-input" placeholder="e.g. London, Manchester..."
          style={{flex:1,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535"}}/>
        <Btn onClick={()=>{
          const input = document.getElementById("new-location-input");
          if(input?.value.trim()){ addLocation(input.value.trim()); input.value=""; }
        }}>Add</Btn>
      </div>
    </Card>
  );
}
