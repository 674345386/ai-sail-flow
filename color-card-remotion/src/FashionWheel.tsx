import React from 'react';
import {AbsoluteFill, Composition, Img, Interactive, interpolate, registerRoot, spring, staticFile, useCurrentFrame} from 'remotion';

// Native, editable animation. The subject is composited from the existing video
// after rendering this background, so her RGB, pose and timing are untouched.
const targets = [
  {name:'Cream swatch', color:'#efe6d6', x:381,y:207,w:344,h:320,angle:18,start:12,launch:-35},
  {name:'Coral swatch', color:'#f05259', x:376,y:519,w:493,h:348,angle:-18,start:27,launch:35},
  {name:'Denim swatch', color:'#215a93', x:339,y:842,w:478,h:344,angle:18,start:42,launch:-55},
];

function serrated(steps=48) {
  const p:string[]=[];
  for(let i=0;i<=steps;i++)p.push(`${i/steps*100}% ${i%2 ? 1.3:0}%`);
  for(let i=0;i<=steps;i++)p.push(`${i%2 ? 98.7:100}% ${i/steps*100}%`);
  for(let i=steps;i>=0;i--)p.push(`${i/steps*100}% ${i%2 ? 98.7:100}%`);
  for(let i=steps;i>=0;i--)p.push(`${i%2 ? 1.3:0}% ${i/steps*100}%`);
  return `polygon(${p.join(',')})`;
}
const weave='repeating-linear-gradient(0deg,rgba(255,255,255,.25) 0px,rgba(255,255,255,.25) .7px,transparent .7px,transparent 3.5px),repeating-linear-gradient(90deg,rgba(255,255,255,.22) 0px,rgba(255,255,255,.22) .7px,transparent .7px,transparent 3.8px),repeating-linear-gradient(12deg,transparent 0px,transparent 11px,rgba(20,25,40,.06) 11px,rgba(20,25,40,.06) 12px)';

const FashionWheel:React.FC=()=>{
  const frame=useCurrentFrame();
  const unfold=spring({frame,fps:24,config:{damping:18,stiffness:95,mass:1}});
  const rotation=interpolate(frame,[0,191],[-13,35]);
  return <AbsoluteFill style={{background:'#fafcfe',overflow:'hidden'}}>
    <Img src={staticFile('fashion-wheel/studio_plate.png')} style={{width:720,height:1280,objectFit:'fill'}}/>
    <Interactive.Div name="Soft contact shadow" style={{position:'absolute',left:244,top:1162,width:240,height:37,borderRadius:'50%',background:'rgba(57,65,81,.13)',filter:'blur(15px)'}}/>
    <Interactive.Div name="Gradient fabric wheel" style={{position:'absolute',left:360,top:1328,rotate:`${rotation}deg`,scale:interpolate(frame,[0,20],[0.7,1],{extrapolateRight:'clamp'}),opacity:interpolate(frame,[0,4],[0,1],{extrapolateRight:'clamp'})}}>
      {Array.from({length: forty},(_,i)=>{
        const a=i*360/forty;
        // Adjacent cards form a continuous gradient around the physical wheel.
        const hue=(i*360/forty+5)%360;
        const light=61+6*Math.cos(hue*Math.PI/180);
        return <div key={i} style={{position:'absolute',left:-35,top:-355,width:70,height:355,transformOrigin:'35px 355px',rotate:`${a*unfold}deg`,filter:'drop-shadow(1px 2px 2px rgba(31,44,70,.12))'}}>
          <div style={{position:'absolute',inset:0,clipPath:serrated(16),backgroundColor:`hsl(${hue} 56% ${light}%)`,backgroundImage:`linear-gradient(180deg,rgba(255,255,255,.17),transparent 60%),${weave}`,border:'3px solid rgba(255,255,255,.45)',boxSizing:'border-box'}}/>
        </div>;
      })}
    </Interactive.Div>
    {[...targets].reverse().map(t=>{
      const elapsed=frame-t.start;
      const rise=spring({frame:elapsed,fps:24,config:{damping:15,stiffness:105,mass:1.15}});
      const progress=Math.max(0,rise);
      const phase=(frame/24)*1.2+t.start;
      const drift=Math.sin(phase)*4*Math.min(1,Math.max(0,elapsed-30)/24);
      const sx=360+Math.sin(t.launch*Math.PI/180)*230;
      const sy=1328-Math.cos(t.launch*Math.PI/180)*230;
      const x=sx+(t.x-sx)*progress + Math.sin(Math.min(1,progress)*Math.PI)* (t.launch<0?-48:48);
      const y=sy+(t.y-sy)*progress+drift;
      return <Interactive.Div name={t.name} key={t.name} style={{position:'absolute',left:x,top:y,width:t.w,height:t.h,marginLeft:-t.w/2,marginTop:-t.h/2,scale:0.19+progress*.81,rotate:`${t.launch+(t.angle-t.launch)*progress+Math.sin(phase)*.5}deg`,opacity:interpolate(elapsed,[0,3],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),filter:'drop-shadow(0px 9px 10px rgba(42,55,72,.09))'}}>
        <div style={{position:'absolute',inset:0,clipPath:serrated(),backgroundColor:t.color,backgroundImage:weave}}/>
      </Interactive.Div>;
    })}
  </AbsoluteFill>;
};
const forty=40;
const Root=()=> <Composition id="FashionWheel" component={FashionWheel} width={720} height={1280} fps={24} durationInFrames={192}/>;
registerRoot(Root);
