import { useRef } from 'react';
import { CompassLogo } from '../components/CompassLogo';
import { useModalA11y } from '../hooks/useModalA11y';

export function OnboardingWizard({ onboardingStep, setOnboardingStep, org, currentUser, lsSet, setShowOnboarding, setShowCasePrompt, setShowAskCompass }) {
  const dismiss = () => { lsSet("compass_onboarded",true); setShowOnboarding(false); };
  const containerRef = useRef(null);
  useModalA11y(containerRef, dismiss);
  return(
    <div role="dialog" aria-modal="true" aria-label="Welcome to Compass" ref={containerRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFFFFF",borderRadius:20,width:"100%",maxWidth:520,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",position:"relative"}}>
        {/* Progress bar */}
        <div style={{height:4,background:"#F5F1EA"}}>
          <div style={{height:4,background:"#7C5CFC",width:`${((onboardingStep+1)/4)*100}%`,transition:"width 0.3s"}}/>
        </div>
        <button onClick={dismiss} aria-label="Close" style={{position:"absolute",top:16,right:16,background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098",lineHeight:1,padding:4,zIndex:1}}>×</button>
        <div style={{padding:36}}>
          {onboardingStep===0&&(
            <>
              <div style={{width:56,height:56,borderRadius:"50%",background:"#7C5CFC",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20}}>
                <CompassLogo size={32}/>
              </div>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#1C1820",marginBottom:8,fontWeight:400}}>Welcome to Compass</div>
              <div style={{fontSize:14,color:"#6B6375",lineHeight:1.7,marginBottom:28}}>Compass helps you manage HR cases, run ACAS-compliant meetings, generate documents, and track every step of the process — all in one place.</div>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
                {[
                  {icon:"",title:"Log cases",desc:"Track every HR proceeding from first meeting to outcome"},
                  {icon:"",title:"AI meeting notes",desc:"Record meetings with live AI notes and HR guidance"},
                  {icon:"",title:"Generate documents",desc:"ACAS-compliant letters, reports and outcome documents"},
                  {icon:"",title:"Reports & analytics",desc:"Organisation-wide HR insights at a glance"},
                ].map((item,i)=>(
                  <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"10px 14px",background:"#FDFAF5",borderRadius:10}}>
                    <div><div style={{fontSize:13,fontWeight:600,color:"#1C1820"}}>{item.title}</div><div style={{fontSize:12,color:"#9B9098"}}>{item.desc}</div></div>
                  </div>
                ))}
              </div>
              <button onClick={()=>setOnboardingStep(1)} style={{width:"100%",background:"#7C5CFC",border:"none",borderRadius:10,padding:"14px",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Get started →</button>
            </>
          )}
          {onboardingStep===1&&(
            <>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1C1820",marginBottom:8,fontWeight:400}}>Set up your organisation</div>
              <div style={{fontSize:13,color:"#6B6375",marginBottom:24}}>Tell us about your organisation so Compass can personalise your experience.</div>
              {/* Read-only display, not an editable field — a <label> here
                  would have no control to associate with (this app's own
                  labelling convention is htmlFor pointing at a real
                  input/select/textarea); a plain heading div is the
                  correct element for "text describing the text below it". */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,color:"#1C1820",marginBottom:6}}>Organisation name</div>
                <div style={{fontSize:13,color:"#1C1820",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px"}}>{org?.name||"Your organisation"}</div>
              </div>
              <div style={{marginBottom:24}}>
                <div style={{fontSize:12,fontWeight:600,color:"#1C1820",marginBottom:6}}>Your role</div>
                <div style={{fontSize:13,color:"#1C1820",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px"}}>{currentUser?.name||"HR Manager"}</div>
              </div>
              <div style={{background:"#EDE8FF",borderRadius:10,padding:"14px 16px",marginBottom:24,fontSize:12,color:"#7C5CFC"}}>
                Compass is pre-configured with UK employment law, ACAS codes of practice and HR best practice. No additional setup required.
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setOnboardingStep(0)} style={{flex:1,background:"#F5F1EA",border:"none",borderRadius:10,padding:"12px",color:"#6B6375",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>← Back</button>
                <button onClick={()=>setOnboardingStep(2)} style={{flex:2,background:"#7C5CFC",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Continue →</button>
              </div>
            </>
          )}
          {onboardingStep===2&&(
            <>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1C1820",marginBottom:8,fontWeight:400}}>Log your first case</div>
              <div style={{fontSize:13,color:"#6B6375",marginBottom:24}}>Cases are the heart of Compass. Each case tracks an employee relations matter from start to resolution.</div>
              <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:12,padding:20,marginBottom:24}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1C1820",marginBottom:12}}>To create your first case:</div>
                {["Click the New case button on the home screen","Enter the employee name and case details","Select the case type (misconduct, grievance, etc.)","Start logging meetings from the case view"].map((step,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:"#7C5CFC",color:"#fff",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{i+1}</div>
                    <div style={{fontSize:13,color:"#6B6375"}}>{step}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setOnboardingStep(1)} style={{flex:1,background:"#F5F1EA",border:"none",borderRadius:10,padding:"12px",color:"#6B6375",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>← Back</button>
                <button onClick={()=>setOnboardingStep(3)} style={{flex:2,background:"#7C5CFC",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Continue →</button>
              </div>
            </>
          )}
          {onboardingStep===3&&(
            <>
              <div style={{textAlign:"center",marginBottom:24}}>
                <div style={{width:64,height:64,borderRadius:"50%",background:"#E8F5EE",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1A7A4A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:24,color:"#1C1820",marginBottom:8,fontWeight:400}}>You're ready</div>
                <div style={{fontSize:13,color:"#6B6375",lineHeight:1.7}}>Compass is set up and ready to use. Start by creating your first case, or ask the HR Advisor a question.</div>
              </div>
              <div style={{display:"flex",gap:10,marginBottom:12}}>
                <button onClick={()=>{lsSet("compass_onboarded",true);setShowOnboarding(false);setShowCasePrompt(true);}} style={{flex:1,background:"#7C5CFC",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Create first case</button>
                <button onClick={()=>{lsSet("compass_onboarded",true);setShowOnboarding(false);setShowAskCompass(true);}} style={{flex:1,background:"#F5F1EA",border:"none",borderRadius:10,padding:"13px",color:"#1C1820",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Ask HR Advisor</button>
              </div>
              <button onClick={()=>{lsSet("compass_onboarded",true);setShowOnboarding(false);}} style={{width:"100%",background:"none",border:"none",color:"#9B9098",fontSize:12,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Skip and explore on my own</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
