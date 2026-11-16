/** Project verified asset records into the same types the browser consumes. */
import { createHash } from "node:crypto";
import { basename, relative, resolve, sep } from "node:path";
const roles: Record<string, readonly [string, string, string]> = {
  color: ["Base color", "sRGB", "RGB"],
  normal: ["Normal", "Linear", "RGB"],
  specular: ["Specular mask", "Linear", "R"],
  reflection: ["Reflection mask", "Linear", "R"],
  refraction: ["Refraction mask", "Linear", "R"],
  contact: ["Water contact pattern", "Linear", "R"],
};
const stem = (path: string) => basename(path, ".png");
export function project(input: DCC.GalleryInput): {
  catalog: DCC.CatalogData;
  outputs: Map<string, Uint8Array>;
} {
  const nodes: DCC.CatalogData["nodes"] = {},
    scenes: DCC.CatalogData["scenes"] = {},
    outputs = new Map<string, Uint8Array>();
  function node<T extends DCC.Asset>(entry: T): T {
    if (Object.hasOwn(nodes, entry.id))
      throw new Error(`Duplicate catalog ID: ${entry.id}`);
    nodes[entry.id] = entry;
    return entry;
  }
  function texture(path: string, payload: Buffer): string {
    const key = stem(path),
      id = `texture/${key}`,
      sha256 = createHash("sha256").update(payload).digest("hex");
    const old = nodes[id];
    if (old) {
      if (old.sha256 !== sha256)
        throw new Error(`Texture ID ${id} has multiple masters`);
      return id;
    }
    const file = `textures/${key}.png`;
    outputs.set(file, payload);
    node({
      id,
      kind: "texture",
      title: key.replaceAll("-", " "),
      tags: ["map"],
      file,
      sha256,
      data: "data:image/png;base64," + payload.toString("base64"),
    });
    return id;
  }
  for (const { slug, delivery, model, files } of input.scenes) {
    if (model.scene !== slug)
      throw new Error(`Delivery does not match catalog scene ${slug}`);
    const payload = (path: string): Buffer => {
      const value = files[path];
      if (value === undefined)
        throw new Error(`Missing verified member ${path}`);
      return Buffer.from(value, "base64");
    };
    const dataFile = `${slug}.js`;
    outputs.set(
      dataFile,
      Buffer.from(
        `DCC_GEOMETRY(${JSON.stringify(slug)},${JSON.stringify(payload(model.geometry).toString("base64"))});\n`,
      ),
    );
    scenes[slug] = {
      geometry: dataFile,
      delivery,
      provenance: model.provenance,
      rigs: model.rigs,
    };
    const sourcePath = resolve(input.sourceRoot, model.source),
      source = relative(input.sourceRoot, sourcePath);
    if (source === ".." || source.startsWith(".." + sep))
      throw new Error("Source path leaves DCC");
    const sourceLink = relative(input.output, sourcePath);
    const scene = node<DCC.SceneAsset>({
      id: `scene/${slug}`,
      kind: "scene",
      title: model.title,
      summary: model.summary,
      tags: model.tags,
      scene: slug,
      source,
      sourceLink,
      children: [],
      meshParts: model.parts.filter((p) => p.visible).map((p) => p.slug),
    });
    const parts = new Map(model.parts.map((p) => [p.slug, p]));
    for (const [key, obj] of Object.entries(model.objects)) {
      const entry = node<DCC.ObjectAsset>({
        id: `object/${slug}/${key}`,
        kind: "object",
        title: obj.title,
        scene: slug,
        source,
        sourceLink,
        children: [],
        tags: obj.tags,
        meshParts: obj.parts,
        rig: obj.rig ?? null,
        variantOf: obj.variantOf ?? null,
      });
      scene.children.push(entry.id);
      for (const partId of obj.parts) {
        const part = parts.get(partId);
        if (!part) throw new Error(`Unknown part ${partId}`);
        const detail = node<DCC.PartAsset>({
          id: `part/${slug}/${partId}`,
          kind: "part",
          title: part.title,
          scene: slug,
          source,
          sourceLink,
          summary: part.description,
          tags: [...new Set([...obj.tags, part.role])].sort(),
          meshParts: [partId],
          children: [],
          meshes: part.meshes,
          bounds: part.bounds,
        });
        entry.children.push(detail.id);
        for (const mesh of part.meshes) {
          const color = mesh.textures.color;
          if (!color) throw new Error("Missing color map");
          const name = stem(color),
            materialKey = mesh.role !== "water" ? name : "water-surface",
            materialId = `material/${materialKey}`;
          const bindings = {
            ...mesh.textures,
            ...(mesh.role === "water" ? model.waterResources : {}),
          };
          const maps = Object.entries(bindings).map(
            ([role, path]): DCC.Binding => {
              const names = roles[role];
              if (!names) throw new Error(`Unknown map role ${role}`);
              const [label, colorSpace, channels] = names,
                tex = texture(path, payload(path));
              const tags = nodes[tex]!.tags;
              if (!tags.includes(label.toLowerCase()))
                tags.push(label.toLowerCase());
              return {
                texture: tex,
                role: label,
                colorSpace,
                channels,
                uv: "UV0",
              };
            },
          );
          const old = nodes[materialId];
          if (!old)
            node<DCC.MaterialAsset>({
              id: materialId,
              kind: "material",
              title: materialKey.replaceAll("-", " "),
              tags: [name.split("-").at(-1)!],
              bindings: maps,
              children: [...new Set(maps.map((m) => m.texture))],
            });
          else if (JSON.stringify(old.bindings) !== JSON.stringify(maps))
            throw new Error(`${materialId}: inconsistent bindings`);
          if (!detail.children.includes(materialId))
            detail.children.push(materialId);
        }
      }
    }
  }
  for (const entry of Object.values(nodes))
    for (const child of entry.children ?? []) {
      const target = nodes[child];
      if (!target) throw new Error(`Unknown relationship ${child}`);
      (target.usedBy ??= []).push(entry.id);
    }
  return { catalog: { nodes, scenes }, outputs };
}
