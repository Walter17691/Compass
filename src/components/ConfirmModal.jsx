import { Btn } from './Primitives';

export function ConfirmModal({ title, message, confirmLabel="Confirm", cancelLabel="Cancel", danger=false, onConfirm, onCancel }) {
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title"
      onKeyDown={e=>{ if(e.key==="Escape") onCancel(); }}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:440}}>
        {title && <h3 id="confirm-modal-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>{title}</h3>}
        <p style={{fontSize:13,color:"#6B6375",marginBottom:24,lineHeight:1.6}}>{message}</p>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <Btn variant="ghost" onClick={onCancel}>{cancelLabel}</Btn>
          <Btn variant={danger?"danger":"primary"} onClick={onConfirm} style={danger?{background:"#C84B2F",color:"#fff",border:"none"}:{}}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}
