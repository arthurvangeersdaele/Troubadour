// Map: the toolbar of the editor on a computer. The path, one tool lit at a time, the place armed and its ghost,
// the actions on the selection, the tooltips of Undo, the L key with the left column hidden.
import { chromium } from '../ballade/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'); const APP=process.env.MAP_APP||(fs.existsSync(path.join(ROOT,'docs/map-preview'))?'map-preview':'map');
let fails=0; const ok=(c,w)=>{console.log(`${c?'ok  ':'FAIL'} ${w}`); if(!c) fails++;};
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const p=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':T[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(0);
const base=`http://localhost:${server.address().port}`;
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:860}});
await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(`${base}/docs/${APP}/index.html`); await page.waitForTimeout(600);
await page.setInputFiles('#pick-file', ROOT+'/docs/discovery/maps/261117_the_four_lands.troubadour-map');
for(let t=0;t<600;t++){ if(await page.evaluate(async()=>!!(window.MapDB&&(await window.MapDB.list()).length)))break; await page.waitForTimeout(500);}
const uid=await page.evaluate(async()=>(await window.MapDB.list())[0].uid);
await page.evaluate(u=>{location.hash=`#/edit/${u}/0`},uid); await page.waitForFunction(()=>document.getElementById('world').dataset.mode==='edit'); await page.waitForTimeout(3500);
const st=()=>page.evaluate(()=>({tool:MapView.tool(), stamp:MapView.stamp(), lit:[...document.querySelectorAll('#mw-tools [aria-pressed=true]')].map(b=>b.dataset.tool), lib:!document.getElementById('mw-stamps').hidden, trails: MapView.__place().elements.filter(e=>e.shape.trail).length, n: MapView.__place().elements.length}));
let r;
// path tool: draw a trail
await page.click('#mw-tools [data-tool="trail"]');
await page.mouse.move(420,640); await page.mouse.down(); for(let k=1;k<=30;k++){ await page.mouse.move(420+k*12, 640-Math.sin(k/5)*60-k*4); await page.waitForTimeout(10);} await page.mouse.up(); await page.waitForTimeout(400);
r=await st(); ok(r.trails===1 && r.lit.join()==='trail', 'the Path tool draws a path ('+JSON.stringify(r)+')');
// library
await page.click('#mw-tools [data-tool="stamp"]'); await page.waitForTimeout(300); r=await st(); ok(r.tool==='stamp' && !r.stamp && r.lit.join()==='stamp' && r.lib, 'the library open: only Places lit, nothing armed');
await page.locator('#mw-stamps [data-stamp]').nth(4).click(); await page.waitForTimeout(200); r=await st(); ok(r.stamp && await page.locator('#mw-tools [data-tool="stamp"] canvas').count()===1, 'a place picked is armed: its picture on the Places button');
await page.mouse.move(800,300); await page.waitForTimeout(300);
await page.mouse.click(800,300); await page.waitForTimeout(300); const n1=(await st()).n;
await page.mouse.click(860,330); await page.waitForTimeout(300); r=await st(); ok(r.n===n1+1 && r.tool==='stamp' && r.lib, 'on a computer the place stays armed, the library open, to lay the next');
await page.keyboard.press('Escape'); await page.waitForTimeout(200); r=await st(); ok(r.tool==='select' && !r.lib, 'Escape: the library closes, back to Select');
// select something and hover undo
await page.mouse.click(860,330); await page.waitForTimeout(300);
await page.hover('#mw-tools [data-act="undo"]'); await page.waitForTimeout(300);
ok(await page.isVisible('#mw-tl-sel'), 'something selected: its actions in the toolbar');
ok(/lay/.test(await page.locator('.tl-tip').innerText()), 'the tooltip of Undo says the step it takes back');
await page.click('#mw-tools [data-sel="turn"]'); await page.waitForTimeout(200);
await page.hover('#mw-tools [data-act="undo"]'); await page.waitForTimeout(200); ok(/turn/.test(await page.locator('.tl-tip').innerText()), 'turned: Undo says turn');
await page.hover('#mw-tools [data-tool="trail"]'); await page.waitForTimeout(200); 
// left-min + L
await page.mouse.click(700,760); await page.click('.left-min-btn'); await page.waitForTimeout(300); await page.keyboard.press('l'); await page.waitForTimeout(300); r=await st(); ok(r.lib && !(await page.evaluate(()=>document.getElementById('world').classList.contains('left-min'))), 'L with the left column hidden: it opens, with the library');
ok(!errs.length, `no error (${errs.join(' | ')})`); if(!fails) console.log('\nAll good'); await b.close(); server.close(); process.exit(fails?1:0);
