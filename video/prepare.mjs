import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const ffmpeg=path.join(process.env.LOCALAPPDATA,'ms-playwright/ffmpeg-1011/ffmpeg-win64.exe');
const clips=JSON.parse(await readFile('capture.json','utf8'));
for(const [name,clip] of Object.entries(clips)){
  const result=spawnSync(ffmpeg,['-hide_banner','-i',path.resolve(`public/clips/${name}.webm`)],{encoding:'utf8'});
  const match=result.stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if(!match)throw new Error(result.stderr);
  clip.rawDuration=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  clip.start=Math.max(0,clip.rawDuration-clip.duration-clip.tail);
  console.log(name,clip);
}
await writeFile('clips.json',JSON.stringify(clips,null,2));
