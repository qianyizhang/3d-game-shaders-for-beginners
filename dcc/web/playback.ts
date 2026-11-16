/* One explicit playback clock for the inspected object; thumbnails stay still. */
(() => {
  window.DCCPlayback = (getViewer) => {
    const by = window.DCCElement;
    let info: DCC.Motion | null = null,
      clip = "",
      time = 0,
      playing = false,
      frame = 0,
      previous: number | null = null;
    const duration = () =>
      info?.clips.find((c) => c.id === clip)?.duration ?? 1;
    function labels() {
      by("motion-play").textContent = playing ? "Pause" : "Play";
      by("motion-play").disabled = !clip || !info;
      by("motion-time").disabled = !clip || !info;
      by("motion-time").value = String((time / duration()) * 1000);
      by("motion-position").textContent =
        `${time.toFixed(2)} / ${duration().toFixed(2)} s`;
      by("motion-position").hidden = !clip;
    }
    function pause() {
      playing = false;
      cancelAnimationFrame(frame);
      previous = null;
      labels();
    }
    function tick(now: number) {
      if (!playing || document.hidden) {
        pause();
        return;
      }
      if (previous !== null)
        time = (time + Math.min((now - previous) / 1000, 0.1)) % duration();
      previous = now;
      getViewer()?.pose(clip, time);
      labels();
      frame = requestAnimationFrame(tick);
    }
    function rest() {
      pause();
      clip = "";
      time = 0;
      by("motion-clip").value = "";
      by("joint-angle").value = "0";
      by("joint-value").textContent = "0°";
      by("motion-description").textContent =
        "Rest pose. Choose a motion, then play or scrub.";
      getViewer()?.pose();
      labels();
    }
    function joint() {
      rest();
      const selected = info?.joints.find(
        (j) => j.id === by("motion-joint").value,
      );
      if (!selected) return;
      by("joint-angle").min = String(-selected.poseLimit);
      by("joint-angle").max = String(selected.poseLimit);
      by("joint-help").textContent =
        `Single joint from rest · ±${selected.poseLimit}° · child parts follow their parent.`;
    }
    // Keep the selected value before rest clears the previous pose.
    by("motion-clip").onchange = () => {
      const value = by("motion-clip").value;
      rest();
      clip = value;
      by("motion-clip").value = value;
      by("motion-description").textContent =
        info?.clips.find((c) => c.id === clip)?.description ??
        "Rest pose. Choose a motion, then play or scrub.";
      getViewer()?.pose(clip, time);
      labels();
    };
    by("motion-play").onclick = () => {
      if (playing) pause();
      else if (clip && info && !document.hidden) {
        playing = true;
        previous = null;
        labels();
        frame = requestAnimationFrame(tick);
      }
    };
    by("motion-time").oninput = () => {
      const position = by("motion-time").valueAsNumber;
      pause();
      time = (position / 1000) * duration();
      getViewer()?.pose(clip, time);
      labels();
    };
    by("motion-joint").onchange = joint;
    by("joint-angle").oninput = () => {
      pause();
      clip = "";
      time = 0;
      by("motion-clip").value = "";
      const value = by("joint-angle").valueAsNumber;
      by("joint-value").textContent = `${value}°`;
      by("motion-description").textContent =
        "Single-joint inspection from rest. Choose a motion to return to playback.";
      getViewer()?.pose("", 0, { [by("motion-joint").value]: value });
      labels();
    };
    by("motion-rest").onclick = () => {
      rest();
      by("motion-description").textContent =
        "Rest pose. Choose a motion, then play or scrub.";
    };
    new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) pause();
    }).observe(by("model"));
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      (e) => {
        if (e.matches) pause();
      },
    );
    function clear() {
      pause();
      info = null;
      clip = "";
      time = 0;
      by("motion-controls").hidden = true;
      by("rig-inspector").open = false;
      labels();
    }
    function select() {
      clear();
      info = getViewer()?.motionInfo() ?? null;
      if (!info) return;
      by("motion-clip").replaceChildren(
        new Option("Rest pose", ""),
        ...info.clips.map((c) => new Option(c.label, c.id)),
      );
      by("motion-joint").replaceChildren(
        ...info.joints.map((j) => new Option(j.label ?? j.id, j.id)),
      );
      by("motion-controls").hidden = false;
      by("motion-description").textContent =
        "Rest pose. Choose a motion, then play or scrub.";
      joint();
    }
    return { select, clear, pause };
  };
})();
