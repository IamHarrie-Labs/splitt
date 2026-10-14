import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Composition, Img, Sequence, continueRender, delayRender, interpolate, registerRoot, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import scenes from '../public/scenes.json';

const paper = '#f5f2ec', ink = '#1c2f27', green = '#234b3a';
const sceneFrames = 600;
function Scene({scene, index}: {scene: typeof scenes[number]; index:number}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame,fps,config:{damping:200}});
  const exit = interpolate(frame,[sceneFrames-18,sceneFrames-1],[1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <AbsoluteFill style={{padding:'66px 100px',color:ink,opacity:enter*exit,transform:`translateY(${(1-enter)*18}px)`}}>
    <Audio src={staticFile(`voice-${index}.wav`)} volume={0.9}/>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:26,color:green}}><span style={{fontFamily:'Grotesk',fontSize:38}}>splitt.</span><span>Build walkthrough · 14 October 2026</span></div>
    <h1 style={{fontFamily:'Grotesk',fontSize:68,fontWeight:500,letterSpacing:-2,margin:'34px 0 26px',maxWidth:1500}}>{scene.title}</h1>
    {scene.kind==='screen' && <div style={{borderRadius:18,border:'1px solid #d8d2c8',overflow:'hidden',boxShadow:'0 18px 50px #234b3a15',width:1480,margin:'0 auto',transform:`scale(${interpolate(frame,[0,sceneFrames],[.995,1.015],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})})`}}><div style={{height:36,background:'#e8e3db',display:'flex',alignItems:'center',gap:8,paddingLeft:20}}>{[0,1,2].map(n=><i key={n} style={{height:8,width:8,borderRadius:'50%',background:'#9caaa0'}}/>)}</div><Img src={staticFile(scene.image!)} style={{width:1480,height:650,objectFit:'cover',objectPosition:'center',display:'block'}}/></div>}
    {scene.kind==='hook' && <div style={{marginTop:82}}><p style={{fontFamily:'Georgia',fontStyle:'italic',fontSize:100,margin:0,color:green}}>{scene.accent}</p><div style={{display:'flex',gap:100,marginTop:70}}>{[['Invoice','2,000'],['Receipt','1,200'],['Reserve','300']].map(([label,value],i)=><div key={label} style={{opacity:spring({frame:frame-15-i*10,fps,config:{damping:200}})}}><p style={{fontSize:28,color:'#56635d'}}>{label}</p><strong style={{fontFamily:'Grotesk',fontSize:82,fontWeight:500}}>{value}<small style={{fontFamily:'Poppins',fontSize:26,marginLeft:15}}>USDC</small></strong></div>)}</div></div>}
    {scene.kind==='control' && <div style={{marginTop:75}}>{['Check current facts and policy','Review the exact EIP-712 batch','Execute through the Circle operator','Reconcile against chain replay flags'].map((text,i)=><div key={text} style={{display:'flex',gap:30,alignItems:'center',borderBottom:'1px solid #d8d2c8',padding:'28px 0',fontSize:36,opacity:spring({frame:frame-12-i*12,fps,config:{damping:200}})}}><span style={{color:green,fontFamily:'Grotesk',fontSize:42}}>0{i+1}</span>{text}</div>)}</div>}
    {scene.kind==='isolation' && <div style={{display:'flex',gap:70,marginTop:100}}>{[['Northstar','800','Obligations fully paid'],['Fieldwork','1,000','Separate balance untouched']].map(([name,value,detail])=><div key={name} style={{flex:1,borderTop:`3px solid ${green}`,padding:'40px 0'}}><p style={{fontSize:36,margin:0}}>{name}</p><p style={{fontFamily:'Grotesk',fontSize:120,margin:'22px 0'}}>{value}<small style={{fontSize:30,marginLeft:18}}>USDC</small></p><p style={{fontSize:28,color:'#56635d'}}>{detail}</p></div>)}</div>}
    {scene.kind==='proof' && <div style={{marginTop:75,fontSize:36,lineHeight:1.7}}><p>✓ Arc vault deployed</p><p>✓ Source and bytecode match exactly</p><p>✓ Circle contract query confirmed</p><p style={{color:'#876420'}}>Contractor payouts await activation.</p><p style={{fontSize:28,color:'#56635d'}}>Query value: 0 USDC · This was not a payout.</p></div>}
    {scene.kind==='pending' && <div style={{marginTop:90}}><p style={{fontFamily:'Georgia',fontStyle:'italic',fontSize:88,margin:'0 0 40px',color:green}}>{scene.accent}</p><p style={{fontSize:40}}>Underpayment → reviewed allocation → remainder</p><p style={{fontSize:32,color:'#56635d',maxWidth:1250,lineHeight:1.7}}>Remaining evidence: real payouts, model evaluation, business pilot and public publication.</p><p style={{fontSize:36,marginTop:50,fontFamily:'Grotesk'}}>localhost:3000/demo</p></div>}
    <div style={{position:'absolute',bottom:55,left:100,right:100,display:'flex',gap:40,alignItems:'center',justifyContent:'space-between'}}><p style={{fontSize:27,maxWidth:1420,lineHeight:1.5,margin:0,color:'#56635d'}}>{scene.caption}</p><span style={{fontFamily:'Grotesk',fontSize:28}}>{String(index+1).padStart(2,'0')} / 08</span></div>
  </AbsoluteFill>;
}
function Walkthrough() {
  const frame=useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Loading Splitt fonts'));
  useEffect(() => { Promise.all([document.fonts.load('500 32px Grotesk'), document.fonts.load('400 32px Poppins')]).then(() => continueRender(fontHandle)); }, [fontHandle]);
  return <AbsoluteFill style={{background:paper,fontFamily:'Poppins',overflow:'hidden'}}>
    <style>{`@font-face{font-family:Grotesk;src:url('${staticFile('grotesk.woff2')}')}@font-face{font-family:Poppins;src:url('${staticFile('poppins.woff2')}')}`}</style>
    <div style={{position:'absolute',width:1000,height:1000,border:`1px dotted #234b3a20`,borderRadius:'50%',right:-330,top:-280,transform:`rotate(${frame*.04}deg)`}}/>
    {scenes.map((scene,index)=><Sequence key={index} from={index*sceneFrames} durationInFrames={sceneFrames} premountFor={30}><Scene scene={scene} index={index}/></Sequence>)}
    <div style={{position:'absolute',bottom:0,left:0,height:5,width:`${100*frame/(sceneFrames*scenes.length)}%`,background:green}}/>
  </AbsoluteFill>;
}
registerRoot(()=> <Composition id="SplittDemo" component={Walkthrough} width={1920} height={1080} fps={30} durationInFrames={scenes.length*sceneFrames}/>);
