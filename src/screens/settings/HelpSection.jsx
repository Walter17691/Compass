import { Btn, Card } from '../../components/Primitives';

export function HelpSection({ setOnboardStep, setShowOnboard }) {
  return (
    <Card>
      <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Help &amp; onboarding</h3>
      <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px"}}>Rewatch the getting started guide.</p>
      <Btn onClick={()=>{setOnboardStep(0);setShowOnboard(true);}}>Restart tour</Btn>
    </Card>
  );
}
