// Map: sounds of the computer. The Add sounds tray, the panel turned into four zones while files are dragged,
// and a drop on a place of the map (its kind asked).
import { chromium } from '../ballade/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'); const APP=process.env.MAP_APP||(fs.existsSync(path.join(ROOT,'docs/map-preview'))?'map-preview':'map');
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{const p=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':T[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(0);
const base=`http://localhost:${server.address().port}`;
let fails=0; const ok=(c,w)=>{console.log(`${c?'ok  ':'FAIL'} ${w}`); if(!c) fails++;};
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:860}});
await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(`${base}/docs/${APP}/index.html`); await page.waitForTimeout(600);
await page.setInputFiles('#pick-file', ROOT+'/docs/discovery/maps/261117_the_four_lands.troubadour-map');
for(let t=0;t<600;t++){ if(await page.evaluate(async()=>!!(window.MapDB&&(await window.MapDB.list()).length)))break; await page.waitForTimeout(500);}
const uid=await page.evaluate(async()=>(await window.MapDB.list())[0].uid);
await page.evaluate(u=>{location.hash=`#/edit/${u}/0`},uid); await page.waitForFunction(()=>document.getElementById('world').dataset.mode==='edit'); await page.waitForTimeout(4000);
// A DataTransfer with a real mp3, kept on window
await page.evaluate(async()=>{const r=await fetch('/docs/discovery/sounds/soundbox/08_arrow-hit.mp3'); const bl=await r.blob(); window.__f=new File([bl],'arrow_hit.mp3',{type:'audio/mpeg'});});
const fire=(type,x,y)=>page.evaluate(([type,x,y])=>{const dt=new DataTransfer(); dt.items.add(window.__f); const t=document.elementFromPoint(x,y); t.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,dataTransfer:dt})); return t.className;},[type,x,y]);
// Over the map: the panel turns into zones
await fire('dragover',700,600); await page.waitForTimeout(100);
const zb=await page.locator('#mw-drop .dr-z[data-kind="ambience"]').boundingBox();
const hold=(x,y)=>page.evaluate(([x,y])=>{window.__hold=setInterval(()=>{const dt=new DataTransfer(); dt.items.add(window.__f); document.elementFromPoint(x,y).dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,clientX:x,clientY:y,dataTransfer:dt}));},40);},[x,y]);
const let_go=()=>page.evaluate(()=>clearInterval(window.__hold));
await hold(zb.x+zb.width/2,zb.y+zb.height/2); await page.waitForTimeout(150);
ok(await page.locator('#mw-drop:not([hidden])').count()===1,'the panel turns into the drop zones');
await let_go();
await fire('drop',zb.x+zb.width/2,zb.y+zb.height/2); await page.waitForTimeout(1500);
ok(await page.locator('#mw-drop[hidden]').count()===1,'zones gone after the drop');
// world: check the own chapter of the story has it
const inWorld=await page.evaluate(async(u)=>{await new Promise(r=>setTimeout(r,800)); const r=await window.MapDB.get(u); return JSON.stringify(r.story.chapters.map(c=>(c.ambience||[]).map(s=>s.name))).includes('arrow hit');},uid);
ok(inWorld,'dropped on Ambiances: an ambiance of the world');
// Drop on a place of the map: the tavern around (978,590)
await hold(978,590); await page.waitForTimeout(150); await let_go();
await fire('drop',978,590); await page.waitForTimeout(500);
const q=await page.locator('dialog[open]').innerText().catch(()=>'' ); ok(/for/.test(q),'a drop on a place asks its kind: '+q.split('\n')[0]);
await page.locator('dialog[open] button:has-text("Music")').click(); await page.waitForTimeout(1500);
const onEl=await page.evaluate(async(u)=>{const r=await window.MapDB.get(u); const e=r.world.places[0].elements.find(e=>e.cards.some(c=>c.name==='arrow hit'&&c.zone==='music')); return e?e.title:null;},uid);
ok(!!onEl,'the music joined '+onEl);
const wm=await page.evaluate(async(u)=>{const r=await window.MapDB.get(u); return r.world.music.some(c=>c.name==='arrow hit');},uid); ok(wm,'and the Music of the world');
// Tray tile drop with an element selected
const tb=await page.locator('#mw-add .ad-z[data-kind="soundbox"]').boundingBox();
await fire('dragover',tb.x+20,tb.y+20); await fire('drop',tb.x+20,tb.y+20); await page.waitForTimeout(1500);
const sb=await page.evaluate(async(u)=>{const r=await window.MapDB.get(u); return (r.world.soundbox||[]).some(c=>c.name==='arrow hit');},uid); ok(sb,'a drop on the Soundbox tile: the Soundbox of the world');
// A place of the library dragged onto the map: laid where it is let go.
await page.click('#mw-tools [data-tool="stamp"]'); await page.waitForTimeout(500);
{ const tile=page.locator('#mw-stamps [data-stamp]').nth(3); const bb=await tile.boundingBox(); const id=await tile.getAttribute('data-stamp');
  const n0=await page.evaluate(()=>document.querySelectorAll('#mw-layers-list > *').length);
  await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2); await page.mouse.down();
  for(let k=1;k<=20;k++){ await page.mouse.move(bb.x+bb.width/2+(620-bb.x-bb.width/2)*k/20, bb.y+bb.height/2+(640-bb.y-bb.height/2)*k/20); await page.waitForTimeout(15);}
  await page.mouse.up(); await page.waitForTimeout(800);
  const r=await page.evaluate(()=>({n:document.querySelectorAll('#mw-layers-list > *').length, tool:window.MapView.tool(), sel:window.MapView.selected()&&window.MapView.selected().shape.stamp, lib:document.getElementById('mw-stamps').hidden}));
  ok(r.n===n0+1 && r.sel===id && r.lib && r.tool==='select', `a place dragged from the library is laid on the map (${JSON.stringify(r)})`); }
ok(!errs.length, `no error (${errs.join(' | ')})`); if (!fails) console.log('\nAll good'); await b.close(); server.close(); process.exit(fails?1:0);
