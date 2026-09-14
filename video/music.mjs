import {mkdir,writeFile} from 'node:fs/promises';
const rate=44100,seconds=44, data=new Float32Array(Math.ceil(rate*seconds));
const add=(start,dur,fn)=>{for(let n=0;n<dur*rate&&Math.round(start*rate)+n<data.length;n++){data[Math.round(start*rate)+n]+=fn(n/rate,n);}};
const beat=60/96;
const chords=[[261.63,329.63,392,493.88],[220,261.63,329.63,392],[174.61,220,261.63,329.63],[196,246.94,293.66,392]];
for(let b=0;b*beat<seconds;b++){
  const chord=chords[Math.floor(b/8)%4],t=b*beat;
  if(b%2===0){const hz=chord[(b/2)%4]*2;add(t,.65,x=>.075*Math.sin(2*Math.PI*hz*x)*Math.exp(-x*6)*(1-Math.exp(-x*130)));}
  if(b%4===0){const hz=chord[0]/2;add(t,1.3,x=>.055*Math.sin(2*Math.PI*hz*x)*Math.exp(-x*3)*(1-Math.exp(-x*70)));}
  if(b%2===0)add(t,.18,x=>.045*Math.sin(2*Math.PI*(65*x-45*x*x))*Math.exp(-x*24));
  if(b%4===2)add(t,.12,(x,n)=>.017*Math.sin(n*12.9898)*Math.sin(n*3.431)*Math.exp(-x*45));
}
const wav=Buffer.alloc(44+data.length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(data.length*2,40);
for(let i=0;i<data.length;i++)wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,data[i]))*32767),44+i*2);
await mkdir('public',{recursive:true});await writeFile('public/music.wav',wav);console.log('Created original 44-second music bed');
