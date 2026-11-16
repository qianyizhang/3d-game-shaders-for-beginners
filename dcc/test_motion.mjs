import assert from 'node:assert/strict';
import {test} from 'node:test';
import '../.local/dcc/compiled/web/motion.js';
const {create,point,identity} = globalThis.DCCMotion;
const rig = () => ({name:'Fixture',joints:[
  {id:'root',pivot:[0,0,0],axis:[0,0,1],parts:['body'],poseLimit:90},
  {id:'child',parent:'root',pivot:[1,0,0],axis:[0,0,1],parts:['fin'],poseLimit:45},
],clips:[{id:'wave',label:'Wave',duration:2,tracks:{root:{amplitude:30,phase:0,bias:0},child:{amplitude:20,phase:-.25,bias:0}}},
{id:'demo',label:'Demo',duration:4,tracks:{child:{keys:[[0,0],[.25,40],[.5,-40],[.75,0],[1,0]]}}}]});
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9,`${a} vs ${b}`));
test('hierarchy rotates around rest-world pivots, preserves lengths, and isolates a child',()=>{
 const m=create(rig(),['body','fin']);
 close(point(m.transforms('',0,{root:90}).get('fin'),[2,0,0]),[0,2,0]);
 close(point(m.transforms('',0,{child:45}).get('fin'),[1,0,0]),[1,0,0]);
 close(m.transforms('',0,{child:45}).get('body'),identity());
 const p=point(m.transforms('',0,{root:60,child:30}).get('fin'),[2,0,0]);
 close(p,[.5,Math.sqrt(3)/2+1,0]);
});
test('clips loop deterministically and manual rest restores the exact identity',()=>{
 const m=create(rig(),['body','fin']);
 for(const clip of m.clips) {
  assert.deepEqual(m.angles(clip.id,0),m.angles(clip.id,clip.duration));
  for(let i=0;i<100;i++) for(const [id,value] of Object.entries(m.angles(clip.id,i*.013)))
   assert.ok(Math.abs(value)<=m.joints.find(j=>j.id===id).poseLimit);
 }
 assert.notDeepEqual(m.transforms('wave',.5),m.transforms('wave',0));
 for(const matrix of m.transforms().values())close(matrix,identity());
});
test('malformed hierarchy, clips, limits and time fail before rendering',()=>{
 for(const mutate of [r=>r.joints[0].parent='child',r=>r.joints[1].parts=['body'],r=>r.joints[1].axis=[0,0,0],
 r=>r.clips[0].tracks.root.amplitude=100,r=>r.clips[0].duration=0,r=>r.clips[0].tracks.missing={},
 r=>r.clips[1].tracks.child.keys[1]=[0,40],r=>r.clips[1].tracks.child.keys.at(-1)[1]=10]) {
  const r=rig();mutate(r);assert.throws(()=>create(r,['body','fin']),/Invalid motion/);
 }
 const m=create(rig(),['body','fin']);
 assert.throws(()=>m.transforms('wave',NaN),/time/);
 assert.throws(()=>m.transforms('missing'),/unknown clip/);
 assert.throws(()=>m.transforms('',0,{child:46}),/manual angle/);
});

test('real authored rigs loop within limits; puppet head motion leaves its tail fixed', async()=>{
 const {execFileSync}=await import('node:child_process');
 const root=new URL('..',import.meta.url);
 const rigs=JSON.parse(execFileSync('python3.12',['-c',
  'import json; from dcc.sources.scene_gallery_glass_market import build_glasshouse; from dcc.sources.scene_gallery_puppet import build_puppet; print(json.dumps(build_glasshouse().rigs+build_puppet().rigs))'],{cwd:root,encoding:'utf8'}));
 for(const rig of rigs) {
  const m=create(rig,rig.joints.flatMap(j=>j.parts));
  assert.equal(m.clips.length,3);
  for(const clip of m.clips) {
   assert.deepEqual(m.angles(clip.id,0),m.angles(clip.id,clip.duration));
   for(let i=0;i<=100;i++)for(const [id,angle] of Object.entries(m.angles(clip.id,clip.duration*i/100))) {
    assert.ok(Math.abs(angle)<=m.joints.find(j=>j.id===id).poseLimit);
    assert.ok([...m.transforms(clip.id,clip.duration*i/100).values()].flat().every(Number.isFinite));
   }
  }
  if(rig.name==='Water dragon') {
   const posed=m.transforms('',0,{'dragon-head':14});
   close(posed.get('dragon-tail-4'),identity());
   assert.notDeepEqual(posed.get('dragon-head'),identity());
   const rootTurn=m.transforms('',0,{'dragon-body':10});
   assert.notDeepEqual(rootTurn.get('dragon-head'),identity());
   assert.notDeepEqual(rootTurn.get('dragon-tail-4'),identity());
  }
 }
});
