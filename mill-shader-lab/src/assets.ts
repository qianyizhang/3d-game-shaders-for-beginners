import {
  BufferAttribute, BufferGeometry, ClampToEdgeWrapping, InterleavedBuffer, InterleavedBufferAttribute,
  NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture, type Wrapping,
} from "three";

const ROLES = ["mill", "wheel", "water", "shutters", "vane", "banner"] as const;
const MAPS = ["color", "normal", "specular", "reflection", "refraction"] as const;
const RESOURCES = ["flow", "foam", "smoke", "grain", "neutralLut", "dayLut", "nightLut",
  "wheelAudio", "waterAudio"] as const;
type Role = typeof ROLES[number];
type Span = [offset: number, count: number];
type Clip = { fps: number; frames: Float32Array[] };
export interface MeshAsset {
  role: Role;
  origin: [number, number, number];
  geometry: BufferGeometry;
  attributes: InterleavedBuffer;
  maps: Record<typeof MAPS[number], Texture>;
  cutout: boolean;
  clips: Record<string, Clip>;
}
export interface SceneAssets {
  name: string;
  meshes: MeshAsset[];
  textures: Record<Exclude<typeof RESOURCES[number], "wheelAudio" | "waterAudio">, Texture>;
  audio: [string, string];
}

function object(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${key} in scene manifest`);
  return value as Record<string, unknown>;
}
function numbers(value: unknown, count: number, key: string): number[] {
  if (!Array.isArray(value) || value.length !== count || value.some(n => typeof n !== "number" || !Number.isFinite(n))) {
    throw new Error(`Invalid ${key} in scene manifest`);
  }
  return value;
}
function safePath(value: unknown): string {
  if (typeof value !== "string" || !value.split("/").every(s => /^[\w-]+(?:\.[\w-]+)*$/.test(s))) {
    throw new Error("Invalid file path in scene manifest");
  }
  return value;
}
async function fetchAsset(path: string): Promise<Response> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response;
}
function span(value: unknown, blob: ArrayBuffer): Span {
  const [start, count] = numbers(value, 2, "binary span") as Span;
  if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || start % 4 || count <= 0 || start + count * 4 > blob.byteLength) {
    throw new Error("Mesh data span falls outside the binary");
  }
  return [start, count];
}

export async function loadAssets(url = "/mill-assets/scene.json"): Promise<SceneAssets> {
  const root = new URL(url, location.href);
  const address = (path: unknown) => new URL(safePath(path), root).href;
  const manifest = object(await (await fetchAsset(root.href)).json(), "root");
  if (manifest.version !== 1 || manifest.axes !== "x,z,-y" || typeof manifest.scene !== "string" || !Array.isArray(manifest.meshes)) {
    throw new Error("Unsupported scene manifest");
  }
  const blob = await (await fetchAsset(address(manifest.geometry))).arrayBuffer();
  const vertices = (entry: unknown) => {
    const [start, count] = span(entry, blob);
    if (count % 14) throw new Error("Invalid vertex stride");
    return new Float32Array(blob, start, count);
  };
  const loader = new TextureLoader();
  const textures = new Map<string, Promise<Texture>>();
  const texture = (value: unknown, color = false, wrap: Wrapping = RepeatWrapping) => {
    const path = address(value);
    const key = `${path}:${color}:${wrap}`;
    let promise = textures.get(key);
    if (!promise) {
      promise = loader.loadAsync(path).then(image => {
        image.colorSpace = color ? SRGBColorSpace : NoColorSpace;
        image.wrapS = image.wrapT = wrap;
        return image;
      }, () => { throw new Error(`Could not load ${path}`); });
      textures.set(key, promise);
    }
    return promise;
  };
  const meshes = await Promise.all(manifest.meshes.map(async (entry: unknown): Promise<MeshAsset> => {
    const item = object(entry, "mesh");
    const role = ROLES.find(candidate => candidate === item.role);
    if (!role) throw new Error("Unknown mesh role");
    const origin = numbers(item.origin, 3, "origin") as MeshAsset["origin"];
    const data = vertices(item.vertices);
    const [start, count] = span(item.indices, blob);
    const index = new Uint32Array(blob, start, count);
    if (count % 3 || index.some(i => i >= data.length / 14)) throw new Error(`Invalid triangles for ${role}`);
    const attributes = new InterleavedBuffer(data.slice(), 14);
    const geometry = new BufferGeometry();
    for (const [key, size, offset] of [
      ["position", 3, 0], ["normal", 3, 3], ["uv", 2, 6], ["tangent", 3, 8], ["bitangent", 3, 11],
    ] as const) geometry.setAttribute(key, new InterleavedBufferAttribute(attributes, size, offset));
    geometry.setIndex(new BufferAttribute(index, 1));
    const clips: Record<string, Clip> = {};
    if (item.clips) for (const [key, value] of Object.entries(object(item.clips, "clips"))) {
      const clip = object(value, "clip");
      if (typeof clip.fps !== "number" || !Number.isFinite(clip.fps) || clip.fps <= 0 ||
          !Array.isArray(clip.frames) || !clip.frames.length) throw new Error(`Invalid clip ${key}`);
      const frames = clip.frames.map(vertices);
      if (frames.some(frame => frame.length !== data.length)) throw new Error(`Vertex count changes in ${key}`);
      clips[key] = { fps: clip.fps, frames };
    }
    const mapPaths = object(item.textures, "textures");
    const maps = Object.fromEntries(await Promise.all(
      MAPS.map(async key => [key, await texture(mapPaths[key], key === "color")] as const)
    )) as MeshAsset["maps"];
    return { role, origin, geometry, attributes, maps, cutout: mapPaths.cutout === true, clips };
  }));
  for (const role of ROLES) if (!meshes.some(mesh => mesh.role === role)) throw new Error(`Missing ${role} role`);
  const resources = object(manifest.resources, "resources");
  const keys = RESOURCES.filter(key => key !== "wheelAudio" && key !== "waterAudio");
  return {
    name: manifest.scene, meshes,
    textures: Object.fromEntries(await Promise.all(
      keys.map(async key => [
        key, await texture(resources[key], false, key === "smoke" ? ClampToEdgeWrapping : RepeatWrapping),
      ] as const)
    )) as SceneAssets["textures"],
    audio: [address(resources.wheelAudio), address(resources.waterAudio)],
  };
}
