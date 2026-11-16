/** Shared producer/browser contracts. Runtime validation remains at input boundaries. */
declare namespace DCC {
  type Vec3 = [number, number, number];
  type Bounds = [Vec3, Vec3];
  type Matrix = number[];
  type Kind = "scene" | "object" | "part" | "material" | "texture";
  interface Mesh {
    role: "opaque" | "water";
    part: string;
    origin: Vec3;
    vertices: [number, number];
    indices: [number, number];
    textures: Record<string, string>;
  }
  interface Joint {
    id: string;
    parent?: string;
    pivot: Vec3;
    axis: Vec3;
    parts: string[];
    poseLimit: number;
    label?: string;
    amplitude?: number;
    phase?: number;
    speed?: number;
  }
  interface Wave {
    amplitude: number;
    phase: number;
    bias: number;
    keys?: never;
  }
  interface Keyframes {
    keys: [number, number][];
  }
  type Track = Wave | Keyframes;
  interface Clip {
    id: string;
    label: string;
    description?: string;
    duration: number;
    tracks: Record<string, Track>;
  }
  interface Rig {
    name: string;
    joints: Joint[];
    clips?: Clip[];
  }
  interface Binding {
    texture: string;
    role: string;
    colorSpace: string;
    channels: string;
    uv: string;
  }
  interface AssetBase {
    id: string;
    kind: Kind;
    title: string;
    tags: string[];
    summary?: string;
    scene?: string;
    source?: string;
    sourceLink?: string;
    children?: string[];
    usedBy?: string[];
    meshParts?: string[];
    rig?: string | null;
    variantOf?: string | null;
    bindings?: Binding[];
    meshes?: Mesh[];
    bounds?: Bounds;
    file?: string;
    data?: string;
    sha256?: string;
  }
  interface SceneAsset extends AssetBase {
    kind: "scene";
    scene: string;
    children: string[];
    meshParts: string[];
  }
  interface ObjectAsset extends AssetBase {
    kind: "object";
    scene: string;
    children: string[];
    meshParts: string[];
  }
  interface PartAsset extends AssetBase {
    kind: "part";
    scene: string;
    children: string[];
    meshParts: string[];
    meshes: Mesh[];
    bounds: Bounds;
  }
  interface MaterialAsset extends AssetBase {
    kind: "material";
    bindings: Binding[];
    children: string[];
  }
  interface TextureAsset extends AssetBase {
    kind: "texture";
    file: string;
    data: string;
    sha256: string;
  }
  type Asset =
    | SceneAsset
    | ObjectAsset
    | PartAsset
    | MaterialAsset
    | TextureAsset;
  type MeshAsset = SceneAsset | ObjectAsset | PartAsset;
  interface SceneInfo {
    geometry: string;
    delivery: string;
    provenance: { rights?: string; [key: string]: unknown };
    rigs: Rig[];
  }
  interface CatalogData {
    nodes: Record<string, Asset>;
    scenes: Record<string, SceneInfo>;
  }
  interface Route {
    id: string;
    query: string;
    kind: string;
    tag: string;
  }
  interface Owner extends SceneInfo {
    entry: SceneAsset;
  }
  interface Catalog {
    kinds: Kind[];
    records: Asset[];
    tags: string[];
    get(id: string): Asset | undefined;
    title(entry: Asset): string;
    search(state: Route): Asset[];
    owners(entry: Asset): Owner[];
    readRoute(hash: string): Route;
    route(state: Route): string;
  }
  interface Motion {
    clips: Clip[];
    joints: Joint[];
    angles(clip: string, time: number): Record<string, number>;
    transforms(
      clip?: string,
      time?: number,
      manual?: Record<string, number>,
    ): Map<string, Matrix>;
    bounds(parts: PartAsset[]): Bounds;
  }
  interface MotionAPI {
    create(rig: unknown, partIds: string[]): Motion;
    identity(): Matrix;
    point(m: Matrix, p: number[]): Vec3;
  }
  interface Viewer {
    show(entry?: Asset): Promise<boolean>;
    rotate(x: number, y?: number): void;
    zoom(factor: number): void;
    reset(): void;
    checker(value: boolean): void;
    snapshot(): string | null;
    dispose(): void;
    motionInfo(): Motion | null;
    pose(
      clip?: string,
      seconds?: number,
      manual?: Record<string, number>,
    ): void;
  }
  interface Playback {
    select(): void;
    clear(): void;
    pause(): void;
  }
}
declare var DCCMotion: DCC.MotionAPI;
declare namespace DCC {
  interface ModelPart {
    slug: string;
    title: string;
    description: string;
    role: "opaque" | "water";
    visible: boolean;
    bounds: Bounds;
    meshes: Mesh[];
  }
  interface ModelObject {
    title: string;
    tags: string[];
    parts: string[];
    rig?: string;
    variantOf?: string;
  }
  interface AssetModel {
    scene: string;
    title: string;
    summary: string;
    tags: string[];
    source: string;
    geometry: string;
    provenance: SceneInfo["provenance"];
    rigs: Rig[];
    parts: ModelPart[];
    objects: Record<string, ModelObject>;
    waterResources: Record<string, string>;
  }
  interface VerifiedScene {
    slug: string;
    delivery: string;
    model: AssetModel;
    files: Record<string, string>;
  }
  interface GalleryInput {
    sourceRoot: string;
    output: string;
    scenes: VerifiedScene[];
  }
}
