import { useRef, useState, useEffect } from "react";
import { Btn, Card } from "./Primitives";

export function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState("draw");
  const [typed, setTyped] = useState("");
  const [hasDraw, setHasDraw] = useState(false);

  useEffect(() => {
    const c = canvasRef.current; if(!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle="#FFFFFF"; ctx.lineWidth=2; ctx.lineCap="round";
  }, [mode]);

  const pos = (e, c) => {
    const r = c.getBoundingClientRect();
    const x = (e.touches?e.touches[0].clientX:e.clientX) - r.left;
    const y = (e.touches?e.touches[0].clientY:e.clientY) - r.top;
    return { x:x*(c.width/r.width), y:y*(c.height/r.height) };
  };
  const startDraw = e => { const c=canvasRef.current; const ctx=c.getContext("2d"); const p=pos(e,c); ctx.beginPath(); ctx.moveTo(p.x,p.y); setDrawing(true); };
  const draw = e => { if(!drawing) return; e.preventDefault(); const c=canvasRef.current; const ctx=c.getContext("2d"); const p=pos(e,c); ctx.lineTo(p.x,p.y); ctx.stroke(); setHasDraw(true); };
  const endDraw = () => setDrawing(false);
  const clear = () => { const c=canvasRef.current; const ctx=c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height); setHasDraw(false); };

  const save = () => {
    if(mode==="draw") { if(!hasDraw) return; onSave({type:"draw", data:canvasRef.current.toDataURL()}); }
    else { if(!typed.trim()) return; onSave({type:"typed", data:typed.trim()}); }
  };

  return (
    <div style={{fontFamily:"DM Sans,system-ui,sans-serif",position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <Card style={{width:500,maxWidth:"90vw"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>E-signature</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6B6375",fontSize:22,cursor:"pointer"}}>&#10005;</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {["draw","type"].map(m=><Btn key={m} variant={mode===m?"primary":"ghost"} onClick={()=>setMode(m)}>{m==="draw"?"Draw":"Type"}</Btn>)}
        </div>
        {mode==="draw" ? (
          <>
            <div style={{background:"#fff",borderRadius:8,border:"1px solid #E8E0D0",marginBottom:10,overflow:"hidden"}}>
              <canvas ref={canvasRef} width={440} height={150} style={{display:"block",width:"100%",touchAction:"none",cursor:"crosshair"}}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontSize:11,color:"#6B6880"}}>Draw your signature above</span>
              <Btn variant="ghost" onClick={clear} style={{padding:"4px 10px",fontSize:11}}>Clear</Btn>
            </div>
          </>
        ) : (
          <div style={{marginBottom:16}}>
            <input aria-label="Type your name" value={typed} onChange={e=>setTyped(e.target.value)} placeholder="Type your name"
              style={{width:"100%",background:"#fff",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:28,fontFamily:"'Brush Script MT',cursive",color:"#FFFFFF",outline:"none",boxSizing:"border-box"}} />
            {typed && <div style={{background:"#fff",borderRadius:8,border:"1px solid #E8E0D0",padding:"10px 16px",marginTop:8}}><div style={{fontFamily:"'Brush Script MT',cursive",fontSize:32,color:"#FFFFFF"}}>{typed}</div></div>}
          </div>
        )}
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={save}>Apply signature</Btn>
          <Btn variant="ghost" onClick={onClose}>Skip</Btn>
        </div>
      </Card>
    </div>
  );
}
