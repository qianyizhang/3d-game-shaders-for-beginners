/* One renderer for the visible-card queue, never one WebGL context per card. */
(() => {
  window.DCCThumbnails = (scenes, nodes) => {
    const cache = new Map<string, string>(),
      entries = new Map<Element, DCC.Asset>();
    const canvas = document.createElement("canvas"),
      status = document.createElement("p");
    canvas.width = 480;
    canvas.height = 320;
    let viewer: DCC.Viewer | undefined,
      running = false,
      paused = false;
    const queue = new Set<Element>();
    const observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          if (change.isIntersecting) queue.add(change.target);
          else queue.delete(change.target);
        }
        void drain();
      },
      { rootMargin: "120px" },
    );
    function display(host: Element, data: string) {
      const img = document.createElement("img");
      img.alt = "";
      img.width = 480;
      img.height = 320;
      img.src = data;
      host.replaceChildren(img);
      observer.unobserve(host);
    }
    async function drain() {
      if (running || paused) return;
      running = true;
      try {
        while (queue.size && !paused) {
          const host = queue.values().next().value!;
          queue.delete(host);
          const entry = entries.get(host);
          if (!host.isConnected || !entry) continue;
          if (cache.has(entry.id)) {
            display(host, cache.get(entry.id)!);
            continue;
          }
          viewer ??= window.DCCViewer(canvas, scenes, nodes, status);
          const ok = await viewer.show(entry);
          if (!entries.has(host)) continue;
          const data = ok ? viewer.snapshot() : null;
          if (data) {
            cache.set(entry.id, data);
            display(host, data);
          } else {
            host.textContent = "3D preview unavailable · open to inspect";
            observer.unobserve(host);
          }
        }
      } finally {
        running = false;
      }
    }
    return {
      observe(host, entry) {
        entries.set(host, entry);
        if (cache.has(entry.id)) display(host, cache.get(entry.id)!);
        else observer.observe(host);
      },
      reset() {
        observer.disconnect();
        entries.clear();
        queue.clear();
      },
      pause(value) {
        paused = value;
        if (!value) void drain();
      },
      dispose() {
        paused = true;
        observer.disconnect();
        queue.clear();
        entries.clear();
        viewer?.dispose();
        cache.clear();
      },
    };
  };
})();
