(() => {
  const by = window.DCCElement;
  const { nodes, scenes } = window.DCC_CATALOG;
  const catalog = window.DCCCatalog(window.DCC_CATALOG);
  const thumbs = window.DCCThumbnails(scenes, nodes);
  let viewer: DCC.Viewer | undefined,
    state: DCC.Route,
    filtered: DCC.Asset[] = [],
    filterKey: string | undefined,
    shownURL: string | undefined,
    previewRequest = 0;
  let returnId = "",
    returnScroll = 0;
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
  ) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const link = (id: string, label?: string) => {
    const a = make("a", label ?? catalog.title(required(id)));
    a.href = catalog.route({ ...state, id });
    a.dataset.asset = id;
    return a;
  };
  function required(id: string): DCC.Asset {
    const entry = catalog.get(id);
    if (!entry) throw new Error(`Unknown asset ${id}`);
    return entry;
  }
  function image(src: string, label = "") {
    const img = make("img");
    img.src = src;
    img.alt = label;
    img.width = 480;
    img.height = 320;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.replaceWith(make("span", "Map image unavailable"));
    });
    return img;
  }
  function card(entry: DCC.Asset) {
    const li = make("li"),
      a = link(entry.id),
      thumb = make("span");
    a.className = "asset-card";
    thumb.className = "thumb";
    a.replaceChildren();
    const data =
      entry.data ??
      (entry.bindings ? nodes[entry.bindings[0]!.texture]!.data : null);
    if (data) thumb.append(image(data));
    else thumb.append(make("span", "Preparing neutral preview…"));
    const copy = make("span");
    copy.className = "card-copy";
    const context =
      entry.scene && entry.kind !== "scene"
        ? required(`scene/${entry.scene}`).title
        : entry.kind;
    copy.append(
      make("strong", catalog.title(entry)),
      make("small", context + (entry.rig ? " · rigged" : "")),
    );
    a.append(thumb, copy);
    li.append(a);
    if (entry.meshParts) thumbs.observe(thumb, entry);
    return li;
  }
  for (const [value, label] of [
    ["", "All kinds"],
    ...catalog.kinds.map((kind) => [
      kind,
      kind.charAt(0).toUpperCase() + kind.slice(1) + "s",
    ]),
  ] as [string, string][]) {
    const count = catalog.records.filter(
      (n) => !value || n.kind === value,
    ).length;
    by("kind").add(new Option(`${label} · ${count}`, value));
  }
  for (const tag of catalog.tags) by("tag").add(new Option(tag, tag));
  function browse() {
    by("query").value = state.query;
    by("kind").value = state.kind;
    by("tag").value = state.tag;
    const key = JSON.stringify([state.query, state.kind, state.tag]);
    if (key !== filterKey) {
      filterKey = key;
      filtered = catalog.search(state);
      thumbs.reset();
      by("results").replaceChildren(...filtered.map(card));
      by("count").textContent =
        `${filtered.length} matching ${state.kind ? state.kind + "s" : "assets"}`;
      by("empty").hidden = filtered.length > 0;
      by("clear-query").hidden = !state.query;
      by("all-kinds").hidden = !state.kind && !state.tag;
    }
  }
  function relations(title: string, ids?: string[]) {
    if (!ids?.length) return [];
    const list = make("ul");
    for (const id of ids) {
      const entry = required(id),
        li = make("li"),
        a = link(id);
      a.append(make("small", entry.kind));
      li.append(a);
      list.append(li);
    }
    return [make("h3", title), list];
  }
  const playback = window.DCCPlayback(() => viewer);
  function previewControls() {
    const mode = by("viewer-status").dataset.state;
    for (const control of by("viewer-controls").querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >("button,input"))
      control.disabled = mode !== "ready";
    if (mode !== "ready") playback.clear();
    by("retry-preview").hidden = !["error", "unavailable"].includes(mode ?? "");
    by("retry-preview").textContent =
      mode === "unavailable" ? "Reload gallery" : "Retry preview";
  }
  new MutationObserver(previewControls).observe(by("viewer-status"), {
    attributes: true,
    attributeFilter: ["data-state"],
  });
  async function showPreview(entry?: DCC.Asset) {
    const token = ++previewRequest;
    playback.clear();
    if (!entry?.meshParts) {
      await viewer?.show();
      return;
    }
    viewer ??= window.DCCViewer(
      by("model"),
      scenes,
      nodes,
      by("viewer-status"),
    );
    const promise = viewer.show(entry);
    previewControls();
    const ready = await promise;
    if (token === previewRequest) {
      previewControls();
      if (ready) playback.select();
    }
  }
  function inspect(entry: DCC.Asset) {
    by("asset-kind").textContent = entry.kind + " / " + entry.tags.join(" · ");
    by("asset-title").textContent = catalog.title(entry);
    by("asset-summary").textContent = entry.summary ?? "";
    by("asset-summary").hidden = !entry.summary;
    by("preview").hidden = !entry.meshParts;
    by("texture").hidden = !entry.file;
    by("material").hidden = !entry.bindings;
    void showPreview(entry);
    if (entry.file) {
      const img = by("texture").querySelector("img")!;
      img.src = entry.data!;
      img.alt = entry.title;
      img.onerror = () => {
        by("texture")
          .querySelector("figcaption")!
          .prepend(make("span", "Map image unavailable. "));
      };
      const a = make("a", "Open texture file");
      a.href = entry.file;
      by("texture")
        .querySelector("figcaption")!
        .replaceChildren(make("span", "Original map pixels · "), a);
    }
    by("bindings").replaceChildren(
      ...(entry.bindings ?? []).map((binding) => {
        const li = make("li"),
          a = link(binding.texture);
        a.replaceChildren(image(nodes[binding.texture]!.data!));
        a.append(
          make("strong", binding.role),
          make(
            "small",
            `${binding.colorSpace} · ${binding.channels} · ${binding.uv}`,
          ),
        );
        li.append(a);
        return li;
      }),
    );
    by("connections").replaceChildren(
      ...relations("Contains", entry.bindings ? [] : entry.children),
      ...relations("Used by", entry.usedBy),
    );
    const owners = catalog.owners(entry);
    const rights = [...new Set(owners.map((owner) => owner.provenance.rights))];
    by("rights").textContent =
      "Rights: " + (rights.join(" · ") || "No rights record available");
    const fields: [string, string | Node][] = [["Asset ID", entry.id]];
    if (entry.rig)
      fields.push(["Rig", entry.rig + " · rigid articulated parts"]);
    if (entry.variantOf)
      fields.push([
        "Variant of",
        link(`object/${entry.scene}/${entry.variantOf}`),
      ]);
    if (entry.source) {
      const a = make("a", entry.source);
      a.href = entry.sourceLink!;
      fields.push(["Editable working source", a]);
    }
    for (const owner of owners)
      fields.push([`Reviewed delivery · ${owner.entry.title}`, owner.delivery]);
    const dl = make("dl");
    for (const [key, value] of fields) {
      const dd = make("dd");
      dd.append(value);
      dl.append(make("dt", key), dd);
    }
    by("facts").replaceChildren(
      dl,
      make("p", "Working-source edits do not update this reviewed delivery."),
    );
    const index = filtered.findIndex((n) => n.id === entry.id);
    by("result-position").textContent =
      index < 0
        ? "Related asset · outside the current results"
        : `${index + 1} of ${filtered.length} results`;
    for (const [key, offset] of [
      ["previous", -1],
      ["next", 1],
    ] as const) {
      const target = index >= 0 ? filtered[index + offset] : null;
      by(key).hidden = !target;
      if (target) {
        by(key).href = catalog.route({ ...state, id: target.id });
        by(key).dataset.asset = target.id;
      } else {
        by(key).removeAttribute("href");
        delete by(key).dataset.asset;
      }
    }
    by("back-results").href = catalog.route({ ...state, id: "" });
    by("back-results").dataset.asset = "";
  }
  function render({ focus = true, force = false } = {}) {
    if (shownURL === location.hash && !force) return;
    shownURL = location.hash;
    const wasInspect = !!state?.id;
    state = catalog.readRoute(location.hash);
    const entry = catalog.get(state.id),
      invalid = !!state.id && !entry;
    by("route-status").hidden = !invalid;
    by("route-status").textContent = invalid
      ? "That asset is not in this catalog. Browse or search for another asset."
      : "";
    if (invalid) state.id = "";
    by("browse").hidden = !!entry;
    by("detail").hidden = !entry;
    thumbs.pause(!!entry);
    browse();
    if (entry) {
      inspect(entry);
      if (focus) {
        scrollTo(0, 0);
        by("asset-title").focus();
      }
    } else {
      void showPreview();
      if (focus && wasInspect) {
        const target = [...by("results").querySelectorAll("a")].find(
          (a) => a.dataset.asset === returnId,
        );
        (target ?? by("browse-title")).focus({ preventScroll: true });
        scrollTo(0, returnScroll);
      }
    }
    document.title = entry
      ? `${catalog.title(entry)} · DCC Asset Library`
      : "DCC · Asset Library";
  }
  function navigate(id: string) {
    if (!state.id && id) {
      returnId = id;
      returnScroll = scrollY;
    }
    history.pushState(null, "", catalog.route({ ...state, id }));
    render();
  }
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".skip")) {
      event.preventDefault();
      by("main").tabIndex = -1;
      by("main").focus();
      return;
    }
    const a = event.target.closest<HTMLAnchorElement>("a[data-asset]");
    if (
      !a ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(a.dataset.asset ?? "");
  });
  function updateFilters(patch: Partial<DCC.Route> = {}) {
    const next = {
      ...state,
      id: "",
      query: by("query").value,
      kind: by("kind").value,
      tag: by("tag").value,
      ...patch,
    };
    history.replaceState(null, "", catalog.route(next));
    render({ focus: false });
  }
  by("query").addEventListener("input", () => updateFilters());
  for (const id of ["kind", "tag"] as const)
    by(id).addEventListener("change", () => updateFilters());
  by("reset-filters").onclick = () => {
    updateFilters({ query: "", kind: "scene", tag: "" });
    by("query").focus();
  };
  by("clear-query").onclick = () => {
    updateFilters({ query: "" });
    by("query").focus();
  };
  by("all-kinds").onclick = () => {
    updateFilters({ kind: "", tag: "" });
    by("query").focus();
  };
  by("turn-left").onclick = () => viewer?.rotate(-0.24);
  by("turn-right").onclick = () => viewer?.rotate(0.24);
  by("zoom-in").onclick = () => viewer?.zoom(1.2);
  by("zoom-out").onclick = () => viewer?.zoom(1 / 1.2);
  by("reset-view").onclick = () => viewer?.reset();
  by("uv").onchange = () => viewer?.checker(by("uv").checked);
  by("retry-preview").onclick = () => {
    if (by("viewer-status").dataset.state === "unavailable") location.reload();
    else {
      by("viewer-status").tabIndex = -1;
      by("viewer-status").focus();
      void showPreview(catalog.get(state.id));
    }
  };
  const canvas = by("model");
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    viewer?.rotate(
      (event.clientX - drag.x) * 0.008,
      (event.clientY - drag.y) * 0.008,
    );
    drag = { x: event.clientX, y: event.clientY };
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(event, () => {
      drag = null;
    });
  canvas.addEventListener("keydown", (event) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => viewer?.rotate(-0.15),
      ArrowRight: () => viewer?.rotate(0.15),
      ArrowUp: () => viewer?.rotate(0, -0.15),
      ArrowDown: () => viewer?.rotate(0, 0.15),
      "+": () => viewer?.zoom(1.2),
      "=": () => viewer?.zoom(1.2),
      "-": () => viewer?.zoom(1 / 1.2),
      Home: () => viewer?.reset(),
    };
    if (
      actions[event.key] &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      actions[event.key]?.();
    }
  });
  addEventListener("popstate", () => render());
  addEventListener("hashchange", () => render());
  // Pause in the background. A persisted page resumes with its existing resources.
  document.addEventListener("visibilitychange", () => {
    thumbs.pause(document.hidden || !!state.id);
    if (document.hidden) playback.pause();
  });
  addEventListener("pagehide", (event) => {
    playback.pause();
    if (event.persisted) thumbs.pause(true);
    else {
      thumbs.dispose();
      viewer?.dispose();
    }
  });
  addEventListener("pageshow", () =>
    thumbs.pause(document.hidden || !!state?.id),
  );
  render({ focus: false });
})();
