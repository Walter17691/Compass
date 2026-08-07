import { SCREENS } from '../constants';
import { Btn } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';

export function ReviewScreen({ caseInfo, meetingType, isHR, cases, requestHrReview, reviewOutput, reviewOutputOriginal, confirmDialog, setShowShareModal, saveMeetingToCase, setScreen, showToast, askCompassInput, setAskCompassInput, askCompassHistory, setAskCompassHistory, askCompass, setAskCompassProcessing, askCompassProcessing, editProcessing, editRecord, editingRecord, setEditingRecord, aiProcessing, aiError, setReviewOutput, setShowSignModal, riskScore }) {
  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

      {/* Top action bar — sits below the shared AppHeader; not a second
          header since it carries screen-specific actions (Save to case,
          Share, Request HR review) that AppHeader has no equivalent for. */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"14px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:53,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div>
            <span style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{caseInfo.employee}</span>
            <span style={{fontSize:13,color:"#9B9098",margin:"0 6px"}}>—</span>
            <span style={{fontSize:13,color:"#6B6375"}}>{meetingType?.label}</span>
            <span style={{fontSize:12,color:"#9B9098",marginLeft:8}}>{caseInfo.date}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {!isHR&&(
            <Btn onClick={()=>{
              const cs=cases.find(x=>x.employeeName===caseInfo.employee?.trim());
              requestHrReview("record",cs?.id||null,null,reviewOutput);
            }} variant="ghost" style={{fontSize:13}}>Request HR review</Btn>
          )}
          <Btn onClick={()=>setShowShareModal(true)} variant="ghost" style={{fontSize:13}}>Share</Btn>
          <Btn onClick={()=>{saveMeetingToCase();setScreen(SCREENS.CASES);showToast("Saved to case file");}} variant="secondary" style={{fontSize:13}}>Save to case</Btn>

<Btn onClick={()=>saveMeetingToCase()} style={{fontSize:13,background:"#7C5CFC",borderColor:"#7C5CFC",boxShadow:"0 2px 8px rgba(124,92,252,0.25)"}}>
            {caseInfo._linkedCaseId?"Save witness statement to case →":"Save and go to case →"}
          </Btn>
        </div>
      </div>

      {/* Main layout */}
      <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 24px",display:"grid",gridTemplateColumns:"1fr 340px",gap:24,alignItems:"start"}}>

        {/* Left — record */}
        <div>
          {/* Ask Compass / Edit bar */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input value={askCompassInput} onChange={e=>setAskCompassInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"){const q=askCompassInput;setAskCompassInput("");askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}}
              placeholder='Ask Compass or edit the record... e.g. "What should I do next?" or "Make section 2 more formal"'
              style={{flex:1,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#1A1535",outline:"none",fontFamily:"DM Sans,system-ui,sans-serif"}}
              onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.08)";}}
              onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="none";}}/>
            <button onClick={()=>{
                const q=askCompassInput;
                setAskCompassInput("");
                if(q.toLowerCase().includes("edit")||q.toLowerCase().includes("change")||q.toLowerCase().includes("make")||q.toLowerCase().includes("add")||q.toLowerCase().includes("remove")){
                  editRecord(q);
                } else {
                  askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);
                }
              }} disabled={(askCompassProcessing||editProcessing)||!askCompassInput.trim()}
              style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,color:"#fff",cursor:"pointer",fontWeight:500,opacity:(askCompassProcessing||editProcessing)||!askCompassInput.trim()?0.4:1,whiteSpace:"nowrap",fontFamily:"DM Sans,system-ui,sans-serif"}}>
              {askCompassProcessing||editProcessing?"Working...":"Ask →"}
            </button>
          </div>



          {/* Meeting record card */}
          <div className="print-area" style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,boxShadow:"0 1px 3px rgba(26,21,53,0.06)",overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"12px 20px",borderBottom:"1px solid #EDE5D8",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FDFAF5"}}>
              <span style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.8px",textTransform:"uppercase"}}>Meeting record</span>
              <div style={{display:"flex",gap:14,alignItems:"center"}}>
                {reviewOutputOriginal&&reviewOutput!==reviewOutputOriginal&&(
                  <button onClick={async()=>{
                    const ok = await confirmDialog({title:"Restore original AI draft", message:"This replaces your edits with the record as Compass first generated it. This can't be undone.", confirmLabel:"Restore", danger:true});
                    if(ok) setReviewOutput(reviewOutputOriginal);
                  }} style={{fontSize:11,color:"#B87520",background:"none",border:"none",cursor:"pointer",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>Restore original</button>
                )}
                <button onClick={()=>window.print()} style={{fontSize:11,color:"#6B6375",background:"none",border:"none",cursor:"pointer",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>Print</button>
                <button onClick={()=>setEditingRecord(r=>!r)}
                  style={{fontSize:11,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  {editingRecord?"Done editing":"Edit record"}
                </button>
              </div>
            </div>
            <div style={{padding:"28px 32px"}}>
              {aiProcessing&&!reviewOutput&&(
                <div style={{textAlign:"center",padding:"48px 0",color:"#9B9098",fontSize:14}}>
                  <div className="pu" style={{width:8,height:8,borderRadius:"50%",background:"#7C5CFC",display:"inline-block",marginBottom:12}}></div>
                  <div>Compass is generating your record...</div>
                </div>
              )}
              {reviewOutput&&!editingRecord&&(()=>{
                const advisorStart = reviewOutput.indexOf("## HR Advisor");
                let meetingPart = advisorStart > -1 ? reviewOutput.slice(0, advisorStart) : reviewOutput;
                const extraSections = ["## Key Points","## Next Steps","## Summary","## Actions","## Risk","## Outcome","## Recommendations","## Notes"];
                extraSections.forEach(s=>{ const si=meetingPart.indexOf(s); if(si>-1) meetingPart=meetingPart.slice(0,si); });
                return <div style={{fontSize:14,lineHeight:1.9,color:"#1A1535"}}><MDRenderer text={meetingPart.trim()}/></div>;
              })()}
              {reviewOutput&&editingRecord&&(
                <textarea value={reviewOutput} onChange={e=>setReviewOutput(e.target.value)}
                  style={{width:"100%",minHeight:400,background:"none",border:"none",outline:"none",fontSize:14,lineHeight:1.9,color:"#1A1535",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box"}}/>
              )}
              {aiError&&<div style={{color:"#C84B2F",fontSize:13}}>{aiError}</div>}
            </div>
            {reviewOutput&&!editingRecord&&(
              <div style={{padding:"16px 28px",borderTop:"1px solid #EDE5D8",background:"#FDFAF5"}}>
                <button onClick={()=>setShowSignModal(true)}
                  style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"11px 24px",fontSize:13,color:"#FFFFFF",fontWeight:600,cursor:"pointer",boxShadow:"0 2px 8px rgba(124,92,252,0.2)",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  Send for signature →
                </button>
                <span style={{fontSize:12,color:"#9B9098",marginLeft:12}}>Send the meeting record to the employee for signature</span>
              </div>
            )}
          </div>

          {/* HR Advisor Notes — separate card */}
          {reviewOutput&&reviewOutput.includes("## HR Advisor")&&(
            <div style={{background:"#F5F3FF",border:"1px solid #D4C9F5",borderRadius:12,overflow:"hidden",marginBottom:16}}>
              <div style={{padding:"12px 20px",borderBottom:"1px solid #D4C9F5",background:"#EDE8FF"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase"}}>Compass HR Advisor</div>
                <div style={{fontSize:11,color:"#8B7FCC",marginTop:2}}>Expert guidance based on UK employment law and ACAS</div>
              </div>
              <div style={{padding:"24px 28px"}}>
                <div style={{fontSize:14,lineHeight:1.9,color:"#2D2060"}}>
                  <MDRenderer text={reviewOutput.slice(reviewOutput.indexOf("## HR Advisor"))}/>
                </div>
              </div>
            </div>
          )}

          {/* Ask Compass response — inline below input */}
          {askCompassHistory.length>0&&(
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden",marginBottom:16}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid #EDE5D8",background:"#FDFAF5"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase"}}>Compass response</div>
              </div>
              <div style={{padding:"16px 20px"}}>
                {askCompassHistory.slice(-2).map((m,i)=>(
                  <div key={i} style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:600,color:m.role==="user"?"#9B9098":"#7C5CFC",marginBottom:4}}>{m.role==="user"?"Your question":"Compass"}</div>
                    <div style={{fontSize:14,color:m.role==="user"?"#6B6375":"#1A1535",lineHeight:1.8,background:m.role==="assistant"?"#F5F3FF":"none",padding:m.role==="assistant"?"12px 16px":"0",borderRadius:8,borderLeft:m.role==="assistant"?"3px solid #7C5CFC":"none"}}><MDRenderer text={m.content}/></div>
                  </div>
                ))}
                {askCompassProcessing&&<div style={{fontSize:13,color:"#9B9098",fontStyle:"italic"}}>Compass is thinking...</div>}
              </div>
            </div>
          )}


        </div>

        {/* Right sidebar */}
        <div style={{display:"flex",flexDirection:"column",gap:16,position:"sticky",top:80}}>

          {/* Risk score */}
          {riskScore&&(
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(26,21,53,0.06)"}}>
              <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:12}}>Risk assessment</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:riskScore.rating==="HIGH"?"#C84B2F":riskScore.rating==="MEDIUM"?"#B87520":"#1A7A4A",flexShrink:0}}></div>
                <span style={{fontSize:18,fontWeight:700,color:riskScore.rating==="HIGH"?"#C84B2F":riskScore.rating==="MEDIUM"?"#B87520":"#1A7A4A",fontFamily:"DM Serif Display,Georgia,serif"}}>{riskScore.rating}</span>
                <span style={{fontSize:12,color:"#9B9098"}}>tribunal risk</span>
              </div>
              {riskScore.summary&&<div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}><MDRenderer text={riskScore.summary}/></div>}
              {riskScore.historyContext&&(
                <div style={{marginTop:12,padding:"10px 12px",background:"#F5F3FF",borderRadius:8,borderLeft:"2px solid #7C5CFC"}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#7C5CFC",letterSpacing:0.5,textTransform:"uppercase",marginBottom:4}}>Informed by this organisation's history</div>
                  <div style={{fontSize:12,color:"#3D3560",lineHeight:1.6}}>{riskScore.historyContext}</div>
                </div>
              )}
            </div>
          )}



        </div>
      </div>
    </div>
  );
}
