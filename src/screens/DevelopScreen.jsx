import { SCREENS, DEV_TEMPLATES } from '../constants';
import { Btn, Card } from '../components/Primitives';
import { DateInput } from '../components/DateInput';
import { MDRenderer } from '../components/MDRenderer';
import { CheckIcon, CrossIcon } from '../components/Icons';

export function DevelopScreen({ devSession, setDevSession, devStep, setDevStep, devAiProcessing, generateSmartObjectives, generateDevSummary, devSummary, saveDevMeetingToCase, setScreen, generateDevLetter, devLetter }) {
  const s = devSession;
  const cfg = s.config;
  const isAppraisal = s.type==="Appraisal";
  const stepLabels = { self:"Employee self-assessment", manager:"Manager assessment", summary:"Review & summary", output:"Outcome document" };

  return(
    <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 20px"}}>
      {/* Step indicator */}
      <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:28}}>
        {Object.entries(stepLabels).map(([k,l],i,arr)=>(
          <div key={k} style={{display:"flex",alignItems:"center",flex:1}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}>
              <div style={{width:28,height:28,borderRadius:"50%",border:"2px solid",
                borderColor:devStep===k?"#7C5CFC":["self","manager","summary","output"].indexOf(devStep)>i?"#7C5CFC44":"#E8E0D0",
                background:devStep===k?"#7C5CFC22":"none",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}>
                {["self","manager","summary","output"].indexOf(devStep)>i
                  ?<CheckIcon size={14} color="#7C5CFC" />
                  :<span style={{fontSize:11,color:devStep===k?"#7C5CFC":"#555",fontWeight:600}}>{i+1}</span>}
              </div>
              <div style={{fontSize:10,color:devStep===k?"#7C5CFC":"#444",fontWeight:devStep===k?600:400,textAlign:"center"}}>{l}</div>
            </div>
            {i<arr.length-1&&<div style={{width:40,height:1,background:"#F5F1EA",flexShrink:0}}/>}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Case info + Employee self-assessment ── */}
      {devStep==="self"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <Card>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600,marginBottom:4}}>{s.type}</div>
            <p style={{fontSize:12,color:"#6B6880",margin:"0 0 18px"}}>Fill in the employee details, then the employee completes their self-assessment.</p>
            {[
              {k:"employee",l:"Employee name",req:true,ph:"e.g. Sarah Johnson"},
              {k:"role",l:"Job title",ph:"e.g. Marketing Manager"},
              {k:"department",l:"Department",ph:"e.g. Marketing"},
              {k:"email",l:"Employee email",ph:"sarah@company.com",type:"email"},
              {k:"manager",l:"Manager name",ph:"Your name"},
              {k:"date",l:"Meeting date",type:"date"},
              {k:"reviewPeriod",l:"Review period",ph:"e.g. Jan – Dec 2024"},
            ].map(f=>(
              <div key={f.k} style={{marginBottom:12}}>
                <label htmlFor={`dev-case-info-${f.k}`} style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>{f.l}{f.req&&<span style={{color:"#C84B2F"}}> *</span>}</label>
                {f.type==="date"
                  ?<DateInput id={`dev-case-info-${f.k}`} value={s.caseInfo[f.k]||""} onChange={e=>setDevSession(ds=>({...ds,caseInfo:{...ds.caseInfo,[f.k]:e.target.value}}))} />
                  :<input id={`dev-case-info-${f.k}`} type={f.type||"text"} placeholder={f.ph} value={s.caseInfo[f.k]||""} onChange={e=>setDevSession(ds=>({...ds,caseInfo:{...ds.caseInfo,[f.k]:e.target.value}}))}
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535"}} />}
              </div>
            ))}
          </Card>

          <Card>
            <div style={{fontSize:12,fontWeight:600,color:"#7C5CFC",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Employee self-assessment</div>
            <p style={{fontSize:11,color:"#6B6880",margin:"0 0 16px",lineHeight:1.6}}>The employee fills this in before the meeting. Their answers will sit alongside the manager assessment.</p>
            {cfg?.selfAssessmentPrompts?.map((q,i)=>(
              <div key={i} style={{marginBottom:14}}>
                <label htmlFor={`dev-self-assessment-${i}`} style={{display:"block",fontSize:12,color:"#3D3560",marginBottom:5,lineHeight:1.5}}>{i+1}. {q}</label>
                <textarea id={`dev-self-assessment-${i}`} value={s.selfAssessment[i]||""} onChange={e=>setDevSession(ds=>({...ds,selfAssessment:{...ds.selfAssessment,[i]:e.target.value}}))}
                  placeholder="Employee answer..." rows={2}
                  style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#1A1535"}} ></textarea>
              </div>
            ))}
            <Btn onClick={()=>setDevStep("manager")} disabled={!s.caseInfo.employee.trim()} style={{marginTop:4,background:"#7C5CFC",border:"none"}}>
              Continue to manager assessment →
            </Btn>
          </Card>
        </div>
      )}

      {/* ── STEP 2: Manager assessment + Objectives ── */}
      {devStep==="manager"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <Card>
            <div style={{fontSize:12,fontWeight:600,color:"#7C5CFC",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Manager assessment</div>
            <p style={{fontSize:11,color:"#6B6880",margin:"0 0 16px",lineHeight:1.6}}>Complete your assessment of {s.caseInfo.employee||"the employee"}. Be specific and evidence-based.</p>

            {isAppraisal&&(
              <div style={{marginBottom:16}}>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Overall rating</label>
                <div style={{display:"flex",gap:8}}>
                  {["1","2","3","4","5"].map(r=>(
                    <button key={r} onClick={()=>setDevSession(ds=>({...ds,rating:r}))}
                      style={{flex:1,padding:"8px 4px",borderRadius:6,border:"1px solid",borderColor:s.rating===r?"#7C5CFC":"#E8E0D0",
                        background:s.rating===r?"#7C5CFC22":"#FDFAF5",color:s.rating===r?"#A98FFF":"#555",fontSize:13,fontWeight:s.rating===r?700:400,cursor:"pointer"}}>
                      {r}
                    </button>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#5A5570",marginTop:6}}>1=Below expectations · 3=Meets · 5=Outstanding</div>
              </div>
            )}

            {cfg?.managerPrompts?.map((q,i)=>(
              <div key={i} style={{marginBottom:14}}>
                <label htmlFor={`dev-manager-assessment-${i}`} style={{display:"block",fontSize:12,color:"#3D3560",marginBottom:5,lineHeight:1.5}}>{i+1}. {q}</label>
                <textarea id={`dev-manager-assessment-${i}`} value={s.managerAssessment[i]||""} onChange={e=>setDevSession(ds=>({...ds,managerAssessment:{...ds.managerAssessment,[i]:e.target.value}}))}
                  placeholder="Your assessment..." rows={2}
                  style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#1A1535"}} ></textarea>
              </div>
            ))}

            <div style={{marginBottom:14}}>
              <label htmlFor="dev-outcome" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Agreed outcome</label>
              <select id="dev-outcome" value={s.outcome} onChange={e=>setDevSession(ds=>({...ds,outcome:e.target.value}))}
                style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
                <option value="">Select outcome...</option>
                {cfg?.outcomeOptions?.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div style={{marginBottom:16}}>
              <label htmlFor="dev-plan" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Development plan / actions</label>
              <textarea id="dev-plan" value={s.devPlan||""} onChange={e=>setDevSession(ds=>({...ds,devPlan:e.target.value}))}
                placeholder="Training agreed, coaching, support, resources..." rows={3}
                style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#1A1535"}} ></textarea>
            </div>

            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>setDevStep("summary")} style={{background:"#7C5CFC",border:"none"}}>Continue →</Btn>
              <Btn variant="ghost" onClick={()=>setDevStep("self")}>← Back</Btn>
            </div>
          </Card>

          {/* Objectives panel */}
          <Card style={{background:"#F5F1EA"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:600,color:"#7C5CFC",textTransform:"uppercase",letterSpacing:0.5}}>Objectives &amp; ratings</div>
              <Btn onClick={()=>generateSmartObjectives(s.caseInfo.reviewPeriod)} disabled={devAiProcessing} style={{padding:"4px 12px",fontSize:11,background:"#7C5CFC",border:"none"}}>
                {devAiProcessing?"...":"AI suggest"}
              </Btn>
            </div>
            {s.objectives.map((obj,i)=>(
              <div key={i} style={{background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:2}}>{obj.label}</div>
                    {obj.desc&&<div style={{fontSize:11,color:"#6B6880"}}>{obj.desc}</div>}
                    {obj.measure&&<div style={{fontSize:10,color:"#5A5570",marginTop:2}}>Measure: {obj.measure}</div>}
                  </div>
                  <button onClick={()=>setDevSession(ds=>({...ds,objectives:ds.objectives.filter((_,j)=>j!==i)}))}
                    aria-label="Remove" style={{background:"none",border:"none",color:"#6B6880",cursor:"pointer",marginLeft:8,display:"flex",alignItems:"center"}}><CrossIcon size={13} /></button>
                </div>
                {/* Rating */}
                <div style={{display:"flex",gap:4,marginBottom:8}}>
                  {[1,2,3,4,5].map(r=>(
                    <button key={r} onClick={()=>setDevSession(ds=>({...ds,objectives:ds.objectives.map((x,j)=>j===i?{...x,rating:r}:x)}))}
                      style={{width:28,height:28,borderRadius:4,border:"1px solid",borderColor:obj.rating>=r?"#7C5CFC":"#E8E0D0",background:obj.rating>=r?"#7C5CFC22":"none",color:obj.rating>=r?"#7C5CFC":"#555",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                      {r}
                    </button>
                  ))}
                  <span style={{fontSize:10,color:"#5A5570",lineHeight:"28px",marginLeft:6}}>{["","Below","Developing","Meeting","Exceeding","Exceptional"][obj.rating]}</span>
                </div>
                <input aria-label={`Notes on progress for ${obj.label}`} value={obj.note||""} onChange={e=>setDevSession(ds=>({...ds,objectives:ds.objectives.map((x,j)=>j===i?{...x,note:e.target.value}:x)}))}
                  placeholder="Notes on progress..."
                  style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"6px 10px",fontSize:11,outline:"none",color:"#1A1535"}} />
              </div>
            ))}
            <button onClick={()=>setDevSession(ds=>({...ds,objectives:[...ds.objectives,{label:"New objective",desc:"",rating:3,note:""}]}))}
              style={{width:"100%",background:"none",border:"1px dashed #E8E0D0",borderRadius:7,padding:"9px",fontSize:12,color:"#6B6880",cursor:"pointer"}}>
              + Add objective
            </button>

            {/* Self-assessment reference */}
            {Object.keys(s.selfAssessment).length>0&&(
              <details style={{marginTop:14}}>
                <summary style={{fontSize:11,color:"#7C5CFC",cursor:"pointer",fontWeight:600}}>View employee self-assessment</summary>
                <div style={{marginTop:10}}>
                  {cfg?.selfAssessmentPrompts?.map((q,i)=>s.selfAssessment[i]?(
                    <div key={i} style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:"#6B6880",marginBottom:3}}>{q}</div>
                      <div style={{fontSize:12,color:"#3D3560",background:"#FDFAF5",borderRadius:5,padding:"7px 10px"}}>{s.selfAssessment[i]}</div>
                    </div>
                  ):null)}
                </div>
              </details>
            )}
          </Card>
        </div>
      )}

      {/* ── STEP 3: Summary ── */}
      {devStep==="summary"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:20}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>{s.type} — Summary</div>
              <Btn onClick={generateDevSummary} disabled={devAiProcessing} style={{background:"#7C5CFC",border:"none",padding:"7px 16px",fontSize:12}}>
                {devAiProcessing?"Generating...":"Generate AI summary"}
              </Btn>
            </div>
            {devAiProcessing&&!devSummary&&<div style={{textAlign:"center",padding:32}}><span className="pu" style={{color:"#7C5CFC",fontSize:22}}>●</span><div style={{color:"#6B6880",marginTop:10,fontSize:12}}>Building your summary...</div></div>}
            {devSummary&&<MDRenderer text={devSummary}/>}
            {!devSummary&&!devAiProcessing&&(
              <div style={{background:"#FDFAF5",borderRadius:8,padding:20,textAlign:"center"}}>
                <div style={{fontSize:13,color:"#6B6880",marginBottom:6}}>Click "Generate AI summary" to produce a structured meeting record</div>
                <div style={{fontSize:11,color:"#5A5570"}}>Combines self-assessment, manager feedback, and objectives into a professional document</div>
              </div>
            )}
            <div style={{display:"flex",gap:8,marginTop:20,flexWrap:"wrap"}}>
              {devSummary&&<Btn onClick={()=>setDevStep("output")} style={{background:"#7C5CFC",border:"none"}}>Generate outcome letter →</Btn>}
              <Btn style={{background:"#7C5CFC",borderColor:"#7C5CFC"}} onClick={()=>{saveDevMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case file</Btn>
              <Btn variant="ghost" onClick={()=>setDevStep("manager")}>← Back</Btn>
            </div>
          </Card>

          {/* Side panel: combined view */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card style={{background:"#F5F1EA"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:12}}>OBJECTIVES SUMMARY</div>
              {s.objectives.map((obj,i)=>{
                const rColors=["","#7C5CFC","#7C5CFC","#7C5CFC","#7C5CFC","#7C5CFC"]; const _ignore=["","#E8622A","#D4882A","#888","#7C5CFC","#7C5CFC"];
                return(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #1a1a1a"}}>
                    <span style={{fontSize:12,color:"#3D3560"}}>{obj.label}</span>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {[1,2,3,4,5].map(r=><div key={r} style={{width:8,height:8,borderRadius:"50%",background:obj.rating>=r?rColors[obj.rating]:"#E8E0D0"}}/>)}
                      <span style={{fontSize:10,color:rColors[obj.rating],marginLeft:4,fontWeight:600}}>{obj.rating}/5</span>
                    </div>
                  </div>
                );
              })}
            </Card>
            <Card style={{background:"#F5F1EA"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:10}}>OUTCOME</div>
              <div style={{fontSize:13,color:s.outcome?"#1C1820":"#9B9098"}}>{s.outcome||"Not set"}</div>
              {s.rating&&<div style={{fontSize:12,color:"#7C5CFC",marginTop:6}}>Rating: {s.rating}/5</div>}
            </Card>
          </div>
        </div>
      )}

      {/* ── STEP 4: Output letter ── */}
      {devStep==="output"&&(
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>Outcome document</div>
            <Btn onClick={generateDevLetter} disabled={devAiProcessing} style={{background:"#7C5CFC",border:"none"}}>
              {devAiProcessing?"Generating...":"Generate letter"}
            </Btn>
          </div>

          {devAiProcessing&&!devLetter&&<div style={{textAlign:"center",padding:40}}><span className="pu" style={{color:"#7C5CFC",fontSize:22}}>●</span></div>}
          {devLetter&&(
            <>
              <div style={{background:"#FDFAF5",borderRadius:12,padding:"36px 44px",marginBottom:16,textAlign:"left"}}>
                <MDRenderer text={devLetter} light/>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn onClick={()=>navigator.clipboard.writeText(devLetter)} style={{background:"#7C5CFC",border:"none"}}>Copy letter</Btn>
                <Btn variant="blue" onClick={()=>{saveDevMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case</Btn>
                <Btn variant="ghost" onClick={()=>setDevStep("summary")}>← Back</Btn>
              </div>
            </>
          )}
          {!devLetter&&!devAiProcessing&&(
            <Card style={{textAlign:"center",padding:"32px"}}>
              <div style={{fontSize:13,color:"#6B6880",marginBottom:8}}>Click "Generate letter" to draft the outcome document</div>
              <div style={{fontSize:11,color:"#5A5570"}}>Available: {Object.values(DEV_TEMPLATES.filter(t=>t.cat.toLowerCase().includes(s.type.split(" ")[0].toLowerCase()))).map(t=>t.name).join(", ")||"outcome letter"}</div>
            </Card>
          )}

          {/* Template alternatives */}
          <div style={{marginTop:20}}>
            <div style={{fontSize:10,color:"#5A5570",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Or use a template</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
              {DEV_TEMPLATES.map(t=>(
                <button key={t.id} onClick={()=>{navigator.clipboard.writeText(t.body);}}
                  style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 14px",textAlign:"left",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                  <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,marginBottom:3}}>{t.cat}</div>
                  <div style={{fontSize:12,color:"#1A1535"}}>{t.name}</div>
                  <div style={{fontSize:10,color:"#6B6880",marginTop:3}}>Click to copy →</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
