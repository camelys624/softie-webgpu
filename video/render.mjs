import {bundle} from '@remotion/bundler';
import {renderMedia,selectComposition,renderStill} from '@remotion/renderer';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const browserExecutable='C:/Program Files/Google/Chrome/Application/chrome.exe';
const serveUrl=await bundle({entryPoint:path.resolve('src/index.jsx'),publicDir:path.resolve('public')});
const composition=await selectComposition({serveUrl,id:'SoftieWorkmate',browserExecutable});
await mkdir('out',{recursive:true});
if(process.argv.includes('--stills')){
  for(const [name,frame] of [['cover',60],['touch',220],['boss',640],['comfort',1000],['ending',1210]]){
    await renderStill({serveUrl,composition,output:path.resolve(`out/${name}.png`),frame,browserExecutable});console.log(`Still: ${name}`);
  }
}else{
  let last=-1;
  await renderMedia({serveUrl,composition,codec:'h264',audioCodec:'aac',crf:18,x264Preset:'fast',
    outputLocation:path.resolve('out/softie-workmate.mp4'),browserExecutable,concurrency:4,
    onProgress:({progress})=>{const n=Math.floor(progress*10);if(n!==last){last=n;console.log(`Render ${n*10}%`);}}});
  console.log(`Finished ${composition.durationInFrames/composition.fps}s, ${composition.width}x${composition.height}`);
}
