(() => {
  const by = id => document.getElementById(id);
  const { nodes, scenes } = window.DCC_CATALOG;
  const kinds = ["scene", "object", "part", "material", "texture"];
  const records = Object.values(nodes).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.title.localeCompare(b.title));
  const make = (name, text) => {
    const node = document.createElement(name);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const link = (id, label) => {
    const a = make("a", label ?? nodes[id].title);
    a.href = "#" + id;
    if (id === current) a.setAttribute("aria-current", "page");
    return a;
  };
  let current = "";
  const viewer = window.DCCViewer(by("model"), scenes, nodes, by("viewer-status"));
  by("turn-left").onclick = () => viewer.rotate(-.24);
  by("turn-right").onclick = () => viewer.rotate(.24);
  by("uv").onchange = event => viewer.checker(event.target.checked);
  const filters = ["kind", "tag"];
  for (const [key, values] of [["kind", records.map(n => n.kind)], ["tag", records.flatMap(n => n.tags)]]) {
    for (const value of [...new Set(values)].sort()) by(key).add(new Option(value, value));
  }
  const showResults = () => {
    const kind = by("kind").value, tag = by("tag").value;
    const terms = by("query").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const selected = records.filter(n => {
      if ((kind && kind !== n.kind) || (tag && !n.tags.includes(tag))) return false;
      const haystack = [n.id, n.title, n.summary, n.rig, ...n.tags].join(" ").toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
    by("count").textContent = `${selected.length} matching assets`;
    by("results").replaceChildren(...selected.map(n => {
      const li = make("li");
      const a = link(n.id);
      a.append(make("small", n.kind + (n.scene && n.kind !== "scene" ? " · " + n.scene : "")));
      li.append(a);
      return li;
    }));
  };
  for (const id of filters) by(id).onchange = showResults;
  by("query").oninput = showResults;
  function relations(title, ids) {
    if (!ids?.length) return [];
    const list = make("ul");
    for (const id of ids) {
      const item = make("li");
      item.append(link(id, `${nodes[id].title} · ${nodes[id].kind}`));
      list.append(item);
    }
    return [make("h3", title), list];
  }
  function show() {
    const id = location.hash.slice(1);
    const entry = Object.hasOwn(nodes, id) ? nodes[id] : records.find(n => n.kind === "scene");
    current = entry.id;
    by("asset-kind").textContent = entry.kind + " / " + entry.tags.join(" · ");
    by("asset-title").textContent = entry.title;
    by("asset-summary").textContent = entry.summary ?? "";
    by("asset-summary").hidden = !entry.summary;
    by("preview").hidden = !entry.meshParts;
    viewer.show(entry);
    const figure = by("texture");
    figure.hidden = !entry.file;
    if (entry.file) {
      const img = figure.querySelector("img");
      img.src = entry.data;
      img.alt = entry.title;
      figure.querySelector("figcaption").replaceChildren(make("span", "Original map pixels · "), Object.assign(make("a", "Open texture file"), { href: entry.file }));
    }
    const fields = [["Asset ID", entry.id]];
    if (entry.source) {
      const source = make("a", entry.source);
      source.href = entry.sourceLink;
      fields.push(["Editable source", source], ["Delivery", scenes[entry.scene].delivery], ["Rights", scenes[entry.scene].provenance.rights]);
    }
    if (entry.rig) fields.push(["Rig", entry.rig]);
    if (entry.variantOf) fields.push(["Variant of", link("object/" + entry.scene + "/" + entry.variantOf)]);
    const dl = make("dl");
    for (const [key, value] of fields) {
      const dd = make("dd");
      dd.append(value);
      dl.append(make("dt", key), dd);
    }
    by("facts").replaceChildren(dl);
    const bindingList = make("ul");
    for (const binding of entry.bindings ?? []) {
      const li = make("li");
      li.append(link(binding.texture, `${binding.role} · ${binding.colorSpace} · ${binding.channels} · ${binding.uv}`));
      bindingList.append(li);
    }
    by("connections").replaceChildren(
      ...(entry.bindings ? [make("h3", "Texture bindings"), bindingList] : relations("Contains", entry.children)),
      ...relations("Used by", entry.usedBy),
    );
    for (const a of by("results").querySelectorAll("a")) {
      if (a.hash === "#" + current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }
  window.addEventListener("hashchange", () => {
    show();
    by("asset-title").focus();
  });
  showResults();
  show();
})();
