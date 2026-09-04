import { Btn, Card, Badge } from '../../components/Primitives';
import { COLOR, FONT } from '../../styles/tokens';

// Brand v2.0 migration — this shell previously ran its own hardcoded
// pre-migration palette (serif headings, warm-paper dropzone tints)
// disconnected from styles/tokens.js, same class of drift as Login.jsx.
// Values only — upload/storage/validation behaviour below is untouched.

export function BrandingSection({ wordTemplate, setWordTemplate, lsSet, wordTemplateRef, handleWordTemplateUpload, letterhead, setLetterhead, letterheadRef, handleLetterheadUpload, signature, setSignature, setShowSigPad }) {
  return (
    <>
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:FONT.sans,fontSize:15,fontWeight:700,letterSpacing:"-0.02em",color:COLOR.ink,margin:"0 0 4px"}}>Word letter template</h3><p style={{fontSize:12,color:COLOR.inkSoft,margin:0,lineHeight:1.6}}>Upload your .docx with header/footer. Enables Word export on letters.</p></div>
          <Badge color={COLOR.inkFaint}>WORD</Badge>
        </div>
        {wordTemplate?<div style={{background:COLOR.rail,borderRadius:7,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:COLOR.ink}}>{wordTemplate.name}</span><Btn variant="danger" onClick={()=>{setWordTemplate(null);lsSet("compass_word_template",null);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn></div>:<div style={{background:"#FDFAF5",border:`2px dashed ${COLOR.borderStrong}`,borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:COLOR.inkFaint}}>No template uploaded</div>}
        <input ref={wordTemplateRef} type="file" accept=".docx" onChange={handleWordTemplateUpload} style={{display:"none"}} />
        <Btn variant="dark" onClick={()=>wordTemplateRef.current?.click()}>{wordTemplate?"Replace":"Upload .docx template"} →</Btn>
      </Card>

      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:FONT.sans,fontSize:15,fontWeight:700,letterSpacing:"-0.02em",color:COLOR.ink,margin:"0 0 4px"}}>Letterhead image</h3><p style={{fontSize:12,color:COLOR.inkSoft,margin:0,lineHeight:1.6}}>PNG or JPG — appears at top of PDF letters.</p></div>
          <Badge>PDF</Badge>
        </div>
        {letterhead?<div style={{background:"#fff",borderRadius:7,padding:12,marginBottom:12,position:"relative"}}><img src={letterhead} alt="Letterhead" style={{width:"100%",maxHeight:100,objectFit:"contain",objectPosition:"left"}}/><button onClick={()=>{setLetterhead(null);lsSet("compass_letterhead",null);}} style={{position:"absolute",top:6,right:6,background:COLOR.surface,border:`1px solid ${COLOR.borderStrong}`,borderRadius:5,padding:"3px 8px",fontSize:11,color:COLOR.red,cursor:"pointer"}}>Remove</button></div>:<div style={{background:"#FDFAF5",border:`2px dashed ${COLOR.borderStrong}`,borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:COLOR.inkFaint}}>No letterhead uploaded</div>}
        <input ref={letterheadRef} type="file" accept="image/*" onChange={handleLetterheadUpload} style={{display:"none"}} />
        <Btn onClick={()=>letterheadRef.current?.click()}>{letterhead?"Replace":"Upload letterhead"} →</Btn>
      </Card>

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:FONT.sans,fontSize:15,fontWeight:700,letterSpacing:"-0.02em",color:COLOR.ink,margin:"0 0 4px"}}>E-signature</h3><p style={{fontSize:12,color:COLOR.inkSoft,margin:0,lineHeight:1.6}}>Draw or type your signature. Applied to all PDF letters.</p></div>
        </div>
        {signature?<div style={{background:"#fff",borderRadius:7,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {signature.type==="typed"?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:28,color:"#FFFFFF"}}>{signature.data}</div>:<img src={signature.data} alt="Your signature" style={{maxHeight:45,maxWidth:160}}/>}
          <Btn variant="danger" onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{padding:"3px 10px",fontSize:11}}>Remove</Btn>
        </div>:<div style={{background:"#FDFAF5",border:`2px dashed ${COLOR.borderStrong}`,borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:COLOR.inkFaint}}>No signature saved</div>}
        <Btn onClick={()=>setShowSigPad(true)}>{signature?"Update":"Create"} signature →</Btn>
      </Card>
    </>
  );
}
