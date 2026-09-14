import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('public/clips');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const manifest = {};
const pause = (page, ms) => page.waitForTimeout(ms);
async function point(page, x = 0, y = 1.25) {
  return page.evaluate(({x,y}) => {
    const {slime, camera, physics} = window.__SOFTIE__;
    const p = slime.group.position.clone();
    physics.deform(x, y, 1.1, p); p.add(physics.position).project(camera);
    return {x:(p.x + 1) * innerWidth / 2, y:(1 - p.y) * innerHeight / 2};
  }, {x,y});
}
async function move(page, from, to, duration = 650) {
  for (let i = 1; i <= 24; i++) {
    const t = i / 24, e = t*t*(3-2*t);
    await page.mouse.move(from.x+(to.x-from.x)*e, from.y+(to.y-from.y)*e);
    await pause(page, duration/24);
  }
}
async function capture(name, action, before) {
  const context = await browser.newContext({ viewport:{width:960,height:800}, deviceScaleFactor:1,
    recordVideo:{dir:out,size:{width:960,height:800}} });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/?pet=1&test=1');
  await page.waitForFunction(() => window.__SOFTIE__?.getDiagnostics().frames > 10 && document.querySelector('#stage').getAttribute('aria-busy') === 'false');
  await pause(page, 1100);
  await page.addStyleTag({content:`
    body[data-mode=pet] .speech-bubble {max-width:490px;padding:15px 22px;border-radius:24px;}
    body[data-mode=pet] .speech-bubble p {font-size:25px;line-height:1.5;}
    body[data-mode=pet] .boss-hammer {--hammer-size:170px;}
    .pet-handle {opacity:0!important;}
    #film-cursor {position:fixed;left:0;top:0;width:30px;height:38px;z-index:45;pointer-events:none;filter:drop-shadow(1px 3px 3px #493b4940);}
    body.boss-active #film-cursor {display:none;}
  `});
  await page.evaluate(() => {
    const cursor = document.createElement('div');cursor.id='film-cursor';cursor.hidden=true;
    cursor.innerHTML='<svg viewBox="0 0 30 38"><path d="M3 2v27l7-7 7 13 6-3-7-13 10-1Z" fill="white" stroke="#625363" stroke-width="2.3" stroke-linejoin="round"/></svg>';
    document.body.append(cursor);
    document.addEventListener('pointermove',e=>{cursor.hidden=false;cursor.style.transform=`translate(${e.clientX}px,${e.clientY}px)`;});
    const {sound, boss} = window.__SOFTIE__;
    boss.encounter.nextAt = Infinity;
    sound.setVolume(.8);sound.resume();
    window.__film = {chunks:[]};
    const dest=sound.ctx.createMediaStreamDestination();sound.masterGain.connect(dest);
    window.__film.recorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});
    window.__film.recorder.ondataavailable=e=>{if(e.data.size)window.__film.chunks.push(e.data);};
  });
  if(before) await before(page);
  await page.evaluate(()=>window.__film.recorder.start());
  const start=Date.now();
  await action(page);
  const duration=(Date.now()-start)/1000;
  const audio=await page.evaluate(()=>new Promise(resolve=>{
    window.__film.recorder.onstop=()=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(new Blob(window.__film.chunks,{type:'audio/webm'}));
    };window.__film.recorder.stop();
  }));
  const video=page.video();
  await page.close();await context.close();
  await rename(await video.path(),path.join(out,`${name}.webm`));
  await writeFile(path.join(out,`${name}-audio.webm`),Buffer.from(audio,'base64'));
  manifest[name]={duration,tail:0.08};
  await writeFile('capture.json',JSON.stringify(manifest,null,2));
  console.log(`Captured ${name}: ${duration.toFixed(2)}s`);
}
try {
  await capture('idle',async page=>{await pause(page,5500);});
  await capture('touch',async page=>{
    const p=await point(page);const from={x:820,y:640};
    await page.mouse.move(from.x,from.y);await move(page,from,p,500);
    await page.mouse.click(p.x,p.y);await pause(page,900);
    const q=await point(page,.4,1.55);await move(page,p,q,450);
    await page.mouse.down();await pause(page,280);
    const up={x:q.x+120,y:q.y-135};await move(page,q,up,800);await pause(page,450);
    await page.mouse.up();await pause(page,2100);
  });
  await capture('angry',async page=>{
    const p=await point(page);await page.mouse.move(p.x,p.y);
    for(let i=0;i<5;i++){await page.keyboard.press('Space');await pause(page,230);}
    await page.mouse.move(850,670);await pause(page,3700);
  });
  await capture('boss',async page=>{
    await pause(page,500);await page.evaluate(()=>window.__SOFTIE__.boss.summon());
    await pause(page,2100);const p=await point(page,0,1.6);
    await page.mouse.move(p.x,p.y);await pause(page,550);
    await page.mouse.down();await pause(page,5300);await page.mouse.up();
    await page.mouse.move(860,700);await pause(page,3400);
  });
  await capture('comfort',async page=>{
    await pause(page,2300);
    const p=await point(page);await page.mouse.move(820,620);await move(page,{x:820,y:620},p,550);
    await page.mouse.click(p.x,p.y);await pause(page,2100);
    await page.mouse.move(860,680);await pause(page,2200);
  },async page=>{
    await page.evaluate(()=>window.__SOFTIE__.boss.summon());
    await pause(page,9200);
  });
  await capture('happy',async page=>{await pause(page,5600);},async page=>{
    await page.evaluate(()=>window.__SOFTIE__.slime.faceMotion.bossDefeated());
  });
} finally {await browser.close();}
