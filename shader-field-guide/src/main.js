import { LESSONS, GROUPS } from './lessons.js';
import { createRenderer } from './renderer.js';
import { createFallbackRenderer } from './fallback.js';
const $ = (id) => document.getElementById(id);
const list = $('lessonList');
let selected = LESSONS[0];
let renderer = null;
const effectControls = {
  1: {label:'Fog density', min:.01, max:.65, step:.01, value:.19, setter:'setFogDensity'},
  3: {label:'Bloom strength', min:.2, max:4, step:.05, value:1.55, setter:'setBloomStrength'},
};

function addLessonButton(lesson) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'lesson-button';
  b.dataset.lessonId = lesson.id;
  b.innerHTML = `<span class="index">${lesson.number}</span><span>${lesson.title}</span>`;
  b.addEventListener('click',()=>selectLesson(lesson.id));
  list.append(b);
}
for(const group of GROUPS) {
  const chapters = LESSONS.filter(x=>x.group===group.key);
  if(!chapters.length)continue;
  const h = document.createElement('div');
  h.className = 'group-label';h.textContent = group.label;list.append(h);
  chapters.forEach(addLessonButton);
}
function selectLesson(id) {
  const l=LESSONS.find(v=>v.id===id);
  if(!l)return;
  selected=l;
  const illustration=renderer?.isFallback;
  const bloomUnavailable=l.post===3 && renderer && !illustration && !renderer.stats.hdr;
  for(const b of document.querySelectorAll('.lesson-button')) {
    const active = b.dataset.lessonId===id;
    b.classList.toggle('active',active);
    b.setAttribute('aria-current',active?'true':'false');
  }
  $('chapterNumber').textContent=`${l.number} / ${l.group}`;
  $('chapterTitle').textContent=l.title;
  $('chapterIntro').textContent=l.intuition;
  $('stageInfo').textContent=l.stage;
  $('dataInfo').textContent=l.data;
  $('shaderCode').textContent=l.snippet;
  $('chapterCaveat').textContent=bloomUnavailable
    ? 'HDR bloom requires a floating-point color target. This device is rendering the base scene in SDR.'
    : illustration && l.post===3 ? 'This is an illustration of glow. No HDR or GPU shader runs here.' : l.caveat;
  $('beforeLabel').textContent=`BEFORE · ${l.baseline}`;
  $('afterLabel').textContent=bloomUnavailable ? 'HDR BLOOM UNAVAILABLE'
    : `AFTER · ${illustration && l.post===3?'Illustrative glow':l.after}`;
  $('passType').textContent=l.stage.toUpperCase();
  const control=effectControls[l.post];
  $('effectName').textContent=control?.label??'Effect intensity';
  const effect=$('effectParam');
  const enabled=!!(renderer && control && !bloomUnavailable);
  effect.disabled=!enabled;
  effect.style.opacity=enabled?'1':'.34';
  if(control){
    Object.assign(effect,{min:control.min,max:control.max,step:control.step,value:control.value});
    if(enabled)renderer[control.setter](control.value);
  }
  $('effectParamValue').textContent=enabled?control.value.toFixed(2):'—';
  $('metallic').disabled=!renderer||illustration||l.id==='blinn';
  renderer?.setLesson(l);
  history.replaceState(null,'',`#${id}`);
}
function setSlider(id, method) {
  $(id).addEventListener('input',e=>{
    $(id+'Value').textContent=(+e.target.value).toFixed(2);
    renderer?.[method](e.target.value);
  });
}
setSlider('roughness','setRoughness');setSlider('metallic','setMetallic');
$('effectParam').addEventListener('input',e=>{
  const control=effectControls[selected.post];
  if(!control||e.target.disabled)return;
  control.value=Number(e.target.value);
  $('effectParamValue').textContent=control.value.toFixed(2);
  renderer[control.setter](control.value);
});
$('split').addEventListener('input',e=>{
  const p=+e.target.value/100;
  renderer?.setSplit(p);
  $('splitLine').style.left=`${p*100}%`;
  $('splitText').textContent=`${Math.round(p*100)}%`;
});
$('resetCamera').addEventListener('click',()=>renderer?.resetCamera());
$('copyCode').addEventListener('click',async()=>{
  const text=selected.snippet;
  try{await navigator.clipboard.writeText(text);$('copyCode').textContent='Copied';}
  catch{const code=$('shaderCode');const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(code);selection.removeAllRanges();selection.addRange(range);$('copyCode').textContent='Select + copy';}
  setTimeout(()=>$('copyCode').textContent='Copy',1100);
});
const scene=$('scene');
try{
  renderer=createRenderer(scene);
  window.__shaderGuide={get selected(){return selected.id;}, renderer, lessons:LESSONS.map(l=>l.id), select:selectLesson};
  $('renderMode').textContent=renderer.stats.hdr?'HDR HALF-FLOAT · WEBGL2':'SDR FALLBACK · WEBGL2';
  const refreshMeta=()=>{$('resolution').textContent=renderer.stats.resolution;};
  setInterval(refreshMeta,1000);
}catch(error){
  console.warn('WebGL2 could not start; showing a Canvas2D illustration.',error.message);
  try {
    // A canvas that already acquired WebGL cannot switch to a 2D context.
    const illustration=scene.cloneNode(false);
    scene.replaceWith(illustration);
    renderer = createFallbackRenderer(illustration);
    window.__shaderGuide={get selected(){return selected.id;}, renderer, lessons:LESSONS.map(l=>l.id), select:selectLesson};
    $('renderMode').textContent='ILLUSTRATIVE 2D FALLBACK · NOT GPU SHADERS';
    $('resolution').textContent='WebGL2 did not start';
    document.querySelector('.render-meta span:last-child').textContent='2D approximation · GPU version in WebGL2 browsers';
  } catch(second) {
    $('error').style.display='grid';
    $('error').textContent=`Rendering unavailable: ${second.message}`;
    $('renderMode').textContent='RENDERING UNAVAILABLE';
  }
}
const requested=location.hash.slice(1);
selectLesson(LESSONS.some(l=>l.id===requested)?requested:LESSONS[0].id);
