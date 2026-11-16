/**
 * Marked illustration fallback for browsers/environment where WebGL2 is blocked.
 * These Canvas2D drawings ARE NOT shader executions. The WebGL2 path remains authoritative.
 */
export function createFallbackRenderer(canvas) {
  const ctx=canvas.getContext('2d');
  if(!ctx) throw new Error('Neither WebGL2 nor Canvas2D is available.');
  const W=860,H=520;
  const before=document.createElement('canvas'),after=document.createElement('canvas');
  before.width=after.width=W;before.height=after.height=H;
  let lesson={shader:0,beforeShader:1,post:0},split=.5,rough=.3,fog=.19,bloom=1.55, angle=0;
  let dirty=true;
  const ref=before.getContext('2d',{willReadFrequently:true});
  const fx=after.getContext('2d',{willReadFrequently:true});
  const grd=(c,x,y,r,stops)=>{
    const g=c.createRadialGradient(x-r*.25,y-r*.4,2,x,y,r);
    for(const [p,col] of stops)g.addColorStop(p,col);
    return g;
  };
  function scene(c,shader,post) {
    c.clearRect(0,0,W,H);
    const bg=c.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#142534');bg.addColorStop(1,'#233943');c.fillStyle=bg;c.fillRect(0,0,W,H);
    const horizon=350;
    c.fillStyle='#1e3440';c.fillRect(0,horizon,W,H-horizon);
    c.strokeStyle='#5a747c2c';c.lineWidth=1;
    for(let i=-8;i<=8;i++){const xx=W/2+i*76;c.beginPath();c.moveTo(W/2,horizon-2);c.lineTo(xx+i*42,H);c.stroke();}
    for(let i=0;i<9;i++) {const t=i/9;c.beginPath();let y=horizon+Math.pow(t,1.5)*(H-horizon);c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
    const sx=430+Math.sin(angle)*13,sy=272,rr=135;
    c.save();c.translate(sx,sy+148);c.scale(1,.26);
    c.fillStyle=grd(c,0,0,180,[[0,'#071c26a8'],[1,'#071c2600']]);
    c.beginPath();c.arc(0,0,180,0,2*Math.PI);c.fill();c.restore();
    // The back half of the decorative orbit.
    c.save();c.translate(sx,sy);c.rotate(-.33);
    c.strokeStyle='#907343';c.lineWidth=22;c.beginPath();c.ellipse(0,0,197,88,0,Math.PI,2*Math.PI);c.stroke();
    c.strokeStyle='#dfb96e';c.lineWidth=8;c.beginPath();c.ellipse(0,0,195,87,0,Math.PI,2*Math.PI);c.stroke();c.restore();
    // Small blue specimen.
    c.beginPath();c.arc(185,352,57,0,2*Math.PI);
    c.fillStyle=grd(c,185,352,64,[[0,'#aebce9'],[.4,'#586cae'],[1,'#26386e']]);c.fill();
    // Gold block.
    c.save();c.translate(677,350);c.rotate(-.16);
    const cube=c.createLinearGradient(-45,-48,45,45);cube.addColorStop(0,'#f9d38f');cube.addColorStop(1,'#66503a');
    c.fillStyle=cube;c.fillRect(-49,-49,98,98);c.strokeStyle='#e1ba67';c.lineWidth=3;c.strokeRect(-49,-49,98,98);c.restore();
    // Main specimen: shaded sphere, same silhouette across all 17 sections.
    c.beginPath();c.arc(sx,sy,rr,0,2*Math.PI);c.closePath();
    if(shader===3) {
      c.fillStyle=grd(c,sx,sy,rr,[[0,'#6ed9c4'],[.34,'#60aeb4'],[.35,'#3b8790'],[.72,'#377783'],[.73,'#1b596a'],[1,'#164251']]);
    } else if(shader===1) {
      c.fillStyle=grd(c,sx,sy,rr,[[0,'#66b0ac'],[.43,'#4b999d'],[1,'#194457']]);
    } else if(shader===5) {
      c.fillStyle='#4596a0';
    } else {
      c.fillStyle=grd(c,sx,sy,rr,[[0,'#d5f5e9'],[Math.max(.04,.26*rough),'#6accbf'],[.48,'#347f8a'],[1,'#102d40']]);
    }
    c.fill();
    if(shader===0||shader===2||shader===4||shader===6){
      c.save();c.beginPath();c.arc(sx,sy,rr,0,Math.PI*2);c.clip();
      const intensity=shader===2?.71:Math.max(.25,1.0-rough*.5);
      c.fillStyle=grd(c,sx-37,sy-44,rr*.50,[[0,`rgba(255,255,239,${.8*intensity})`],[1,'rgba(200,245,247,0)']]);
      c.beginPath();c.ellipse(sx-40,sy-54,28+rough*36,17+rough*40,-.55,0,Math.PI*2);c.fill();
      c.restore();
    }
    if(shader===4){c.lineWidth=13;c.strokeStyle='#a5ecf6';c.stroke();}
    if(shader===6){
      c.save();c.beginPath();c.arc(sx,sy,rr,0,Math.PI*2);c.clip();
      c.lineWidth=1.2;c.strokeStyle='#c8e5e848';for(let i=-7;i<8;i++){c.beginPath();c.moveTo(sx-160,sy+i*21);c.lineTo(sx+160,sy+i*21-20);c.stroke();}c.restore();
    }
    // Front half of orbital ring.
    c.save();c.translate(sx,sy);c.rotate(-.33);
    c.strokeStyle='#a0732d';c.lineWidth=24;c.beginPath();c.ellipse(0,0,197,88,0,0,Math.PI);c.stroke();
    c.strokeStyle='#f9d58b';c.lineWidth=10;c.beginPath();c.ellipse(0,0,197,88,0,.05,Math.PI-.05);c.stroke();c.restore();
    // Bright orb, demonstrates why HDR bloom needs an emission source.
    c.beginPath();c.arc(676,123,18,0,Math.PI*2);c.fillStyle='#ffb36b';c.shadowColor='#ffb36b';c.shadowBlur=post===3?bloom*75:9;c.fill();c.shadowBlur=0;
    // Small details keep the same image recognizable for comparisons.
    c.strokeStyle='#ffffff28';c.lineWidth=1;c.beginPath();c.moveTo(35,35);c.lineTo(35,75);c.moveTo(35,35);c.lineTo(75,35);c.stroke();
    if(post===2){c.beginPath();c.arc(sx,sy,rr+1,0,2*Math.PI);c.strokeStyle='#081a25';c.lineWidth=7;c.stroke();}
    if(post===1){c.fillStyle=`rgba(128,159,180,${Math.min(.49,fog*1.8)})`;c.fillRect(0,150,W,H-150);}
    if(post===7){c.fillStyle='#a9562014';c.fillRect(0,0,W,H);c.fillStyle='#2c5c8028';c.fillRect(0,0,W,230);}
    if(post===10){c.clearRect(0,0,W,H);c.fillStyle='#818dce';c.fillRect(0,0,W,H);c.beginPath();c.arc(sx,sy,rr,0,Math.PI*2);c.fillStyle=grd(c,sx,sy,rr,[[0,'#7df3df'],[.4,'#86a3e6'],[1,'#5159a8']]);c.fill();}
    if(post===11){c.clearRect(0,0,W,H);c.fillStyle='#090e14';c.fillRect(0,0,W,H);c.fillStyle='#a2a9af';c.beginPath();c.arc(sx,sy,rr,0,Math.PI*2);c.fill();}
  }
  function apply(c,post) {
    if(![4,5,6,8,9,12].includes(post))return;
    const im=c.getImageData(0,0,W,H),a=im.data;
    if(post===4||post===12){
      const clone=new Uint8ClampedArray(a),weight=post===4?[.18,.14]:[2.2,-.30];
      for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
        const p=(y*W+x)*4;
        for(let ch=0;ch<3;ch++) {
          const nei=(clone[p-4+ch]+clone[p+4+ch]+clone[p-W*4+ch]+clone[p+W*4+ch]);
          a[p+ch]=post===4?clone[p+ch]*.28+nei*.18:clone[p+ch]*weight[0]+nei*weight[1];
        }
      }
    }else if(post===5){for(let i=0;i<a.length;i+=4)for(let ch=0;ch<3;ch++)a[i+ch]=Math.round(a[i+ch]/42.5)*42.5;}
    else if(post===6){const clone=new Uint8ClampedArray(a),scale=11;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=(y*W+x)*4,q=((Math.min(H-1,Math.floor(y/scale)*scale+5))*W+Math.min(W-1,Math.floor(x/scale)*scale+5))*4;for(let ch=0;ch<3;ch++)a[p+ch]=clone[q+ch];}}
    else if(post===8){for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=(y*W+x)*4,n=(Math.sin((x*12.989+y*78.233))*43758.5453)%1;for(let ch=0;ch<3;ch++)a[p+ch]+=n*18;}}
    else if(post===9){const clone=new Uint8ClampedArray(a);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=(y*W+x)*4,dx=Math.round((x-W*.5)/55),rx=Math.max(0,Math.min(W-1,x+dx)),bx=Math.max(0,Math.min(W-1,x-dx));a[p]=clone[(y*W+rx)*4];a[p+2]=clone[(y*W+bx)*4+2];}}
    c.putImageData(im,0,0);
  }
  function draw(){
    const w=canvas.clientWidth||860,h=canvas.clientHeight||520,dpr=Math.min(devicePixelRatio||1,1.5);
    const pxW=Math.round(w*dpr),pxH=Math.round(h*dpr);
    if(canvas.width!==pxW||canvas.height!==pxH){canvas.width=pxW;canvas.height=pxH;}
    scene(ref,lesson.beforeShader,0);scene(fx,lesson.shader,lesson.post);apply(fx,lesson.post);
    ctx.clearRect(0,0,pxW,pxH);
    ctx.drawImage(before,0,0,pxW,pxH);
    ctx.save();ctx.beginPath();ctx.rect(pxW*split,0,pxW*(1-split),pxH);ctx.clip();ctx.drawImage(after,0,0,pxW,pxH);ctx.restore();
    dirty=false;
  }
  function raf(){if(dirty)draw();requestAnimationFrame(raf);}
  requestAnimationFrame(raf);
  return {
    stats:{hdr:false,resolution:'Illustrative Canvas2D',gamma:'not a shader renderer'},
    isFallback:true,
    setLesson(v){lesson=v;dirty=true;},setSplit(v){split=+v;dirty=true;},
    setRoughness(v){rough=+v;dirty=true;},setMetallic(){},
    setFogDensity(v){fog=+v;dirty=true;},setBloomStrength(v){bloom=+v;dirty=true;},
    resetCamera(){angle=0;dirty=true;},setPlaying(){},renderOnce(){draw();},dispose(){}
  };
}
