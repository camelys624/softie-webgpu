import React from 'react';
import {registerRoot, Composition, AbsoluteFill, Sequence, OffthreadVideo, Audio, staticFile, useCurrentFrame, interpolate, spring} from 'remotion';
import clips from '../clips.json';

const FPS=30;
const scenes=[
  {key:'idle',seconds:4.6,kicker:'HELLO, WORKMATE',title:['上班已经够硬了。','搭子，要软一点。'],desc:'软乎乎 · 你的桌面打工搭子',tags:['柔软手感','一点小脾气','很多陪伴'],note:'今天，让工位多一点好心情。'},
  {key:'touch',seconds:7,kicker:'01 / TOUCH & RELEASE',title:['压力，','捏出去。'],desc:'戳一下，拉一拉。\n放手，烦恼也跟着弹开。',tags:['戳戳','揉捏','弹性回弹'],note:'手上的小动作，也是忙碌里的小休息。'},
  {key:'angry',seconds:5,kicker:'02 / LITTLE MOODS',title:['脾气，','写在脸上。'],desc:'斜眼、撇嘴、气鼓鼓。\n有时候，它比我还会表达。',tags:['有点烦躁','气鼓鼓'],note:'这合理吗？！'},
  {key:'boss',seconds:12.5,kicker:'03 / BOSS, BE GONE',title:['老板来了？','这次我有锤。'],desc:'预警响起，魔法锤就位。\n不合理的需求，敲走再说。',tags:['登场预警','挥锤驱魔','老板退散'],note:'反击成功，开心摸鱼。'},
  {key:'comfort',seconds:8,kicker:'04 / HERE FOR YOU',title:['有点沮丧，','也有人懂。'],desc:'没赶走老板，也没关系。\n戳一下，陪它慢慢缓过来。',tags:['沮丧','戳戳安慰','慢慢恢复'],note:'还好，你懂我。'},
  {key:'happy',seconds:5.5,kicker:'SOFTIE · 软乎乎',title:['把班味留给老板。','把好心情留给自己。'],desc:'一个能捏、会闹、懂你的打工搭子。',tags:['戳戳','驱魔','陪伴'],note:'明天，也一起上班吧。'},
];
let offset=0;for(const scene of scenes){scene.from=offset;scene.frames=Math.round(scene.seconds*FPS);offset+=scene.frames;}
const TOTAL=offset;
const ink='#4f394d', pink='#cf6c94';
function SoftieScene({scene,index}){
  const f=useCurrentFrame();
  const enter=spring({frame:f,fps:FPS,config:{damping:24,stiffness:110,mass:1}});
  const fade=interpolate(f,[0,10,scene.frames-9,scene.frames],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const source=clips[scene.key];
  const rate=Math.max(.5,(source.duration-.12)/scene.seconds);
  const caption=scene.key==='boss'?(f<95?'熟悉的预警，又来活了。':f<270?'需求不合理？魔法锤伺候。':'老板退散！终于可以摸会儿鱼。')
    :scene.key==='comfort'?(f<85?'怎么又不算数了…':f<125?'戳一下：我在呢。':'他说的不算，我做得很好。'):scene.note;
  return <AbsoluteFill style={{opacity:fade}}>
    <div style={{position:'absolute',left:100,top:232,width:660,transform:`translateY(${(1-enter)*24}px)`,opacity:enter}}>
      <div style={{fontSize:19,letterSpacing:3.5,color:pink,fontWeight:650,marginBottom:34}}>{scene.kicker}</div>
      <div style={{fontSize:index===5?57:68,lineHeight:1.28,fontWeight:750,letterSpacing:-2.5,color:ink}}>{scene.title.map((line,i)=><div key={line} style={{color:i===1?pink:ink}}>{line}</div>)}</div>
      <div style={{fontSize:27,color:'#887083',lineHeight:1.8,whiteSpace:'pre-line',marginTop:34}}>{scene.desc}</div>
      <div style={{display:'flex',gap:13,marginTop:44,flexWrap:'wrap'}}>{scene.tags.map((tag,i)=><div key={tag} style={{padding:'12px 22px',borderRadius:30,fontSize:21,color:i===scene.tags.length-1?'#986b9d':'#856879',background:i===scene.tags.length-1?'#ecddf0':'#f3e7ec',border:'1px solid #e8d5df'}}>{tag}</div>)}</div>
    </div>
    <div style={{position:'absolute',left:805,top:125,width:1015,height:846,borderRadius:44,overflow:'hidden',background:'white',boxShadow:'0 24px 80px #a5637e19',border:'1px solid #f0dee6',transform:`translateY(${(1-enter)*30}px)`}}>
      <OffthreadVideo src={staticFile(`clips/${scene.key}.webm`)} trimBefore={Math.round(source.start*FPS)} playbackRate={rate} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/>
      <div style={{position:'absolute',left:30,top:26,display:'flex',gap:9,alignItems:'center',fontSize:16,color:'#b299a5',letterSpacing:2}}><span style={{width:8,height:8,borderRadius:5,background:'#d8e4d5'}}/>真实交互录屏</div>
    </div>
    <div style={{position:'absolute',left:100,bottom:130,width:645,borderLeft:'3px solid #d9b5cc',paddingLeft:22,fontSize:24,color:'#9e7b92',lineHeight:1.6}}>{caption}</div>
    <Audio src={staticFile(`clips/${scene.key}-audio.webm`)} playbackRate={rate} volume={.95}/>
  </AbsoluteFill>;
}
function Film(){
  const f=useCurrentFrame();
  const active=scenes.findIndex(s=>f>=s.from&&f<s.from+s.frames);
  return <AbsoluteFill style={{fontFamily:'"Microsoft YaHei", "PingFang SC", sans-serif',background:'linear-gradient(130deg,#fff9f8 0%,#faf3f7 56%,#f0eaf8 100%)'}}>
    <div style={{position:'absolute',width:900,height:900,borderRadius:'50%',background:'radial-gradient(circle,#f5d8e450,transparent 67%)',left:-350,bottom:-600}}/>
    <div style={{position:'absolute',left:100,top:61,display:'flex',alignItems:'baseline',gap:18,color:ink}}><span style={{fontSize:38,fontWeight:750,letterSpacing:-2}}>softie.</span><span style={{fontSize:20,color:'#a18395'}}>软乎乎 / 打工搭子</span></div>
    <div style={{position:'absolute',right:104,top:75,fontSize:17,letterSpacing:3,color:'#ae94a5'}}>一点交互 · 一点治愈 · 很多乐趣</div>
    {scenes.map((scene,index)=><Sequence key={scene.key} from={scene.from} durationInFrames={scene.frames}><SoftieScene scene={scene} index={index}/></Sequence>)}
    <div style={{position:'absolute',bottom:51,left:100,right:100,display:'flex',alignItems:'center',gap:14}}>
      {scenes.map((s,i)=><div key={s.key} style={{height:4,flex:1,borderRadius:4,background:i===active?'#ce87a8':i<active?'#dfbdce':'#e9dde5'}}/>)}
      <div style={{fontSize:16,color:'#aa91a2',marginLeft:12,letterSpacing:2}}>TODAY WITH SOFTIE</div>
    </div>
    <Audio src={staticFile('music.wav')} volume={frame=>{
      const fadeIn=Math.min(1,frame/45),fadeOut=Math.min(1,(TOTAL-frame)/70);
      return Math.max(0,fadeIn*fadeOut*(frame>=scenes[3].from&&frame<scenes[3].from+130?.34:.62));
    }}/>
  </AbsoluteFill>;
}
registerRoot(()=> <Composition id="SoftieWorkmate" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080}/>);
