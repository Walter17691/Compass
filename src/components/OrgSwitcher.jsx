import { useState, useRef, useEffect } from 'react';

// The org-name badge doubles as a switcher — always clickable, even with
// just one org, so "Join another organisation" has one consistent entry
// point rather than only appearing once a second org already exists.
export function OrgSwitcher({ org, availableOrgs=[], switchOrg, onJoinAnotherOrg }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if(!show) return;
    const onKeyDown = e => { if(e.key==="Escape") setShow(false); };
    const onClickOutside = e => { if(ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [show]);

  if(!org) return null;

  return (
    <div style={{position:"relative"}} ref={ref}>
      <button onClick={()=>setShow(v=>!v)} aria-label={`Switch organisation (current: ${org.name})`} style={{fontSize:11,color:"#9B9098",background:"#F5F1EA",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
        {org.name}
        {availableOrgs.length>1&&<span style={{fontSize:9}}>▾</span>}
      </button>
      {show&&(
        <div role="menu" aria-label="Organisations" style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",minWidth:220,overflow:"hidden",zIndex:250}}>
          {availableOrgs.map(o=>(
            <button key={o.id} onClick={()=>{switchOrg(o.id);setShow(false);}} style={{width:"100%",textAlign:"left",background:o.id===org.id?"#F5F3FF":"none",border:"none",borderBottom:"1px solid #F5F1EA",padding:"10px 14px",fontSize:13,color:o.id===org.id?"#7C5CFC":"#1A1535",fontWeight:o.id===org.id?600:400,cursor:"pointer"}}>
              {o.name}{o.id===org.id&&" ✓"}
            </button>
          ))}
          <button onClick={()=>{setShow(false);onJoinAnotherOrg();}} style={{width:"100%",textAlign:"left",background:"none",border:"none",padding:"10px 14px",fontSize:12,color:"#6B6375",cursor:"pointer"}}>
            + Join another organisation
          </button>
        </div>
      )}
    </div>
  );
}
