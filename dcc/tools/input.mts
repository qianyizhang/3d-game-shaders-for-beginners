/** Validate the JSON transport from Python's verified-delivery reader. */
await import(new URL("../web/motion.js", import.meta.url).href);
const fail = (message: string): never => {
  throw new Error(`Invalid gallery input: ${message}`);
};
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(label);
  return value as Record<string, unknown>;
};
const string = (value: unknown, label: string): string =>
  typeof value === "string" ? value : fail(label);
const list = (value: unknown, label: string): unknown[] =>
  Array.isArray(value) ? value : fail(label);
const strings = (value: unknown, label: string): string[] =>
  list(value, label).map((v) => string(v, label));
const stringMap = (value: unknown, label: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(record(value, label)).map(([k, v]) => [k, string(v, label)]),
  );
const numbers = (value: unknown, length: number, label: string): number[] => {
  const values = list(value, label);
  if (
    values.length !== length ||
    !values.every((v) => typeof v === "number" && Number.isFinite(v))
  )
    return fail(label);
  return values as number[];
};
const role = (value: unknown): "opaque" | "water" =>
  value === "opaque" || value === "water" ? value : fail("mesh role");
function mesh(value: unknown): DCC.Mesh {
  const m = record(value, "mesh");
  return {
    role: role(m.role),
    part: string(m.part, "mesh part"),
    origin: numbers(m.origin, 3, "origin") as DCC.Vec3,
    vertices: numbers(m.vertices, 2, "vertices") as [number, number],
    indices: numbers(m.indices, 2, "indices") as [number, number],
    textures: stringMap(m.textures, "maps"),
  };
}
function model(value: unknown): DCC.AssetModel {
  const m = record(value, "model");
  const parts = list(m.parts, "parts").map((value): DCC.ModelPart => {
    const p = record(value, "part"),
      bounds = list(p.bounds, "bounds");
    if (bounds.length !== 2 || typeof p.visible !== "boolean")
      return fail("part bounds/visibility");
    return {
      slug: string(p.slug, "part slug"),
      title: string(p.title, "part title"),
      description: string(p.description, "part description"),
      role: role(p.role),
      visible: p.visible,
      bounds: [
        numbers(bounds[0], 3, "low") as DCC.Vec3,
        numbers(bounds[1], 3, "high") as DCC.Vec3,
      ],
      meshes: list(p.meshes, "meshes").map(mesh),
    };
  });
  const objects = Object.fromEntries(
    Object.entries(record(m.objects, "objects")).map(([id, value]) => {
      const o = record(value, "object");
      const object: DCC.ModelObject = {
        title: string(o.title, "object title"),
        tags: strings(o.tags, "object tags"),
        parts: strings(o.parts, "object parts"),
      };
      if (o.rig !== undefined) object.rig = string(o.rig, "rig name");
      if (o.variantOf !== undefined)
        object.variantOf = string(o.variantOf, "variant");
      return [id, object];
    }),
  );
  const rigs = list(m.rigs, "rigs").map((value) => {
    const rig = record(value, "rig");
    const checked = globalThis.DCCMotion.create(
      { ...rig, clips: rig.clips ?? [] },
      parts.map((p) => p.slug),
    );
    return {
      name: string(rig.name, "rig name"),
      joints: checked.joints,
      ...(rig.clips === undefined ? {} : { clips: checked.clips }),
    };
  });
  const provenance = record(m.provenance, "provenance");
  if (provenance.rights !== undefined && typeof provenance.rights !== "string")
    return fail("rights");
  return {
    scene: string(m.scene, "scene"),
    title: string(m.title, "title"),
    summary: string(m.summary, "summary"),
    tags: strings(m.tags, "tags"),
    source: string(m.source, "source"),
    geometry: string(m.geometry, "geometry"),
    provenance,
    rigs,
    parts,
    objects,
    waterResources:
      m.waterResources === undefined
        ? {}
        : stringMap(m.waterResources, "water resources"),
  };
}
export function parseInput(value: unknown): DCC.GalleryInput {
  const input = record(value, "request");
  const scenes = list(input.scenes, "scenes").map((value) => {
    const scene = record(value, "verified scene");
    const slug = string(scene.slug, "slug");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      return fail(`scene slug ${JSON.stringify(slug)}`);
    return {
      slug,
      delivery: string(scene.delivery, "delivery"),
      model: model(scene.model),
      files: stringMap(scene.files, "files"),
    };
  });
  if (!scenes.length) return fail("empty scenes");
  return {
    sourceRoot: string(input.sourceRoot, "source root"),
    output: string(input.output, "output"),
    scenes,
  };
}
