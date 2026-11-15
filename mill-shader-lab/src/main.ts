import { loadAssets } from "./assets";
import { GPU } from "./gpu";
import { MillLab, defaultEdit } from "./lab";
import { inspectionCatalog, inspectionGroups, type BufferName } from "./inspection";
import type { Effect } from "./effects";
import { effectPanel, firstLesson, lessons, practiceLessons, waterlineLesson, type Control, type Lesson } from "./lessons";
import { bookmarks, type Bookmark, type CameraPose } from "./state";

function byId<T extends HTMLElement = HTMLElement>(key: string): T {
  const value = document.getElementById(key);
  if (!value) throw new Error(`Missing UI element: ${key}`);
  return value as T;
}
const canvas = byId<HTMLCanvasElement>("scene");
const status = byId("status");
const workbench = byId("workbench");
const failure = byId("fallback");
const showFailure = (error: unknown) => {
  status.textContent = "Live exercises unavailable";
  byId("failure").textContent = error instanceof Error ? error.message : String(error);
  workbench.hidden = true;
  failure.hidden = false;
};
byId("retry").onclick = () => location.reload();

async function start() {
  const params = new URLSearchParams(location.search);
  const gpu = new GPU(canvas, params.get("gpu"));
  const assets = await loadAssets(params.get("scene") ?? undefined);
  const lab = new MillLab(canvas, assets, gpu);
  const { state } = lab;
  const practice = assets.practice;
  const waterlineOnly = !!assets.waterline && !practice;
  const availableLessons = practice ? practiceLessons(assets.waterline?.subject, assets.rigs.length > 0) :
    waterlineOnly ? [waterlineLesson(assets.waterline?.subject)] : lessons;
  const sceneLesson = availableLessons.find(entry => entry.id === "refraction") ?? firstLesson;
  let dirty = true;
  let lost = false;
  let lesson: Lesson = sceneLesson;
  const paint = () => { dirty = true; };
  const button = (key: string, action: () => void) => { byId<HTMLButtonElement>(key).onclick = action; };
  const select = <T extends string>(key: string, values: readonly T[], action: (value: T) => void) => {
    const element = byId<HTMLSelectElement>(key);
    for (const value of values) element.add(new Option(value, value));
    element.onchange = () => { const value = values.find(item => item === element.value); if (value) action(value); };
    return element;
  };
  const labelClock = () => { byId("clock").textContent = `Frame ${state.frame} · ${state.time.toFixed(2)} s`; };
  const labelPlayback = () => { byId("play").textContent = state.playing ? "Pause" : "Play"; };
  const refreshInspection = () => {
    const { info, shader } = lab.inspected();
    byId("chain").textContent = `${info.producer} → ${info.consumer}`;
    byId("description").textContent = info.description;
    byId("view-label").textContent = `${state.side} · ${info.name}`;
    if (byId<HTMLDetailsElement>("shader-code").open) {
      const stage = byId<HTMLSelectElement>("shader-stage").value === "vertex" ? "vertex" : "fragment";
      byId("code").textContent = "#version 300 es\n" + shader[stage];
    }
  };
  const syncSide = () => {
    const side = state.side;
    byId("side-a").setAttribute("aria-pressed", String(side === "A"));
    byId("side-b").setAttribute("aria-pressed", String(side === "B"));
    refreshInspection();
    paint();
  };
  const play = () => {
    state.togglePlayback();
    labelPlayback();
  };
  const sun = byId<HTMLInputElement>("sun");
  const bend = byId<HTMLInputElement>("bend");
  const compile = byId("compile");
  const marker = byId("focus-marker");
  const point = byId("point");

  const updateSun = (value: number) => {
    if (!state.setSun(value).applied) return;
    sun.value = String(value);
    byId("sun-value").textContent = `${value}°`;
    paint();
  };
  const bookmark = select("bookmark", waterlineOnly ? ["Waterline"] : Object.keys(bookmarks) as Bookmark[], open);
  function open(name: Bookmark, entryPose?: CameraPose) {
    if (!state.openBookmark(name, entryPose).applied) return;
    syncBookmark();
  }
  function syncBookmark() {
    bookmark.value = state.bookmark;
    byId("stage-title").textContent = state.bookmark;
    marker.hidden = true;
    point.hidden = true;
    sun.value = String(state.sun);
    byId("sun-value").textContent = `${state.sun}°`;
    labelPlayback();
    labelClock();
    paint();
  }
  function inspect(value: BufferName) {
    lab.selectBuffer(value);
    buffer.value = value;
    refreshInspection();
    paint();
  }
  const buffer = byId<HTMLSelectElement>("buffer");
  const names = waterlineOnly ? sceneLesson.views : inspectionCatalog.map(view => view.name);
  for (const title of inspectionGroups) {
    const group = document.createElement("optgroup");
    group.label = title;
    for (const name of names) if (inspectionCatalog.find(view => view.name === name)!.group === title) {
      group.append(new Option(name, name));
    }
    if (group.children.length) buffer.add(group);
  }
  buffer.onchange = () => { const name = names.find(value => value === buffer.value); if (name) inspect(name); };
  byId<HTMLDetailsElement>("shader-code").ontoggle = refreshInspection;
  byId<HTMLSelectElement>("shader-stage").onchange = refreshInspection;

  const toggles = ["flow", "wheel", "props"] as const;
  for (const key of toggles) {
    const control = byId<HTMLInputElement>(key);
    control.onchange = () => { state.setAnimation(key, control.checked); paint(); };
  }
  const legacyLink = byId<HTMLInputElement>("legacy-link");
  legacyLink.onchange = () => { state.setAnimation("legacyLink", legacyLink.checked); };
  sun.oninput = () => updateSun(sun.valueAsNumber);

  const syncers = new Map<Effect, Set<() => void>>();
  function controlRow(def: Control, prefix: string) {
    const key = def.key;
    const label = document.createElement("label");
    let refresh: () => void;
    const edit = (value: number) => {
      if (!state.editEffect(key, value).applied) { refresh(); return; }
      labelPlayback();
      for (const sync of syncers.get(key) ?? []) sync();
      syncSide();
    };
    if ("choices" in def) {
      label.className = "stack";
      const el = document.createElement("select");
      el.id = prefix + key;
      def.choices.forEach((item, i) => {
        const opt = new Option(item, String(i));
        if (key === "bloom" && i === 2 && !gpu.hdr) { opt.disabled = true; opt.textContent += " (float targets unavailable)"; }
        el.add(opt);
      });
      el.onchange = () => edit(Number(el.value));
      label.append(def.label, el);
      refresh = () => { el.value = String(state.effects[key]); };
    } else if ("min" in def) {
      label.className = "slider";
      const el = document.createElement("input");
      el.type = "range";
      el.id = prefix + key;
      el.min = String(def.min); el.max = String(def.max); el.step = String(def.step);
      const readout = document.createElement("output");
      readout.htmlFor = el.id;
      label.append(def.label, readout, el);
      el.oninput = () => edit(el.valueAsNumber);
      refresh = () => { el.value = String(state.effects[key]); readout.textContent = state.effects[key].toFixed(def.digits ?? 0); };
    } else {
      const el = document.createElement("input");
      el.type = "checkbox"; el.id = prefix + key;
      label.className = "toggle";
      el.onchange = () => edit(Number(el.checked));
      label.append(el, def.label);
      refresh = () => { el.checked = !!state.effects[key]; };
    }
    const set = syncers.get(key) ?? new Set();
    set.add(refresh);
    syncers.set(key, set);
    refresh();
    return { label, detach: () => set.delete(refresh) };
  }
  for (const def of effectPanel) if (!waterlineOnly || def.key === "refraction") {
    byId("effect-list").append(controlRow(def, "fx-").label);
  }
  const lessonSelect = byId<HTMLSelectElement>("lesson");
  const lessonGroups = new Map<string, HTMLOptGroupElement>();
  for (const entry of availableLessons) {
    let group = lessonGroups.get(entry.group);
    if (!group) {
      group = document.createElement("optgroup"); group.label = entry.group; lessonSelect.add(group);
      lessonGroups.set(entry.group, group);
    }
    group.append(new Option(entry.title, entry.id));
  }
  lessonSelect.onchange = () => {
    const selected = availableLessons.find(entry => entry.id === lessonSelect.value);
    if (selected) openLesson(selected);
  };
  let detachControls: (() => void)[] = [];
  function action(label: string, callback: () => void) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.onclick = callback;
    return b;
  }
  function syncEffects() {
    for (const set of syncers.values()) for (const sync of set) sync();
    for (const key of toggles) byId<HTMLInputElement>(key).checked = state[key];
    legacyLink.checked = state.legacyLink;
  }

  const jointSelect = byId<HTMLSelectElement>("pose-joint");
  const poseAngle = byId<HTMLInputElement>("pose-angle");
  const joints = assets.rigs.flatMap(rig => {
    for (const joint of rig.joints) {
      const title = joint.label ?? joint.id.replaceAll("-", " ");
      jointSelect.add(new Option(assets.rigs.length > 1 ? `${rig.name} · ${title}` : title, joint.id));
    }
    return rig.joints;
  });
  // Index by option order, since each creature may reuse a local joint ID.
  function updateJoint() {
    const index = jointSelect.selectedIndex;
    const joint = joints[index];
    if (!joint) return;
    poseAngle.min = String(-joint.poseLimit);
    poseAngle.max = String(joint.poseLimit);
    const angle = state.experimentOffset(index);
    poseAngle.value = String(angle);
    poseAngle.setAttribute("aria-valuetext", `${angle} degrees`);
    byId("pose-value").textContent = `${angle}°`;
  }
  function updatePoseControls(message?: string) {
    const posing = lesson.action === "pose";
    const comparison = state.snapshot();
    const frozen = comparison.jointPose !== undefined;
    const available = comparison.availability;
    byId("pose-controls").hidden = !posing;
    byId("pose-edit").hidden = !frozen;
    byId("freeze-pose").textContent = frozen ? "Unfreeze frame" : "Freeze frame";
    byId("pose-status").textContent = message ?? (frozen ?
      `Frame ${comparison.frame} frozen. Unfreezing clears the pose edits.` : "Freeze the frame to edit joints.");
    for (const key of ["play", "step"]) byId<HTMLButtonElement>(key).disabled = !available.playback;
    byId<HTMLButtonElement>("overview").disabled = !available.bookmark;
    bookmark.disabled = !available.bookmark;
    const pin = byId<HTMLButtonElement>("pin-a");
    pin.disabled = !available.pinReference;
    pin.textContent = posing ? "Save B as A" : "Pin controls as A";
    updateJoint();
    labelPlayback();
  }
  jointSelect.onchange = updateJoint;
  poseAngle.oninput = () => {
    const joint = jointSelect.selectedIndex;
    state.editJoint(joint, poseAngle.valueAsNumber);
    updateJoint();
    syncSide();
  };
  button("freeze-pose", () => {
    if (state.frozen) state.unfreezePose();
    else state.freezePose();
    updatePoseControls();
    syncSide();
  });
  function openLesson(next: Lesson) {
    state.enterLesson(next);
    presentLesson(next);
  }
  function presentLesson(next: Lesson) {
    lesson = next;
    const widest = Math.max(...joints.map(joint => joint.poseLimit));
    jointSelect.selectedIndex = joints.findIndex(joint => joint.poseLimit === widest);
    lessonSelect.value = next.id;
    byId("lesson-title").textContent = next.title;
    byId("lesson-task").textContent = next.task;
    byId("compare-caption").textContent = next.comparison;
    lab.resetEdit();
    bend.value = defaultEdit;
    compile.textContent = "";
    byId("editor").hidden = next.action !== "edit";
    detachControls.forEach(detach => detach());
    const rows = (next.controls ?? []).map(def => controlRow(def, ""));
    detachControls = rows.map(row => row.detach);
    byId("lesson-controls").replaceChildren(...rows.map(row => row.label));
    byId("lesson-views").replaceChildren(...next.views.map(view => action(view, () => inspect(view))));
    const actions = byId("lesson-actions");
    actions.replaceChildren();
    if (next.action === "focus" && (!practice || next.id === "focus")) {
      actions.append(action(practice ? "Focus near" : "Focus dock", () => focusWorld(practice?.focus.near ?? [2.1, 2.3, -4.2])),
        action(practice ? "Focus far" : "Focus mill", () => focusWorld(practice?.focus.far ?? [2.0, 6.1, -1.6])));
    }
    if (next.action === "reflect") actions.append(action("Aim down at water", () => {
      const eye = lab.camera.position.clone();
      state.target.fromArray(practice?.reflectionAim ?? [1.1, 0.65, 6.0]);
      state.orbit.setFromVector3(eye.sub(state.target));
      paint();
    }), action("Restore pond view", () => open("Across the pond")));
    if (next.action === "sweep") {
      actions.append(action("Replay sweep", () => {
        state.replaySweep(performance.now()); labelPlayback(); paint();
      }), action("Hold sweep frame", () => {
        state.holdSweep(); paint();
      }), action("Stopped camera", () => { state.stopSweep(); paint(); }));
    }
    syncEffects();
    syncBookmark();
    updatePoseControls();
    inspect("Final color");
    syncSide();
  }
  button("pin-a", () => {
    if (!state.pinReference().applied) return;
    if (lesson.action === "pose") {
      updatePoseControls(`B saved as A at frame ${state.frame}. Change a joint in B to compare.`);
      syncSide();
      return;
    }
    byId("compare-caption").textContent = "A holds these lesson controls at the pinned values. Both sides share the camera, clock and other effects.";
    labelPlayback(); syncSide();
  });
  button("legacy", () => {
    if (!state.useLegacy().applied) return;
    syncEffects(); syncBookmark(); syncSide(); inspect("Final color");
  });
  const sound = byId<HTMLInputElement>("sound");
  sound.onchange = () => {
    byId("audio-status").textContent = "";
    void lab.sound(sound.checked).catch(error => {
      sound.checked = false;
      byId("audio-status").textContent = `Sound could not start: ${String(error)}`;
    });
  };

  button("midday", () => updateSun(270));
  button("midnight", () => updateSun(90));
  button("play", play);
  button("step", () => {
    state.stepFrame(); labelPlayback(); labelClock(); paint();
  });
  button("overview", () => open(waterlineOnly ? "Waterline" : "Overview"));
  canvas.setAttribute("aria-label", `${assets.name} scene`);
  if (assets.waterline) {
    for (const key of ["wheel", "legacy-link", "sound"]) byId(key).closest("label")!.hidden = true;
    const props = byId("props");
    const label = props.closest("label")!;
    label.hidden = assets.rigs.length === 0;
    if (assets.rigs.length) label.replaceChildren(props, " Animate creatures");
    byId("legacy").hidden = true;
  }
  if (waterlineOnly) {
    bookmark.closest("label")!.hidden = true;
    lessonSelect.closest("label")!.hidden = true;
    byId("overview").textContent = "Restore Waterline";
  }
  button("side-a", () => { state.selectSide("A"); labelPlayback(); syncSide(); });
  button("side-b", () => { state.selectSide("B"); labelPlayback(); syncSide(); });
  button("apply", () => {
    if (!state.availability().shaderEdit) return;
    try {
      lab.edit(bend.value);
      compile.dataset.error = "false";
      compile.textContent = "Compiled. The new expression is active in B.";
      state.shaderEditApplied(); labelPlayback(); syncSide();
    } catch (error) {
      compile.dataset.error = "true";
      compile.textContent = `Last working shader kept.\n${error instanceof Error ? error.message : String(error)}`;
    }
  });
  button("reset", () => { if (state.resetLesson().applied) presentLesson(lesson); });

  const zoom = (factor: number) => {
    const legacyWide = !practice && (state.bookmark === "Overview" || state.bookmark === "Camera sweep");
    const limits = legacyWide ? [190, 1940] : [2, 45];
    state.orbit.radius = Math.max(limits[0]!, Math.min(limits[1]!, state.orbit.radius * factor));
    paint();
  };
  button("zoom-in", () => zoom(0.86)); button("zoom-out", () => zoom(1 / 0.86));
  let panMode = false;
  button("drag-mode", () => {
    panMode = !panMode;
    byId("drag-mode").textContent = panMode ? "Drag: Pan" : "Drag: Orbit";
  });
  const move = (dx: number, dy: number, pan: boolean) => {
    if (pan) {
      const span = 2 * state.orbit.radius * Math.tan(lab.camera.fov * Math.PI / 360);
      const scale = span / Math.max(1, canvas.clientHeight);
      const e = lab.camera.matrixWorld.elements;
      state.target.x += (-dx * e[0]! + dy * e[4]!) * scale;
      state.target.y += (-dx * e[1]! + dy * e[5]!) * scale;
      state.target.z += (-dx * e[2]! + dy * e[6]!) * scale;
    } else {
      state.orbit.theta -= dx * 0.006;
      state.orbit.phi = Math.max(0.08, Math.min(3.02, state.orbit.phi - dy * 0.006));
    }
    paint();
  };
  const pick = (x: number, y: number) => {
    const value = lab.pick(x, y);
    if (!value) { point.hidden = false; point.textContent = "No opaque surface at this point."; return; }
    marker.hidden = false;
    marker.style.left = `${x * 100}%`; marker.style.top = `${(1 - y) * 100}%`;
    const xyz = (vector: { toArray(): number[] }) => vector.toArray().map(n => n.toFixed(2)).join(", ");
    point.hidden = false;
    point.textContent = `${value.object}: Object (${xyz(value.local)}) → World (${xyz(value.world)}) → View (${xyz(value.view)}) → Screen UV (${x.toFixed(2)}, ${y.toFixed(2)})`;
    paint();
  };
  function focusWorld(world: [number, number, number]) {
    const uv = lab.project(world);
    if (uv) pick(...uv);
    else { point.hidden = false; point.textContent = "That focus target is outside the current view. Reset the exercise or pick a visible surface."; }
  }
  const pointers = new Map<number, { x: number; y: number }>();
  let travel = 0;
  let pinched = false;
  canvas.onpointerdown = event => {
    if (event.button !== 0 && event.button !== 1) return;
    if (!pointers.size) { travel = 0; pinched = false; }
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size > 1) pinched = true;
  };
  canvas.onpointermove = event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    travel += Math.abs(dx) + Math.abs(dy);
    const second = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (second) {
      const before = Math.hypot(previous.x - second.x, previous.y - second.y);
      const after = Math.hypot(event.clientX - second.x, event.clientY - second.y);
      if (before > 5 && after > 5) zoom(before / after);
    } else if (travel > 3) move(dx, dy, panMode || event.shiftKey || event.buttons === 4);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  canvas.onpointerup = event => {
    if (pointers.has(event.pointerId) && !pinched && travel <= 3) {
      const rect = canvas.getBoundingClientRect();
      pick((event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height);
    }
    pointers.delete(event.pointerId);
  };
  canvas.onlostpointercapture = event => { pointers.delete(event.pointerId); };
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    zoom(Math.exp(Math.max(-140, Math.min(140, event.deltaY)) * 0.002));
  }, { passive: false });
  canvas.onkeydown = event => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-14, 0], ArrowRight: [14, 0], ArrowUp: [0, -14], ArrowDown: [0, 14],
    };
    const pair = delta[event.key];
    if (pair) move(...pair, event.shiftKey || panMode);
    else if (event.key === "+" || event.key === "=") zoom(0.86);
    else if (event.key === "-") zoom(1 / 0.86);
    else if (event.key === "Enter") pick(0.5, 0.5);
    else if (event.key === " ") play();
    else return;
    event.preventDefault();
  };

  status.textContent = `${lab.name} · WebGL 2 · ${gpu.hdr ? "Float targets available" : "SDR targets"}`;
  const requested = availableLessons.find(entry => entry.id === params.get("lesson"));
  openLesson(requested ?? lesson);
  if (!requested && practice) open(practice.start, assets.waterline);
  workbench.hidden = false;
  new ResizeObserver(paint).observe(canvas);
  canvas.addEventListener("webglcontextlost", () => {
    lost = true;
    void lab.sound(false);
    showFailure(new Error("The browser lost its GPU context. Retry to reload the scene."));
  });
  let last = performance.now();
  function frame(now: number) {
    if (lost) return;
    try {
      const advanced = state.advance(now, (now - last) / 1000);
      if (advanced.applied && advanced.changed) {
        labelClock();
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        lab.render(canvas.clientWidth, canvas.clientHeight);
      }
    } catch (error) {
      showFailure(error);
      return;
    }
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void start().catch(showFailure);
