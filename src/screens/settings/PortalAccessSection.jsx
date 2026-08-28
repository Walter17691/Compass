import { Card } from '../../components/Primitives';

export function PortalAccessSection({ isHR, portalAccounts, revokePortalAccess }) {
  if(!isHR) return null;
  return (
    <Card>
      <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Employee Portal access</h3>
      <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Everyone with an active Portal account, where they can view case status and sign documents. Revoke access immediately when someone leaves.</p>
      {portalAccounts.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No employees have Portal access yet</div>}
      {portalAccounts.map(a=>(
        <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
          <div>
            <div style={{fontSize:14,color:"#1A1535"}}>{a.employee_name}</div>
            <div style={{fontSize:11,color:"#6B6880"}}>Access granted {new Date(a.created_at).toLocaleDateString("en-GB")}</div>
          </div>
          <button onClick={()=>revokePortalAccess(a.id, a.employee_name)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 12px",fontSize:11,color:"#C84B2F",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Revoke access</button>
        </div>
      ))}
    </Card>
  );
}
