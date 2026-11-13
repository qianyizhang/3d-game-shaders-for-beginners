/** Render the offline gallery from the same catalog used to capture the assets. */
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const source = "../../../project-docs/research/single-scenes.md";
const bom = {
  "weather-station": "canal-weather-station",
  "ferry-landing": "lantern-ferry-landing",
  glasshouse: "glasshouse-and-koi-pond",
  "night-market": "night-market-repair-stall",
  "puppet-yard": "water-puppet-makers-yard",
};
const lab = "http://127.0.0.1:4317/";
const live = (entry, shot) => `${lab}?scene=/mill-assets/scene-gallery/${entry.slug}/${shot.slug}.json`;

export function gallery(entries, [width, height], { originalMill, concepts, links }) {
  const img = (src, alt, w, h, first = false) =>
    `<img src="${escape(src)}" alt="${escape(alt)}" width="${w}" height="${h}" ${first ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  const caption = (label, name, description) =>
    `<figcaption><span class="label">${escape(label)}</span><strong>${escape(name)}</strong>${description ? `<span>${escape(description)}</span>` : ""}</figcaption>`;
  const capture = (file, label, name, description, link, first = false) => {
    const url = `captures/${file}.png`;
    return `<figure><a class="media" href="${link ?? url}">${img(url, name, width, height, first)}</a>${caption(label, name, description)}</figure>`;
  };
  const index = entries.map((entry, i) => capture(
    `${entry.slug}-${entry.shots[0].slug}`, `0${i + 1} / Lab scene`, entry.title, entry.summary, `#${entry.slug}`, i === 0,
  )).join("");
  const details = entries.map((entry, i) => {
    const close = entry.shots.find(shot => shot.slug === "waterline") ?? entry.shots[0];
    const alternate = entry.shots.slice(1).filter(shot => shot !== close);
    const concept = `../../mill-scene-concepts/boards/${entry.concept}.png`;
    const partCards = entry.parts.map(part => capture(
      part.role === "water" ? `${entry.slug}-mask` : `${entry.slug}-part-${part.slug}`,
      part.role === "water" ? "Water mask · in scene" : "Isolated mesh", part.title, part.description,
    )).join("");
    return `<section class="kit" id="${entry.slug}" aria-labelledby="${entry.slug}-title">
      <div class="kit-head"><div><p class="label">Scene 0${i + 1} / ${entry.parts.length} parts</p>
      <h2 id="${entry.slug}-title">${escape(entry.title)}</h2></div>
      <div class="links"><a class="action" href="${live(entry, entry.shots[0])}">Open assembled scene ↗</a><a href="${live(entry, close)}">Play Waterline ↗</a>
      <a href="${source}#${bom[entry.concept]}">Parts list</a></div></div>
      <p>${escape(entry.summary)}</p>
      ${entry.creatures.length ? `<p><strong>Rigged:</strong> ${escape(entry.creatures.join(", "))}. <a href="${live(entry, close)}&amp;lesson=pose">Pose joints: refraction and shadows ↗</a></p>` : ""}
      ${entry.creatures.length ? `<details><summary>Posing A/B: refraction and shadows</summary>
        <p>The clock, camera, sun and refraction index stay fixed. B rotates the selected tail joint by 32° from the frozen pose.</p>
        <div class="pair">
          ${capture(`${entry.slug}-pose-refraction-a`, "Pose A", "Refracted color", "Frozen reference")}
          ${capture(`${entry.slug}-pose-refraction-b`, "Pose B", "Refracted color", "Tail joint rotated")}
          ${capture(`${entry.slug}-pose-shadow-a`, "Pose A", "Shadow visibility", "White receives direct light; dark areas are blocked.")}
          ${capture(`${entry.slug}-pose-shadow-b`, "Pose B", "Shadow visibility", "Follow the displaced shadow on the bed.")}
        </div>
      </details>` : ""}
      <details><summary>Waterline A/B and alternate views</summary>
        <p>Follow ${escape(entry.subject)} to the water. The pair holds frame 60, sun pitch ${close.sun}° and the same camera; only the relative index changes.</p>
        <div class="pair">
          ${capture(`${entry.slug}-${close.slug}`, "Waterline · A", "Index 1.050", "Reference")}
          ${capture(`${entry.slug}-bend`, "Waterline · B", "Index 0.935", "Experiment")}
        </div>
        <div class="shelf">
          ${alternate.map(shot => capture(`${entry.slug}-${shot.slug}`, "Lab view", shot.title, shot.description, live(entry, shot))).join("")}
          ${concepts.has(entry.concept) ? `<figure><a class="media" href="${concept}">${img(concept, `Original concept art for ${entry.title}`, 1536, 1024)}</a>
          ${caption("ImageGen · design reference", entry.title, "Concept from the earlier research. The other cards are actual Lab renders.")}</figure>` : ""}
        </div>
      </details>
      <details><summary>Material study: UVs, color and normals</summary>
        <p>${escape(entry.materialNote)} The checker uses the mesh UVs; the normal source changes shading directions without moving the geometry.</p>
        <p><a href="${live(entry, close)}&amp;lesson=material">Try the material lesson ↗</a></p>
        <div class="pair">
          ${capture(`${entry.slug}-material-albedo`, "Material · color", "Authored albedo", "Base color before lighting.")}
          ${capture(`${entry.slug}-material-uv`, "Material · UVs", "UV checker", "Squares reveal orientation, scale and seams.")}
          ${capture(`${entry.slug}-material-flat`, "Material · normals", "Flat normals", "The shape’s normals before surface relief.")}
          ${capture(`${entry.slug}-material-sampled`, "Material · normals", "Sampled normals", "Relief comes from the tangent-space map.")}
        </div>
      </details>
      <h3>Parts</h3>
      <div class="shelf">${partCards}</div>
    </section>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Scene &amp; part gallery · Mill Shader Lab</title>
<style>
  :root { color-scheme:dark; --ink:#f2f4de; --muted:#bacbc1; --paper:#142624; --card:#1d3430; --border:#3c5850; --accent:#ecbc7f; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:1rem/1.55 system-ui,sans-serif; }
  a { color:var(--accent); text-underline-offset:.23em; }
  a:focus-visible, summary:focus-visible { outline:3px solid #ffd6a4; outline-offset:4px; }
  a.media { display:block; }
  main, .mast { width:min(100% - 2rem, 78rem); margin-inline:auto; }
  .mast { border-bottom:1px solid var(--border); padding:1rem 0; display:flex; flex-wrap:wrap; justify-content:space-between; gap:.5rem 1rem; align-items:center; }
  .mast strong { text-transform:uppercase; letter-spacing:.13em; font-size:.78rem; }
  .mast a { padding:.35rem .3rem; }
  .links { display:flex; gap:.35rem 1rem; align-items:center; flex-wrap:wrap; }
  .links a { min-height:2rem; display:inline-flex; align-items:center; }
  header { padding:clamp(1.6rem,5vw,4rem) 0 1.15rem; }
  h1,h2 { font:500 clamp(2rem,6vw,5rem)/1 Georgia,serif; letter-spacing:-.037em; margin:.28rem 0 .8rem; }
  h2 { font-size:clamp(1.8rem,4vw,3.1rem); }
  h3 { font-size:1.14rem; margin:1.4rem 0 .55rem; }
  p { color:var(--muted); margin:.45rem 0 .9rem; max-width:75ch; }
  .label { display:block; color:var(--accent); text-transform:uppercase; letter-spacing:.12em; font-size:.7rem; font-weight:750; }
  .index { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1rem; }
  .index figure:first-child { grid-column:span 2; grid-row:span 2; }
  .index figure:first-child img { height:100%; object-fit:cover; }
  .index figure:first-child .media { flex:1; display:flex; align-items:stretch; }
  .index figure { display:flex; flex-direction:column; }
  .index figcaption { flex:0; }
  figure { margin:0; min-width:0; background:var(--card); border:1px solid var(--border); }
  figure img { display:block; width:100%; height:auto; }
  figcaption { color:var(--muted); font-size:.9rem; padding:.68rem .8rem .78rem; }
  figcaption strong { display:block; color:var(--ink); font-size:1rem; }
  .index figcaption strong { font-size:1.12rem; }
  section.kit { scroll-margin-top:1rem; border-top:1px solid var(--border); margin-top:3.7rem; padding-top:1.7rem; }
  .kit-head { display:flex; flex-wrap:wrap; justify-content:space-between; gap:.45rem 1rem; align-items:center; }
  .action { background:var(--accent); color:#172522; padding:.45rem .73rem; font-weight:750; border-radius:.2rem; text-decoration:none; }
  .pair,.shelf { display:grid; gap:.85rem; margin:1rem 0; }
  .pair { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .shelf { grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr)); }
  .shelf img { aspect-ratio:4/3; object-fit:cover; }
  details { padding:.65rem 1rem; background:#1a302c; border:1px solid var(--border); }
  summary { cursor:pointer; font-weight:700; padding:.22rem 0; }
  pre { background:var(--card); color:var(--ink); padding:.9rem; white-space:pre-wrap; overflow-wrap:anywhere; }
  footer { border-top:1px solid var(--border); margin:2.5rem 0; padding-top:1rem; }
  @media(max-width:57rem) { .index { grid-template-columns:repeat(2,minmax(0,1fr)); } .index figure:first-child { grid-row:auto; } }
  @media(max-width:36rem) { .index,.pair { grid-template-columns:minmax(0,1fr); } .index figure:first-child { grid-column:auto; } .mast { align-items:flex-start; } }
</style>
</head>
<body>
<nav class="mast" aria-label="Gallery"><strong>Mill Shader Lab / Asset library</strong><div class="links"><a href="#scenes">Scenes</a><a href="#station-kits">Parts</a><a href="#play">Start Lab</a></div></nav>
<main>
<header id="scenes">
  <p class="label">Five playable kits</p>
  <h1>Scenes &amp; parts</h1>
  <p>Pick a scene to see how it’s built. Open the assembled scene in the Lab, or compare a matched Waterline pair before inspecting the parts.</p>
</header>
<div class="index">${index}</div>
<div id="station-kits">${details}</div>
<section class="kit" id="play">
  <h2>Start the Lab</h2>
  <p>The gallery opens offline. To use the live links, run this command from the checkout root:</p>
  <pre><code>npm --prefix mill-shader-lab run dev -- --port 4317 --strictPort</code></pre>
  ${originalMill ? `<div class="shelf">
    ${capture("original-mill", "Original scene · local baseline", "Original mill", "Opens the original 20-lesson Lab.", lab)}
  </div>` : ""}
  ${links.length ? `<p>${links.map(([path, label]) => `<a href="${escape(path)}">${escape(label)}</a>`).join(" · ")}</p>` : ""}
</section>
<footer><a href="../../../project-docs/scene-gallery.md">Build, provenance and checks</a></footer>
</main>
</body>
</html>`;
}
