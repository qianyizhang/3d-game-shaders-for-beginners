/* DCC meaning stays here; the view does not infer relationships from file paths. */
(() => {
  window.DCCCatalog = ({ nodes, scenes }) => {
    const kinds: DCC.Kind[] = [
      "scene",
      "object",
      "part",
      "material",
      "texture",
    ];
    const records = Object.values(nodes).sort(
      (a, b) =>
        kinds.indexOf(a.kind) - kinds.indexOf(b.kind) ||
        a.title.localeCompare(b.title),
    );
    const get = (id: string) =>
      Object.hasOwn(nodes, id) ? nodes[id] : undefined;
    const title = (entry: DCC.Asset) =>
      entry.title.replace(
        /^([0-9a-f]{6}) (.+)$/i,
        (_: string, hex: string, name: string) =>
          `${name.charAt(0).toUpperCase()}${name.slice(1)} · #${hex.toUpperCase()}`,
      );
    const tags = [...new Set(records.flatMap((n) => n.tags))].sort();
    const search = ({ query, kind, tag }: DCC.Route) => {
      const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      return records.filter(
        (n) =>
          (!kind || n.kind === kind) &&
          (!tag || n.tags.includes(tag)) &&
          terms.every((term) =>
            [n.id, n.title, n.summary, n.rig, ...n.tags]
              .join(" ")
              .toLowerCase()
              .includes(term),
          ),
      );
    };
    const owners = (entry: DCC.Asset): DCC.Owner[] => {
      const seen = new Set<string>(),
        slugs = new Set<string>(),
        pending: (DCC.Asset | undefined)[] = [entry];
      while (pending.length) {
        const node = pending.pop();
        if (!node || seen.has(node.id)) continue;
        seen.add(node.id);
        if (node.scene) slugs.add(node.scene);
        else pending.push(...(node.usedBy ?? []).map(get));
      }
      return [...slugs].sort().map((slug) => {
        const scene = get(`scene/${slug}`),
          info = scenes[slug];
        if (!info || scene?.kind !== "scene")
          throw new Error(`Unknown owner ${slug}`);
        return { ...info, entry: scene };
      });
    };
    const readRoute = (hash: string) => {
      const [path = "", query = ""] = hash.replace(/^#/, "").split("?");
      const params = new URLSearchParams(query);
      let id;
      try {
        id = decodeURIComponent(path);
      } catch {
        id = path;
      }
      const kind = params.get("kind") ?? "scene",
        tag = params.get("tag") ?? "";
      return {
        id: id === "browse" ? "" : id,
        query: params.get("q") ?? "",
        kind: kinds.some((k) => k === kind) || kind === "" ? kind : "scene",
        tag: tags.includes(tag) ? tag : "",
      };
    };
    const route = (state: DCC.Route) => {
      const params = new URLSearchParams();
      if (state.kind !== "scene") params.set("kind", state.kind);
      if (state.query) params.set("q", state.query);
      if (state.tag) params.set("tag", state.tag);
      return `#${state.id ? encodeURI(state.id) : "browse"}${params.size ? "?" + params : ""}`;
    };
    return {
      kinds,
      records,
      tags,
      get,
      title,
      search,
      owners,
      readRoute,
      route,
    };
  };
})();
