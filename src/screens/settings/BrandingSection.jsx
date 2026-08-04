import { Btn, Card, Badge } from '../../components/Primitives';

export function BrandingSection({ wordTemplate, setWordTemplate, lsSet, wordTemplateRef, handleWordTemplateUpload, letterhead, setLetterhead, letterheadRef, handleLetterheadUpload, signature, setSignature, setShowSigPad }) {
  return (
    <>
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Word letter template</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Upload your .docx with header/footer. Enables Word export on letters.</p></div>
          <Badge color="#1C5AA0">WORD</Badge>
        </div>
        {wordTemplate?<div style={{background:"#FDFAF5",borderRadius:7,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#1A1535"}}>{wordTemplate.name}</span><Btn variant="danger" onClick={()=>{setWordTemplate(null);lsSet("compass_word_template",null);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn></div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No template uploaded</div>}
        <input ref={wordTemplateRef} type="file" accept=".docx" onChange={handleWordTemplateUpload} style={{display:"none"}} />
        <Btn variant="blue" onClick={()=>wordTemplateRef.current?.click()}>{wordTemplate?"Replace":"Upload .docx template"} →</Btn>
      </Card>

      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Letterhead image</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>PNG or JPG — appears at top of PDF letters.</p></div>
          <Badge>PDF</Badge>
        </div>
        {letterhead?<div style={{background:"#fff",borderRadius:7,padding:12,marginBottom:12,position:"relative"}}><img src={letterhead} alt="Letterhead" style={{width:"100%",maxHeight:100,objectFit:"contain",objectPosition:"left"}}/><button onClick={()=>{setLetterhead(null);lsSet("compass_letterhead",null);}} style={{position:"absolute",top:6,right:6,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 8px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button></div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No letterhead uploaded</div>}
        <input ref={letterheadRef} type="file" accept="image/*" onChange={handleLetterheadUpload} style={{display:"none"}} />
        <Btn onClick={()=>letterheadRef.current?.click()}>{letterhead?"Replace":"Upload letterhead"} →</Btn>
      </Card>

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>E-signature</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Draw or type your signature. Applied to all PDF letters.</p></div>
        </div>
        {signature?<div style={{background:"#fff",borderRadius:7,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {signature.type==="typed"?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:28,color:"#FFFFFF"}}>{signature.data}</div>:<img src={signature.data} alt="Sig" style={{maxHeight:45,maxWidth:160}}/>}
          <Btn variant="danger" onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{padding:"3px 10px",fontSize:11}}>Remove</Btn>
        </div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No signature saved</div>}
        <Btn onClick={()=>setShowSigPad(true)}>{signature?"Update":"Create"} signature →</Btn>
      </Card>
    </>
  );
}
