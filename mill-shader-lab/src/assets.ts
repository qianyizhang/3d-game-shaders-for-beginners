import {
  BufferAttribute, BufferGeometry, ClampToEdgeWrapping, InterleavedBuffer, InterleavedBufferAttribute,
  NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture, type Wrapping,
} from "three";
import { bookmarks, type Bookmark, type CameraPose, type PracticeProfile } from "./state";

const ROLES = ["mill", "wheel", "water", "shutters", "vane", "banner"] as const;
const MAPS = ["color", "normal", "specular", "reflection", "refraction"] as const;
const RESOURCES = ["flow", "foam", "smoke", "grain", "neutralLut", "dayLut", "nightLut",
  "wheelAudio", "waterAudio"] as const;
type Role = typeof ROLES[number] | "opaque";
type Span = [offset: number, count: number];
type Clip = { fps: number; frames: Float32Array[] };
type XYZ = [number, number, number];
type NightLight = { center: XYZ; falloff: number; color: XYZ };
type RigJoint = {
  id: string; parent?: string; pivot: XYZ; axis: XYZ; amplitude: number; phase: number; speed: number; parts: string[];
  poseLimit: number; label?: string;
};
type CreatureRig = { name: string; joints: RigJoint[] };
export interface MeshAsset {
  role: Role;
  part?: string;
  origin: [number, number, number];
  geometry: BufferGeometry;
  attributes: InterleavedBuffer;
  maps: Record<typeof MAPS[number], Texture>;
  cutout: boolean;
  clips: Record<string, Clip>;
}
export interface SceneAssets {
  name: string;
  waterline?: CameraPose & { subject?: string };
  practice?: PracticeProfile;
  nightLights?: NightLight[];
  rigs: CreatureRig[];
  meshes: MeshAsset[];
  textures: Record<Exclude<typeof RESOURCES[number], "wheelAudio" | "waterAudio">, Texture>;
  audio: string[];
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
function cameraPose(value: unknown, name: string): CameraPose {
  const pose = object(value, `${name} pose`);
  const target = numbers(pose.target, 3, `${name} target`);
  const offset = numbers(pose.offset, 3, `${name} offset`);
  const [fov, near, far, sun] = numbers([pose.fov, pose.near, pose.far, pose.sun], 4, `${name} camera and sun`) as [number, number, number, number];
  if (fov <= 0 || fov >= 180 || near <= 0 || far <= near || sun < 0 || sun > 360 || !offset.some(Boolean)) {
    throw new Error(`Invalid ${name} camera or sun range`);
  }
  return { target, offset, fov, near, far, sun };
}
function waterlinePose(value: unknown): NonNullable<SceneAssets["waterline"]> {
  const pose = object(value, "Waterline pose");
  const subject = pose.subject;
  if (subject !== undefined && (typeof subject !== "string" || !subject.trim() || subject.length > 100)) {
    throw new Error("Invalid Waterline subject");
  }
  return { ...cameraPose(pose, "Waterline"), subject };
}
function practiceProfile(value: unknown): PracticeProfile {
  const data = object(value, "practice profile");
  const poses = object(data.bookmarks, "practice bookmarks");
  const names = Object.keys(bookmarks) as Bookmark[];
  const start = names.find(name => name === data.start);
  if (!start) throw new Error("Invalid practice start bookmark");
  const swatch = object(data.swatch, "material swatch");
  const smoke = object(data.smoke, "smoke emitter");
  const focus = object(data.focus, "focus targets");
  if (typeof swatch.radius !== "number" || !Number.isFinite(swatch.radius) || swatch.radius <= 0 ||
      typeof smoke.scale !== "number" || !Number.isFinite(smoke.scale) || smoke.scale <= 0) {
    throw new Error("Invalid practice swatch radius or smoke scale");
  }
  return {
    start, bookmarks: Object.fromEntries(names.map(name => [name, cameraPose(poses[name], name)])) as PracticeProfile["bookmarks"],
    swatch: { center: numbers(swatch.center, 3, "swatch center") as XYZ, radius: swatch.radius },
    smoke: { origin: numbers(smoke.origin, 3, "smoke origin") as XYZ, scale: smoke.scale },
    focus: { near: numbers(focus.near, 3, "near focus") as XYZ, far: numbers(focus.far, 3, "far focus") as XYZ },
    reflectionAim: numbers(data.reflectionAim, 3, "reflection aim") as XYZ,
  };
}
function lights(value: unknown): NightLight[] {
  if (!Array.isArray(value) || value.length > 3) throw new Error("Expected up to three night lights");
  return value.map((entry: unknown) => {
    const light = object(entry, "night light");
    const center = numbers(light.center, 3, "night light center") as XYZ;
    const color = numbers(light.color, 3, "night light color") as XYZ;
    const falloff = light.falloff;
    if (typeof falloff !== "number" || !Number.isFinite(falloff) || falloff <= 0 || color.some(c => c < 0)) {
      throw new Error("Invalid night light intensity or falloff");
    }
    return { center, falloff, color };
  });
}
function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}
function creatureRigs(value: unknown, meshes: MeshAsset[]): CreatureRig[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error("Invalid creature rigs");
  const opaque = new Set(meshes.filter(mesh => mesh.role === "opaque").map(mesh => mesh.part));
  const claimed = new Set<string>();
  return value.map((entry: unknown) => {
    const rig = object(entry, "creature rig");
    const { name, joints } = rig;
    if (typeof name !== "string" || !name.trim() || name.length > 100 || !Array.isArray(joints) || !joints.length || joints.length > 32) {
      throw new Error("Invalid creature rig name or joint count");
    }
    const seen = new Set<string>();
    const definitions = joints.map((value: unknown): RigJoint => {
      const joint = object(value, "rig joint");
      const id = identifier(joint.id, "joint ID");
      const parent = joint.parent === undefined ? undefined : identifier(joint.parent, "joint parent");
      if (seen.has(id) || (parent && !seen.has(parent))) throw new Error(`Invalid rig joint order at ${id}`);
      seen.add(id);
      const pivot = numbers(joint.pivot, 3, "joint pivot") as XYZ;
      const axis = numbers(joint.axis, 3, "joint axis") as XYZ;
      const [amplitude, phase, speed] = numbers([joint.amplitude, joint.phase, joint.speed], 3, "joint motion") as XYZ;
      if (Math.hypot(...axis) < 1e-6 || amplitude < 0 || amplitude > Math.PI || speed < 0) throw new Error(`Invalid joint motion at ${id}`);
      const poseLimit = joint.poseLimit === undefined ? 20 : joint.poseLimit;
      if (typeof poseLimit !== "number" || !Number.isInteger(poseLimit) || poseLimit < 1 || poseLimit > 90) {
        throw new Error(`Invalid pose limit at ${id}`);
      }
      const label = joint.label;
      if (label !== undefined && (typeof label !== "string" || !label.trim() || label.length > 60)) {
        throw new Error(`Invalid joint label at ${id}`);
      }
      if (!Array.isArray(joint.parts)) throw new Error(`Invalid joint parts at ${id}`);
      const parts = joint.parts.map((value: unknown) => {
        const part = identifier(value, "rig part");
        if (!opaque.has(part) || claimed.has(part)) throw new Error(`Unknown or reused rig part ${part}`);
        claimed.add(part);
        return part;
      });
      return { id, parent, pivot, axis, amplitude, phase, speed, parts, poseLimit, label };
    });
    if (!definitions.some(joint => joint.parts.length)) throw new Error(`No meshes assigned to ${name}`);
    return { name, joints: definitions };
  });
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
  const waterline = manifest.waterline === undefined ? undefined : waterlinePose(manifest.waterline);
  const practice = manifest.practice === undefined ? undefined : practiceProfile(manifest.practice);
  if (practice && !waterline) throw new Error("Practice scenes need a Waterline pose");
  const nightLights = manifest.nightLights === undefined ? undefined : lights(manifest.nightLights);
  const roles = waterline ? ["opaque", "water"] as const : ROLES;
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
    const role = roles.find(candidate => candidate === item.role);
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
    const part = item.part === undefined ? undefined : identifier(item.part, "mesh part");
    return { role, part, origin, geometry, attributes, maps, cutout: mapPaths.cutout === true, clips };
  }));
  for (const role of roles) if (!meshes.some(mesh => mesh.role === role)) throw new Error(`Missing ${role} role`);
  const resources = object(manifest.resources, "resources");
  const keys = RESOURCES.filter(key => key !== "wheelAudio" && key !== "waterAudio");
  return {
    name: manifest.scene, meshes, waterline, practice, nightLights,
    rigs: manifest.rigs === undefined ? [] : creatureRigs(manifest.rigs, meshes),
    textures: Object.fromEntries(await Promise.all(
      keys.map(async key => [
        key, await texture(resources[key], false, key === "smoke" ? ClampToEdgeWrapping : RepeatWrapping),
      ] as const)
    )) as SceneAssets["textures"],
    audio: waterline ? [] : [address(resources.wheelAudio), address(resources.waterAudio)],
  };
}
