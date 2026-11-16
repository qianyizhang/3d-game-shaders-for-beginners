import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const repo=fileURLToPath(new URL('..',import.meta.url));
const root=resolve(process.env.DCC_GALLERY_DIR??resolve(repo,'.local/dcc/gallery'));
const base=pathToFileURL(root+'/index.html').href;
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const original=WebGL2RenderingContext.prototype.bufferData;
  window.bufferUploads=0;
  WebGL2RenderingContext.prototype.bufferData=function(...args){window.bufferUploads++;return original.apply(this,args);};
 });
 const open=async(id)=>{
  await page.goto(base+'#'+id);
  await page.waitForFunction(()=>document.querySelector('#viewer-status').dataset.state==='ready');
 };
 const pixels=async()=>createHash('sha256').update(await page.locator('#model').screenshot()).digest('hex');
 const scrub=async(value)=>page.locator('#motion-time').evaluate((e,value)=>{e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));},value);
 for(const id of ['object/glasshouse/vermilion-koi','object/glasshouse/amber-koi','object/puppet-yard/water-dragon']) {
  await open(id);
  assert.ok(await page.locator('#motion-controls').isVisible());
  assert.ok(await page.locator('#motion-play').isDisabled());
  const rest=await pixels(), uploads=await page.evaluate(()=>window.bufferUploads);
  const clips=await page.locator('#motion-clip option').evaluateAll(xs=>xs.map(x=>x.value).filter(Boolean));
  assert.equal(clips.length,3);
  for(const clip of clips) {
   await page.locator('#motion-clip').selectOption(clip);
   assert.equal(await page.locator('#motion-play').textContent(),'Play');
   const start=await pixels();await scrub(250);const quarter=await pixels();
   await scrub(650);assert.notEqual(await pixels(),quarter,`${id}/${clip} must move`);
   await scrub(1000);assert.equal(await pixels(),start,`${id}/${clip} loop seam`);
   await scrub(250);assert.equal(await pixels(),quarter);
  }
  assert.equal(await page.evaluate(()=>window.bufferUploads),uploads,'Playback must reuse uploaded meshes');
  await page.locator('#motion-rest').click();assert.equal(await pixels(),rest);
  await page.locator('#rig-inspector summary').click();
  await page.locator('#joint-angle').press('End');assert.notEqual(await pixels(),rest);
  await page.locator('#motion-rest').click();assert.equal(await pixels(),rest);
  await page.locator('#motion-clip').selectOption(clips[0]);
  await page.locator('#motion-play').click();
  await page.waitForFunction(()=>Number(document.querySelector('#motion-time').value)>30);
  await page.locator('#motion-play').click();const paused=await pixels();
  await page.waitForTimeout(100);assert.equal(await pixels(),paused);
  await page.locator('#motion-play').click();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.locator('#motion-play').textContent(),'Play');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.locator('#motion-play').textContent(),'Play','No automatic resume after hiding');
 }
 await page.locator('#back-results').click();assert.ok(await page.locator('#motion-controls').isHidden());
 await open('object/glasshouse/terracotta-planter');assert.ok(await page.locator('#motion-controls').isHidden());
 await open('object/puppet-yard/water-dragon');
 // Offscreen work stops, and changing the OS motion preference stops a running clip.
 await page.locator('#motion-clip').selectOption('idle');
 await page.locator('#motion-play').click();
 await page.evaluate(()=>{const spacer=document.createElement('div');spacer.id='test-spacer';spacer.style.height='3000px';document.body.append(spacer);scrollTo(0,document.body.scrollHeight);});
 await page.waitForFunction(()=>document.querySelector('#motion-play').textContent==='Play');
 await page.evaluate(()=>{document.querySelector('#test-spacer').remove();scrollTo(0,0);});
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('#motion-play').click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.querySelector('#motion-play').textContent==='Play');
 await page.setViewportSize({width:360,height:1000});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#rig-inspector summary').click();
 assert.ok(await page.locator('#joint-angle').isVisible());
 // A broken rig must fail visibly, with no motion controls left active.
 await page.evaluate(()=>{window.DCC_CATALOG.scenes['puppet-yard'].rigs[0].joints[0].parent='missing';});
 await page.locator('#back-results').click();
 await page.goto(base+'#object/puppet-yard/water-dragon');
 // goto with a fragment preserves the mutated document.
 await page.waitForFunction(()=>document.querySelector('#viewer-status').dataset.state==='error');
 assert.match(await page.locator('#viewer-status').textContent(),/Invalid motion/);
 assert.ok(await page.locator('#motion-controls').isHidden());
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#viewer-status').dataset.state==='ready');
 await page.locator('#motion-clip').selectOption('idle');
 await page.locator('#motion-play').click();
 await page.locator('#model').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
 await page.waitForFunction(()=>document.querySelector('#viewer-status').dataset.state==='unavailable');
 assert.ok(await page.locator('#motion-controls').isHidden());
 assert.equal(await page.locator('#motion-play').textContent(),'Play');
 assert.deepEqual(errors,[]);
 console.log('PASS: nine clips, deterministic scrub/loop/reset, joint inspection, GPU reuse, explicit play/pause, background stop, reduced-motion static default, navigation, narrow view and malformed-rig failure.');
} finally {await browser.close();}
