import { LESSONS, GROUPS } from './lessons.js';
import { createRenderer } from './renderer.js';
import { createFallbackRenderer } from './fallback.js';
const $ = (id) => document.getElementById(id);
const list = $('lessonList');
let selected = LESSONS[0];
let renderer = null;

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
  $('chapterCaveat').textContent=l.caveat;
  $('beforeLabel').textContent=`BEFORE · ${l.baseline}`;
  $('afterLabel').textContent=`AFTER · ${l.after}`;
  $('passType').textContent=l.stage.toUpperCase();
  $('effectName').textContent=l.post===1?'Fog density':l.post===3?'Bloom strength':'Effect intensity';
  const effect=$('effectParam');
  const enabled=l.post===1||l.post===3;
  effect.disabled=!enabled;
  effect.style.opacity=enabled?'1':'.34';
  if(l.post===1){effect.min='.01';effect.max='.65';effect.step='.01';effect.value='.19';}
  if(l.post===3){effect.min='.2';effect.max='4';effect.step='.05';effect.value='1.55';}
  $('effectParamValue').textContent=enabled?Number(effect.value).toFixed(2):'—';
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
  $('effectParamValue').textContent=(+e.target.value).toFixed(2);
  if(selected.post===1)renderer?.setFogDensity(e.target.value);
  if(selected.post===3)renderer?.setBloomStrength(e.target.value);
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
try{
  renderer=createRenderer($('scene'));
  window.__shaderGuide={get selected(){return selected.id;}, renderer, lessons:LESSONS.map(l=>l.id), select:selectLesson};
  $('renderMode').textContent=renderer.stats.hdr?'HDR HALF-FLOAT · WEBGL2':'SDR FALLBACK · WEBGL2';
  const refreshMeta=()=>{$('resolution').textContent=renderer.stats.resolution;};
  setInterval(refreshMeta,1000);
}catch(error){
  console.warn('WebGL2 unavailable; activating a clearly labeled Canvas2D illustration.',error.message);
  try {
    renderer = createFallbackRenderer($('scene'));
    window.__shaderGuide={get selected(){return selected.id;}, renderer, lessons:LESSONS.map(l=>l.id), select:selectLesson};
    $('renderMode').textContent='ILLUSTRATIVE 2D FALLBACK · NOT GPU SHADERS';
    $('resolution').textContent='WebGL2 unavailable in this environment';
    document.querySelector('.render-meta span:last-child').textContent='2D approximation · GPU version in WebGL2 browsers';
  } catch(second) {
    $('error').style.display='grid';
    $('error').textContent=`Rendering unavailable: ${second.message}`;
    $('renderMode').textContent='RENDERING UNAVAILABLE';
  }
}
selectLesson(location.hash.slice(1)||'pbr');
