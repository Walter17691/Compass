import { useState } from 'react';
import { SCREENS } from '../constants';
import { lsSet } from '../lib/storage';
import { Btn } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';

export function LetterScreen({ handleLetter, activeLetter, aiProcessing, letterOutput, letterHistory=[], restoreLetterVersion, editingLetter, setEditingLetter, setLetterOutput, signature, setShowSigPad, setSignature, caseInfo, triggerWithSig, pdfGenerating, saveMeetingToCase, setScreen }) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div>
      <div style={{borderBottom:"1px solid #E8E0D0"}}>
        <div style={{maxWidth:1440,margin:"0 auto",padding:"0 20px",display:"flex",gap:2}}>
          {[{id:"outcome",l:"Outcome letter"},{id:"invite",l:"Invitation"},{id:"appeal",l:"Appeal outcome"}].map(lt=>(
            <button key={lt.id} onClick={()=>handleLetter(lt.id)}
              style={{background:"none",border:"none",borderBottom:"2px solid",borderBottomColor:activeLetter===lt.id?"#7C5CFC":"transparent",padding:"12px 16px",fontSize:13,color:activeLetter===lt.id?"#FFFFFF":"#9B9098",fontWeight:activeLetter===lt.id?600:400}}>
              {lt.l}
            </button>
          ))}
        </div>
      </div>
      <div style={{maxWidth:900,margin:"28px auto",padding:"0 20px"}}>
        {aiProcessing&&!letterOutput&&<div style={{textAlign:"center",padding:50}}><span className="pu" style={{color:"#7C5CFC",fontSize:24}}>●</span><div style={{color:"#6B6375",marginTop:10}}>Drafting...</div></div>}
        {letterOutput&&(
          <>
            {/* Edit toggle */}
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
              <button onClick={()=>setEditingLetter(e=>!e)}
                style={{background:editingLetter?"#7C5CFC":"none",border:"1px solid",borderColor:editingLetter?"#7C5CFC":"#E8E0D0",borderRadius:5,padding:"4px 12px",fontSize:11,color:editingLetter?"#fff":"#888",cursor:"pointer"}}>
                {editingLetter?"Done editing":"Edit letter"}
              </button>
            </div>
            {editingLetter&&(
              <textarea value={letterOutput} onChange={e=>setLetterOutput(e.target.value)}
                style={{width:"100%",minHeight:400,background:"#FDFAF5",border:"1px solid #7C5CFC33",borderRadius:8,padding:"16px",fontSize:13,lineHeight:1.8,outline:"none",color:"#1A1535",resize:"vertical",boxSizing:"border-box",fontFamily:"DM Serif Display,Georgia,serif",marginBottom:12}}/>
            )}
            {/* Sig bar */}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"#6B6375"}}>E-signature:</span>
                {signature
                  ?<span style={{fontSize:11,color:"#7C5CFC",fontWeight:600}}>✓ {signature.type==="typed"?`"${signature.data}"`:"Drawn"}</span>
                  :<span style={{fontSize:11,color:"#6B6880"}}>Not added — will prompt on send</span>}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setShowSigPad(true)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>{signature?"Change":"Add"}</button>
                {signature&&<button onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button>}
              </div>
            </div>

            <div className="print-area" style={{background:"#FDFAF5",borderRadius:12,padding:"36px 44px",marginBottom:16,textAlign:"left"}}>
              <MDRenderer text={letterOutput} light/>
              {signature&&(
                <div style={{marginTop:20,paddingTop:18,borderTop:"1px solid #E0DDD8"}}>
                  <div style={{fontSize:10,color:"#999",marginBottom:6}}>Signed:</div>
                  {signature.type==="typed"
                    ?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:30,color:"#FFFFFF"}}>{signature.data}</div>
                    :<img src={signature.data} alt="Sig" style={{maxHeight:55,maxWidth:180}}/>}
                  <div style={{fontSize:11,color:"#6B6375",marginTop:5}}>{caseInfo.manager||"HR Manager"} | {new Date().toLocaleDateString("en-GB")}</div>
                </div>
              )}
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn onClick={()=>triggerWithSig("download")} disabled={pdfGenerating}>{pdfGenerating?"Generating...":"Download PDF"}</Btn>
              <Btn variant="secondary" onClick={()=>triggerWithSig("gmail")} disabled={pdfGenerating}>Send via Gmail</Btn>
              <Btn variant="secondary" onClick={()=>triggerWithSig("outlook")} disabled={pdfGenerating}>Send via Outlook</Btn>
              <Btn variant="ghost" onClick={()=>window.print()}>Print</Btn>
              <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(letterOutput)}>Copy text</Btn>
              <Btn variant="blue" onClick={()=>{saveMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case</Btn>
              <Btn variant="ghost" onClick={()=>setScreen(SCREENS.REVIEW)}>← Back</Btn>
            </div>

            {letterHistory.length>0&&(
              <div style={{marginTop:20}}>
                <button onClick={()=>setShowHistory(v=>!v)} style={{background:"none",border:"none",color:"#9B9098",fontSize:12,cursor:"pointer",padding:0}}>
                  {showHistory?"▾":"▸"} Previous versions ({letterHistory.length})
                </button>
                {showHistory&&(
                  <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                    {letterHistory.map((v,i)=>(
                      <div key={i} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                        <div style={{fontSize:11,color:"#6B6375",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {new Date(v.ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} — {v.text.slice(0,80)}...
                        </div>
                        <Btn variant="ghost" onClick={()=>restoreLetterVersion(v)} style={{flexShrink:0,padding:"4px 12px",fontSize:11}}>Restore</Btn>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
