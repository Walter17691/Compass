import { Badge, Btn, Card, SectionTitle } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { CheckIcon, CrossIcon } from '../components/Icons';
import { PageHeader } from '../components/design/PageHeader';

export function RedundancyScreen({ activeRedundancy, setActiveRedundancy, redundancyStep, setRedundancyStep, redundancyAiOutput, setRedundancyAiOutput, redundancyCases, createRedundancyCase, updateRedundancyCase, scoreEmployee, generateRedundancyLetter, isMobile, getRedundancyAiAdvice, redundancyAiProcessing, promptDialog }) {
  const stepLabels = {setup:"Setup",pool:"Selection",consultation:"Consultation",outcome:"Outcome"};
  const steps = ["setup","pool","consultation","outcome"];

  return(
    <div style={{maxWidth:1280,margin:"0 auto",padding:"32px 20px"}}>
      {/* Design System Convergence pass, Phase 2 — was a purple serif h2;
          Redundancy is a process/administrative screen, not an editorial
          moment. */}
      <PageHeader title="Redundancy & consultation" subtitle="Individual and collective redundancy processes. Legally guided, document-ready."
        actions={activeRedundancy&&<Btn variant="ghost" onClick={()=>{setActiveRedundancy(null);setRedundancyStep("setup");setRedundancyAiOutput("");}}>← All cases</Btn>}/>

      {/* Case list */}
      {!activeRedundancy&&(
        <div>
          {redundancyCases.length===0&&(
            <Card style={{textAlign:"center",padding:"40px 20px",marginBottom:20}}>
              <div style={{fontSize:15,color:"#6B6880",marginBottom:6}}>No redundancy cases</div>
              <div style={{fontSize:12,color:"#5A5570",marginBottom:20}}>Start a new individual or collective redundancy process.</div>
            </Card>
          )}
          {redundancyCases.map(r=>(
            <button key={r.id} onClick={()=>{setActiveRedundancy(r);setRedundancyStep(r.status||"pool");setRedundancyAiOutput("");}}
              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"16px 20px",textAlign:"left",marginBottom:10,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"border-color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:15,color:"#1A1535",fontWeight:600}}>{r.reason}</span>
                  <Badge color={r.type==="collective"?"#E8622A":"#7C5CFC"}>{r.type}</Badge>
                </div>
                <div style={{fontSize:11,color:"#6B6880"}}>{r.atRiskEmployees.length} at-risk · Created {new Date(r.createdAt).toLocaleDateString("en-GB")} · {r.createdBy}</div>
              </div>
              <Badge color={r.status==="complete"?"#7C5CFC":"#D4882A"}>{r.status||"setup"}</Badge>
            </button>
          ))}

          {/* New case form */}
          <Card>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 14px",fontWeight:600}}>Start new redundancy process</h3>
            <fieldset style={{marginBottom:14,border:"none",padding:0}}>
              <legend style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:6,padding:0}}>Process type</legend>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {type:"individual",title:"Individual redundancy",sub:"Fewer than 20 redundancies · No minimum consultation period · ACAS Early Conciliation recommended"},
                  {type:"collective",title:"Collective redundancy",sub:"20+ redundancies · 30 days (20-99) or 45 days (100+) consultation · HR1 form required · Employee representatives"},
                ].map(opt=>(
                  <button key={opt.type} onClick={async ()=>{
                    const values = await promptDialog({
                      title:`Start ${opt.title.toLowerCase()}`,
                      fields:[
                        {key:"reason", label:"Reason for redundancy", placeholder:"e.g. restructure, site closure, role no longer required", required:true},
                        {key:"pool", label:"Selection pool", placeholder:"e.g. all Marketing Executives, all staff in Leeds office"},
                      ],
                      confirmLabel:"Start process",
                    });
                    if(!values) return;
                    createRedundancyCase(opt.type, values.reason, values.pool||"Not specified");
                  }}
                    style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"16px",textAlign:"left",cursor:"pointer",transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:6}}>{opt.title}</div>
                    <div style={{fontSize:11,color:"#6B6880",lineHeight:1.6}}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </fieldset>
          </Card>
        </div>
      )}

      {/* Active redundancy case */}
      {activeRedundancy&&(
        <div>
          {/* Step nav */}
          <div style={{display:"flex",gap:0,marginBottom:24,background:"#FFFFFF",borderRadius:8,overflow:"hidden",border:"1px solid #E8E0D0"}}>
            {steps.map((s,i)=>(
              <button key={s} onClick={()=>setRedundancyStep(s)}
                style={{flex:1,padding:"10px 8px",background:redundancyStep===s?"#7C5CFC18":"none",border:"none",borderRight:i<steps.length-1?"1px solid #E8E0D0":"none",color:redundancyStep===s?"#A98FFF":"#555",fontSize:12,fontWeight:redundancyStep===s?600:400,cursor:"pointer"}}>
                {stepLabels[s]}
              </button>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 380px",gap:20,alignItems:"start"}}>
            <div>
              {/* SETUP STEP */}
              {redundancyStep==="setup"&&(
                <Card>
                  <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Case details</h3>
                  <div style={{background:"#FDFAF5",borderRadius:8,padding:"14px 16px",marginBottom:16}}>
                    <div style={{fontSize:11,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:8}}>CASE SUMMARY</div>
                    <div style={{fontSize:14,color:"#1A1535",marginBottom:4}}><span style={{color:"#6B6880"}}>Type:</span> {activeRedundancy.type} redundancy</div>
                    <div style={{fontSize:14,color:"#1A1535",marginBottom:4}}><span style={{color:"#6B6880"}}>Reason:</span> {activeRedundancy.reason}</div>
                    <div style={{fontSize:14,color:"#1A1535",marginBottom:4}}><span style={{color:"#6B6880"}}>Pool:</span> {activeRedundancy.poolDescription}</div>
                    <div style={{fontSize:14,color:"#1A1535"}}><span style={{color:"#6B6880"}}>Created:</span> {new Date(activeRedundancy.createdAt).toLocaleDateString("en-GB")} by {activeRedundancy.createdBy}</div>
                  </div>

                  {activeRedundancy.type==="collective"&&(
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:11,color:"#C84B2F",fontWeight:700,letterSpacing:1,marginBottom:10}}>COLLECTIVE CONSULTATION REQUIREMENTS</div>
                      {[
                        {label:"Number of redundancies",k:"count",type:"number",ph:"e.g. 25"},
                        {label:"HR1 form submitted to BEIS",k:"hrOneSubmitted",type:"checkbox"},
                        {label:"Employee representatives elected",k:"repElected",type:"checkbox"},
                        {label:"Consultation start date",k:"consultationStartDate",type:"date"},
                      ].map(f=>(
                        <div key={f.k} style={{marginBottom:10}}>
                          <label htmlFor={`redundancy-collective-${f.k}`} style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>{f.label}</label>
                          {f.type==="checkbox"
                            ?<input id={`redundancy-collective-${f.k}`} type="checkbox" checked={activeRedundancy.collectiveInfo?.[f.k]||false}
                              onChange={e=>updateRedundancyCase({collectiveInfo:{...activeRedundancy.collectiveInfo,[f.k]:e.target.checked}})}
                              style={{accentColor:"#7C5CFC",width:16,height:16}} />
                            :<input id={`redundancy-collective-${f.k}`} type={f.type||"text"} placeholder={f.ph} value={activeRedundancy.collectiveInfo?.[f.k]||""}
                              onChange={e=>updateRedundancyCase({collectiveInfo:{...activeRedundancy.collectiveInfo,[f.k]:e.target.value}})}
                              style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none",width:"100%",boxSizing:"border-box"}} />}
                        </div>
                      ))}
                      <div style={{background:"#FEF0EB",borderRadius:7,padding:"10px 14px",border:"1px solid #E8622A33"}}>
                        <div style={{fontSize:11,color:"#C84B2F",fontWeight:600,marginBottom:3}}>Legal requirement</div>
                        <div style={{fontSize:11,color:"#6B6375",lineHeight:1.6}}>
                          {(activeRedundancy.collectiveInfo?.count||0)>=100?"45 days minimum consultation before any redundancy takes effect":"30 days minimum consultation before any redundancy takes effect"}
                          {" "}· HR1 form must be submitted to BEIS before consultation starts · Failure to consult is an automatic 90-day protective award per employee.
                        </div>
                      </div>
                    </div>
                  )}
                  <Btn onClick={()=>setRedundancyStep("pool")}>Continue to selection pool →</Btn>
                </Card>
              )}

              {/* POOL / SELECTION STEP */}
              {redundancyStep==="pool"&&(
                <div>
                  {/* Selection criteria */}
                  <Card style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:0,fontWeight:600}}>Selection criteria</h3>
                      <span style={{fontSize:11,color:Math.abs(activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)-100)<1?"#7C5CFC":"#E8622A",fontWeight:600,display:"inline-flex",alignItems:"center",gap:4}}>
                        Total: {activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)}% {Math.abs(activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)-100)>1?"(must equal 100%)":<CheckIcon size={11} />}
                      </span>
                    </div>
                    {activeRedundancy.selectionCriteria.map((c,idx)=>(
                      <div key={c.id} style={{background:"#FDFAF5",borderRadius:7,padding:"12px 14px",marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:8}}>
                          <input aria-label={`Criterion ${idx+1} name`} value={c.criterion} placeholder="Criterion name"
                            onChange={e=>updateRedundancyCase({selectionCriteria:activeRedundancy.selectionCriteria.map(x=>x.id===c.id?{...x,criterion:e.target.value}:x)})}
                            style={{flex:1,background:"none",border:"none",fontSize:14,color:"#1A1535",fontWeight:500,outline:"none",padding:"2px 0"}} />
                          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                            <input aria-label={`Criterion ${idx+1} weight percentage`} type="number" min="0" max="100" value={c.weight}
                              onChange={e=>updateRedundancyCase({selectionCriteria:activeRedundancy.selectionCriteria.map(x=>x.id===c.id?{...x,weight:parseInt(e.target.value)||0}:x)})}
                              style={{width:56,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 8px",fontSize:12,color:"#1A1535",outline:"none",textAlign:"center"}} />
                            <span style={{fontSize:11,color:"#6B6880"}}>%</span>
                            <button onClick={()=>updateRedundancyCase({selectionCriteria:activeRedundancy.selectionCriteria.filter(x=>x.id!==c.id)})}
                              aria-label="Remove criterion" style={{background:"none",border:"none",color:"#9B9098",cursor:"pointer",display:"flex",alignItems:"center",padding:2}}>
                              <CrossIcon size={12} />
                            </button>
                          </div>
                        </div>
                        <input aria-label={`Criterion ${idx+1} description`} value={c.description||""} placeholder="Description (what this measures, how it's assessed)"
                          onChange={e=>updateRedundancyCase({selectionCriteria:activeRedundancy.selectionCriteria.map(x=>x.id===c.id?{...x,description:e.target.value}:x)})}
                          style={{width:"100%",background:"none",border:"none",fontSize:11,color:"#6B6880",outline:"none",padding:"2px 0",boxSizing:"border-box"}} />
                      </div>
                    ))}
                    <Btn variant="ghost" style={{width:"100%",marginBottom:8}} onClick={async()=>{
                      const values = await promptDialog({
                        title:"Add selection criterion",
                        message:"Criteria must be objective, measurable, and relevant to the roles in this pool.",
                        fields:[
                          {key:"criterion", label:"Criterion name", placeholder:"e.g. Technical certification", required:true},
                          {key:"description", label:"Description", placeholder:"What this measures and how it's assessed"},
                          {key:"weight", label:"Weight %", placeholder:"e.g. 10", required:true},
                        ],
                        confirmLabel:"Add criterion",
                      });
                      if(!values) return;
                      const criterion = {id:"sc"+Date.now(), criterion:values.criterion, weight:parseInt(values.weight)||0, description:values.description||""};
                      updateRedundancyCase({selectionCriteria:[...activeRedundancy.selectionCriteria, criterion]});
                    }}>+ Add criterion</Btn>
                    <div style={{background:"#FDFAF5",borderRadius:7,padding:"10px 12px",border:"1px solid #E8E0D0",marginTop:8}}>
                      <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:4}}>LEGAL NOTE</div>
                      <div style={{fontSize:11,color:"#6B6880",lineHeight:1.6}}>Criteria must be objective and measurable. Avoid criteria that could be indirectly discriminatory (e.g. part-time working, recent maternity leave). Disability-related absences must be excluded from attendance scoring. Length of service can only be used as a tie-breaker, never the sole or primary criterion, to avoid age discrimination.</div>
                    </div>
                  </Card>

                  {/* At-risk employees */}
                  <Card>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:0,fontWeight:600}}>At-risk employees</h3>
                      <Btn onClick={async ()=>{
                        const values = await promptDialog({
                          title:"Add employee to selection pool",
                          fields:[
                            {key:"name", label:"Employee name", placeholder:"e.g. James Wilson", required:true},
                            {key:"role", label:"Job title", placeholder:"e.g. Marketing Executive"},
                            {key:"dept", label:"Department", placeholder:"e.g. Marketing"},
                          ],
                          confirmLabel:"Add employee",
                        });
                        if(!values) return;
                        const emp={id:Date.now().toString(),name:values.name,role:values.role||"",department:values.dept||"",scores:{},totalScore:0,selected:null,consultationMeetings:[],outcome:"",redundancyPay:""};
                        updateRedundancyCase({atRiskEmployees:[...activeRedundancy.atRiskEmployees,emp]});
                      }} style={{padding:"6px 14px",fontSize:12}}>+ Add employee</Btn>
                    </div>
                    {activeRedundancy.atRiskEmployees.length===0&&<div style={{fontSize:12,color:"#5A5570",padding:"20px 0",textAlign:"center"}}>No employees added yet — add all employees in the selection pool</div>}
                    {activeRedundancy.atRiskEmployees.map(emp=>(
                      <div key={emp.id} style={{background:"#FDFAF5",borderRadius:8,padding:"14px",marginBottom:10,border:"1px solid #E8E0D0"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                          <div>
                            <div style={{fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:2}}>{emp.name}</div>
                            <div style={{fontSize:11,color:"#6B6880"}}>{emp.role}{emp.department?" · "+emp.department:""}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{fontSize:18,fontWeight:700,color:"#7C5CFC",fontFamily:"DM Sans,system-ui,sans-serif"}}>{emp.totalScore||0}</div>
                            <div style={{fontSize:10,color:"#6B6880"}}>/ 5.0</div>
                            {emp.selected!==null&&<Badge color={emp.selected?"#E8622A":"#7C5CFC"}>{emp.selected?"At risk":"Retained"}</Badge>}
                          </div>
                        </div>
                        {/* Scoring grid */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8,marginBottom:10}}>
                          {activeRedundancy.selectionCriteria.map(c=>(
                            <div key={c.id} style={{background:"#FFFFFF",borderRadius:5,padding:"8px 10px"}}>
                              <div style={{fontSize:9,color:"#6B6880",marginBottom:5,fontWeight:600,letterSpacing:0.3}}>{c.criterion.slice(0,20)}</div>
                              <div style={{display:"flex",gap:3}}>
                                {[1,2,3,4,5].map(s=>(
                                  <button key={s} onClick={()=>scoreEmployee(emp.id,c.id,s)}
                                    style={{width:22,height:22,borderRadius:3,border:"1px solid",borderColor:(emp.scores?.[c.id]||0)>=s?"#7C5CFC":"#E8E0D0",background:(emp.scores?.[c.id]||0)>=s?"#7C5CFC22":"none",color:(emp.scores?.[c.id]||0)>=s?"#A98FFF":"#555",fontSize:10,cursor:"pointer"}}>
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(e=>e.id===emp.id?{...e,selected:true}:e)})}
                            style={{background:"#E8622A18",border:"1px solid #E8622A44",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>At risk</button>
                          <button onClick={()=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(e=>e.id===emp.id?{...e,selected:false}:e)})}
                            style={{background:"#7C5CFC18",border:"1px solid #7C5CFC33",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>Retained</button>
                          <button onClick={()=>generateRedundancyLetter("at-risk",emp)}
                            style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>At-risk letter</button>
                        </div>
                      </div>
                    ))}
                    {activeRedundancy.atRiskEmployees.length>0&&<Btn onClick={()=>setRedundancyStep("consultation")} style={{marginTop:8}}>Continue to consultation →</Btn>}
                  </Card>
                </div>
              )}

              {/* CONSULTATION STEP */}
              {redundancyStep==="consultation"&&(
                <Card>
                  <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Consultation meetings</h3>
                  <p style={{fontSize:12,color:"#6B6880",margin:"0 0 16px",lineHeight:1.6}}>
                    {activeRedundancy.type==="collective"
                      ?"Collective consultation must happen before individual consultation. Hold meaningful consultation — employees must be able to influence the outcome."
                      :"Individual consultation must be meaningful. Consider all representations made. Keep records of all meetings."}
                  </p>
                  {activeRedundancy.atRiskEmployees.filter(e=>e.selected).map(emp=>(
                    <div key={emp.id} style={{background:"#FDFAF5",borderRadius:8,padding:"14px",marginBottom:12,border:"1px solid #E8E0D0"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                        <div style={{fontSize:14,color:"#1A1535",fontWeight:600}}>{emp.name}</div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>generateRedundancyLetter("consultation-invite",emp)}
                            style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>Invite letter</button>
                          <button onClick={()=>generateRedundancyLetter("alternative-roles",emp)}
                            style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>Alt roles letter</button>
                        </div>
                      </div>
                      <div style={{fontSize:11,color:"#6B6880",marginBottom:8}}>{emp.consultationMeetings?.length||0} consultation meeting{(emp.consultationMeetings?.length||0)!==1?"s":""} recorded</div>
                      <textarea aria-label={`Consultation notes for ${emp.name}`} placeholder={`Notes from consultation with ${emp.name}...`}
                        value={emp.consultationNotes||""}
                        onChange={e=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(x=>x.id===emp.id?{...x,consultationNotes:e.target.value}:x)})}
                        rows={3}
                        style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",resize:"vertical",outline:"none",boxSizing:"border-box"}} ></textarea>
                    </div>
                  ))}
                  {activeRedundancy.atRiskEmployees.filter(e=>e.selected).length===0&&(
                    <div style={{fontSize:12,color:"#5A5570",textAlign:"center",padding:"20px 0"}}>No at-risk employees selected yet — go back to the Selection step</div>
                  )}
                  {activeRedundancy.atRiskEmployees.filter(e=>e.selected).length>0&&<Btn onClick={()=>setRedundancyStep("outcome")} style={{marginTop:8}}>Continue to outcome →</Btn>}
                </Card>
              )}

              {/* OUTCOME STEP */}
              {redundancyStep==="outcome"&&(
                <Card>
                  <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Outcome letters</h3>
                  {activeRedundancy.atRiskEmployees.filter(e=>e.selected).map(emp=>(
                    <div key={emp.id} style={{background:"#FDFAF5",borderRadius:8,padding:"14px",marginBottom:10,border:"1px solid #E8E0D0"}}>
                      <div style={{fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:8}}>{emp.name}</div>
                      <div style={{marginBottom:10}}>
                        <label htmlFor={`redundancy-pay-${emp.id}`} style={{display:"block",fontSize:10,color:"#6B6880",fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>Statutory redundancy pay</label>
                        <input id={`redundancy-pay-${emp.id}`} placeholder="e.g. £3,450 (1.5 weeks × £2,300/week × 1 year)" value={emp.redundancyPay||""}
                          onChange={e=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(x=>x.id===emp.id?{...x,redundancyPay:e.target.value}:x)})}
                          style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"7px 10px",fontSize:12,color:"#1A1535",outline:"none",boxSizing:"border-box"}} />
                      </div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <button onClick={()=>generateRedundancyLetter("redundancy-confirmed",emp)}
                          style={{background:"#7C5CFC",border:"none",borderRadius:5,padding:"6px 14px",fontSize:12,color:"#fff",fontWeight:600,cursor:"pointer"}}>Redundancy letter</button>
                        <button onClick={()=>generateRedundancyLetter("appeal-invite",emp)}
                          style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"6px 12px",fontSize:12,color:"#6B6375",cursor:"pointer"}}>Appeal invite</button>
                      </div>
                    </div>
                  ))}
                  <Btn variant="dark" onClick={()=>updateRedundancyCase({status:"complete"})} style={{marginTop:12}}>Mark case complete</Btn>
                </Card>
              )}
            </div>

            {/* AI advice panel. 70 -> 17: was calibrated to sit below the
                old global AppHeader (53px); the left nav no longer adds
                that on desktop. */}
            <Card style={{background:"#F5F1EA",position:"sticky",top:17}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <SectionTitle>LEGAL GUIDANCE</SectionTitle>
                <Btn onClick={getRedundancyAiAdvice} disabled={redundancyAiProcessing} style={{padding:"4px 12px",fontSize:11}}>
                  {redundancyAiProcessing?"Analysing...":"Get AI advice"}
                </Btn>
              </div>
              {redundancyAiProcessing&&!redundancyAiOutput&&(
                <div style={{textAlign:"center",padding:20}}><span className="pu" style={{color:"#7C5CFC",fontSize:20}}>●</span></div>
              )}
              {redundancyAiOutput&&<MDRenderer text={redundancyAiOutput}/>}
              {!redundancyAiOutput&&!redundancyAiProcessing&&(
                <div>
                  <div style={{fontSize:12,color:"#5A5570",lineHeight:1.8,marginBottom:16}}>
                    Click "Get AI advice" for jurisdiction-specific legal guidance on your redundancy process — consultation requirements, selection risks, equality considerations, and common pitfalls.
                  </div>
                  <div style={{borderTop:"1px solid #E8E0D0",paddingTop:14}}>
                    <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:10}}>QUICK REFERENCE</div>
                    {[
                      {l:"Individual redundancy",v:"No statutory minimum — but must be meaningful"},
                      {l:"20–99 redundancies",v:"30 days before first dismissal"},
                      {l:"100+ redundancies",v:"45 days before first dismissal"},
                      {l:"HR1 form",v:"Required for 20+ — notify BEIS before consultation"},
                      {l:"Protective award",v:"Up to 90 days pay per employee if consultation fails"},
                      {l:"Statutory redundancy pay",v:"1.5 weeks × weekly pay × years service (capped)"},
                    ].map(({l,v})=>(
                      <div key={l} style={{padding:"6px 0",borderBottom:"1px solid #1a1a1a"}}>
                        <div style={{fontSize:11,color:"#1A1535",fontWeight:500}}>{l}</div>
                        <div style={{fontSize:10,color:"#6B6880",marginTop:1}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {redundancyAiOutput&&(
                <div style={{display:"flex",gap:8,marginTop:14}}>
                  <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(redundancyAiOutput)} style={{fontSize:11,padding:"5px 12px"}}>Copy</Btn>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
