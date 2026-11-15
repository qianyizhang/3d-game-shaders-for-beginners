import { Spherical, Vector3 } from "three";

import { defaults, legacyEffects, type Effect, type Effects } from "./effects";
import { effectPanel, type Control, type Lesson } from "./lessons";

import bookmarks from "./bookmarks.json";
export { bookmarks };
export type Bookmark = keyof typeof bookmarks;
export type CameraPose = typeof bookmarks.Waterline;
type ReadonlyCameraPose = Readonly<Omit<CameraPose, "target" | "offset"> & {
  target: readonly number[]; offset: readonly number[];
}>;
export type Point3 = [number, number, number];
export interface PracticeProfile {
  bookmarks: Record<Bookmark, CameraPose>;
  start: Bookmark;
  swatch: { center: Point3; radius: number };
  smoke: { origin: Point3; scale: number };
  focus: { near: Point3; far: Point3 };
  reflectionAim: Point3;
}

export const legacy = {
  rior: 1.05, foamDepth: 1.5, fogNear: 2, fogFar: 9,
  focus: [0.509167, 0.598] as [number, number],
};

export type ActionResult = { applied: true } | {
  applied: false;
  reason: "frozen" | "not-frozen" | "unavailable" | "invalid-value";
};
type LessonSetup = Pick<Lesson, "id" | "scene" | "initial" | "reference" | "controls" | "action">;
type Side = "A" | "B";
type Animation = "flow" | "wheel" | "props" | "legacyLink";
type JointPose = { reference: number[]; experiment: number[] };
type SceneOptions = { hdr?: boolean; jointLimits?: readonly number[] };
type AdvanceResult = { applied: true; changed: boolean } | Extract<ActionResult, { applied: false }>;
const applied: ActionResult = Object.freeze({ applied: true });
const rejected = (reason: Extract<ActionResult, { applied: false }>["reason"]): Extract<ActionResult, { applied: false }> => ({ applied: false, reason });

function accepts(control: Control, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if ("min" in control) return value >= control.min && value <= control.max;
  if ("choices" in control) return Number.isInteger(value) && value >= 0 && value < control.choices.length;
  return value === 0 || value === 1;
}

export class LabState {
  // Gesture calculations intentionally remain outside the comparison seam.
  readonly orbit = new Spherical();
  readonly target = new Vector3();
  #data = {
    bookmark: "Waterline" as Bookmark,
    sun: 270, time: 1, frame: 60, playing: false,
    effects: Object.freeze({ ...defaults }),
    baseline: Object.freeze({ rior: legacy.rior, refraction: 1 }) as Readonly<Partial<Effects>>,
    legacyLink: true, flow: true, wheel: true, props: true,
    propsTime: 1, shutterSun: 270, waterTime: 1, wheelTime: 1,
    focus: Object.freeze([...legacy.focus]) as readonly [number, number],
    side: "B" as Side,
    jointPose: undefined as JointPose | undefined,
    sweepFrame: null as number | null, sweepOffset: 0, sweepStart: null as number | null,
  };
  #lesson?: LessonSetup;
  #pose: ReadonlyCameraPose = bookmarks.Waterline;
  readonly #waterline?: CameraPose;
  readonly #practice?: PracticeProfile;
  readonly #hdr: boolean;
  readonly #jointLimits: readonly number[];

  constructor(waterline?: CameraPose, practice?: PracticeProfile, options: SceneOptions = {}) {
    this.#waterline = waterline && structuredClone(waterline);
    this.#practice = practice && structuredClone(practice);
    this.#hdr = options.hdr ?? true;
    this.#jointLimits = [...options.jointLimits ?? []];
    this.restoreBookmark(practice?.start ?? "Waterline");
  }
  get bookmark() { return this.#data.bookmark; }
  get sun() { return this.#data.sun; }
  get time() { return this.#data.time; }
  get frame() { return this.#data.frame; }
  get playing() { return this.#data.playing; }
  get effects() { return this.#data.effects; }
  get legacyLink() { return this.#data.legacyLink; }
  get flow() { return this.#data.flow; }
  get wheel() { return this.#data.wheel; }
  get props() { return this.#data.props; }
  get propsTime() { return this.#data.propsTime; }
  get shutterSun() { return this.#data.shutterSun; }
  get waterTime() { return this.#data.waterTime; }
  get wheelTime() { return this.#data.wheelTime; }
  get focus() { return this.#data.focus; }
  get side() { return this.#data.side; }
  get frozen() { return this.#data.jointPose !== undefined; }
  get sweepFrame() { return this.#data.sweepFrame; }
  get sweepOffset() { return this.#data.sweepOffset; }

  availability() {
    const posing = this.#lesson?.action === "pose" && this.#jointLimits.length > 0;
    return {
      playback: !this.frozen, bookmark: !this.frozen,
      freezePose: posing && !this.frozen, editJoint: posing && this.frozen,
      pinReference: posing ? this.frozen : !!this.#lesson?.controls?.length,
      sweep: this.#lesson?.action === "sweep" && !this.frozen,
      shaderEdit: this.#lesson?.action === "edit",
      legacy: !this.#waterline && !this.frozen,
    } as const;
  }
  snapshot() {
    const { sweepStart, ...data } = this.#data;
    return {
      ...data, sweeping: sweepStart !== null, lessonId: this.#lesson?.id,
      effects: { ...data.effects } as Readonly<Effects>,
      baseline: { ...data.baseline } as Readonly<Partial<Effects>>,
      focus: [...data.focus] as readonly [number, number],
      jointPose: data.jointPose && ({
        reference: [...data.jointPose.reference] as readonly number[],
        experiment: [...data.jointPose.experiment] as readonly number[],
      } as const),
      availability: this.availability(),
    } as const;
  }
  pose(): ReadonlyCameraPose { return this.#pose; }
  openBookmark(name: Bookmark, entryPose?: CameraPose): ActionResult {
    if (!this.availability().bookmark) return rejected("frozen");
    if (!Object.hasOwn(bookmarks, name)) return rejected("invalid-value");
    this.restoreBookmark(name, entryPose);
    return applied;
  }
  private restoreBookmark(name: Bookmark, entryPose?: CameraPose) {
    const data = this.#data;
    data.bookmark = name;
    const pose = entryPose ?? this.#practice?.bookmarks[name] ??
      (name === "Waterline" && this.#waterline ? this.#waterline : bookmarks[name]);
    this.#pose = Object.freeze({
      ...pose, target: Object.freeze([...pose.target]), offset: Object.freeze([...pose.offset]),
    });
    this.target.fromArray(pose.target);
    this.orbit.setFromVector3(new Vector3().fromArray(pose.offset));
    data.sun = data.shutterSun = pose.sun;
    data.time = data.waterTime = data.wheelTime = data.propsTime = 1;
    data.sweepOffset = 0;
    data.frame = 60;
    data.focus = Object.freeze([...legacy.focus]) as readonly [number, number];
    data.playing = false;
    data.sweepFrame = data.sweepStart = null;
  }
  enterLesson(lesson: LessonSetup) {
    this.#lesson = structuredClone(lesson);
    const data = this.#data;
    data.jointPose = undefined;
    const effects = { ...defaults, ...lesson.initial };
    if (!this.#hdr && effects.bloom === 2) effects.bloom = 1;
    data.effects = Object.freeze(effects);
    data.baseline = Object.freeze({ ...lesson.reference });
    data.flow = data.wheel = data.props = data.legacyLink = true;
    data.side = "B";
    this.restoreBookmark(lesson.scene);
  }
  resetLesson(): ActionResult {
    if (!this.#lesson) return rejected("unavailable");
    this.enterLesson(this.#lesson);
    return applied;
  }
  activeEffects(): Readonly<Effects> {
    return this.side === "A" ? Object.freeze({ ...this.effects, ...this.#data.baseline }) : this.effects;
  }
  editEffect(key: Effect, value: number): ActionResult {
    const control = this.#lesson?.controls?.find(control => control.key === key) ?? effectPanel.find(control => control.key === key);
    if (!control) return rejected("unavailable");
    if (!accepts(control, value)) return rejected("invalid-value");
    if (key === "bloom" && value === 2 && !this.#hdr) return rejected("unavailable");
    this.#data.effects = Object.freeze({ ...this.effects, [key]: value });
    this.showExperiment();
    return applied;
  }
  selectSide(side: Side): ActionResult {
    if (side !== "A" && side !== "B") return rejected("invalid-value");
    this.#data.side = side;
    this.#data.playing = false;
    // Hold the sampled camera motion; unlike stopSweep, do not clear its history.
    this.#data.sweepStart = null;
    return applied;
  }
  private showExperiment() {
    this.#data.side = "B";
    this.#data.playing = false;
    // Effect, pose and shader edits do not stop a replaying sweep.
  }
  pinReference(): ActionResult {
    if (this.#lesson?.action === "pose" && !this.frozen) return rejected("not-frozen");
    if (!this.availability().pinReference || !this.#lesson) return rejected("unavailable");
    if (this.#lesson.action === "pose" && this.#data.jointPose) {
      this.#data.jointPose.reference = [...this.#data.jointPose.experiment];
    } else {
      const keys = new Set<Effect>([
        ...Object.keys(this.#lesson.reference) as Effect[],
        ...(this.#lesson.controls ?? []).map(control => control.key),
      ]);
      this.#data.baseline = Object.freeze(Object.fromEntries([...keys].map(key => [key, this.effects[key]])));
    }
    this.showExperiment();
    return applied;
  }
  freezePose(): ActionResult {
    if (this.frozen) return rejected("frozen");
    if (!this.availability().freezePose) return rejected("unavailable");
    this.#data.jointPose = {
      reference: this.#jointLimits.map(() => 0), experiment: this.#jointLimits.map(() => 0),
    };
    this.showExperiment();
    return applied;
  }
  unfreezePose(): ActionResult {
    if (!this.frozen) return rejected("not-frozen");
    this.#data.jointPose = undefined;
    this.showExperiment();
    return applied;
  }
  editJoint(index: number, degrees: number): ActionResult {
    if (!this.#data.jointPose) return rejected("not-frozen");
    const limit = this.#jointLimits[index];
    if (!Number.isInteger(index) || limit === undefined || !Number.isFinite(degrees) || Math.abs(degrees) > limit) {
      return rejected("invalid-value");
    }
    this.#data.jointPose.experiment[index] = degrees;
    this.showExperiment();
    return applied;
  }
  experimentOffset(index: number): number {
    return this.#data.jointPose?.experiment[index] ?? 0;
  }
  jointOffset(index: number): number {
    const offsets = this.side === "A" ? this.#data.jointPose?.reference : this.#data.jointPose?.experiment;
    return offsets?.[index] ?? 0;
  }
  useLegacy(): ActionResult {
    if (!this.availability().legacy) return rejected(this.frozen ? "frozen" : "unavailable");
    this.#data.effects = Object.freeze({ ...defaults, ...legacyEffects });
    this.#data.legacyLink = true;
    this.restoreBookmark("Overview");
    this.#data.side = "B";
    return applied;
  }
  setSun(value: number): ActionResult {
    if (!Number.isFinite(value) || value < 0 || value > 360) return rejected("invalid-value");
    this.#data.sun = value;
    if (this.props) this.#data.shutterSun = value;
    return applied;
  }
  setAnimation(key: Animation, enabled: boolean): ActionResult {
    if (!["flow", "wheel", "props", "legacyLink"].includes(key) || typeof enabled !== "boolean") return rejected("invalid-value");
    this.#data[key] = enabled;
    if (key === "props" && enabled) this.#data.shutterSun = this.sun;
    return applied;
  }
  setFocus(x: number, y: number): ActionResult {
    if (![x, y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return rejected("invalid-value");
    this.#data.focus = Object.freeze([x, y]);
    return applied;
  }
  shaderEditApplied(): ActionResult {
    if (!this.availability().shaderEdit) return rejected("unavailable");
    this.showExperiment();
    return applied;
  }
  togglePlayback(): ActionResult {
    if (!this.availability().playback) return rejected("frozen");
    this.#data.playing = !this.playing;
    return applied;
  }
  stepFrame(): ActionResult {
    if (!this.availability().playback) return rejected("frozen");
    this.#data.playing = false;
    this.step(1 / 60);
    return applied;
  }
  private step(dt: number) {
    const data = this.#data;
    data.time += dt;
    data.frame += 1;
    if (data.props) data.propsTime += dt;
    if (data.flow) data.waterTime += dt;
    if (data.wheel && (!data.legacyLink || data.flow)) data.wheelTime += dt;
  }
  replaySweep(nowMs: number): ActionResult {
    if (!this.availability().sweep) return rejected("unavailable");
    if (!Number.isFinite(nowMs) || nowMs < 0) return rejected("invalid-value");
    this.#data.playing = false;
    this.#data.sweepFrame = 0;
    this.#data.sweepStart = nowMs;
    return applied;
  }
  holdSweep(): ActionResult {
    if (!this.availability().sweep) return rejected("unavailable");
    this.#data.sweepStart = null;
    this.#data.sweepFrame = this.sweepFrame && this.sweepFrame > 0 ? this.sweepFrame : 16;
    return applied;
  }
  stopSweep(): ActionResult {
    if (!this.availability().sweep) return rejected("unavailable");
    this.finishSweep();
    return applied;
  }
  private finishSweep() {
    this.#data.sweepStart = null;
    if (this.sweepFrame !== null) this.#data.sweepOffset = this.sweepFrame * 0.008;
    this.#data.sweepFrame = null;
  }
  advance(nowMs: number, dtSeconds: number): AdvanceResult {
    if (!Number.isFinite(nowMs) || nowMs < 0 || !Number.isFinite(dtSeconds) || dtSeconds < 0) return rejected("invalid-value");
    const data = this.#data;
    let changed = false;
    if (data.sweepStart !== null) {
      if (nowMs < data.sweepStart) return rejected("invalid-value");
      const frame = Math.floor((nowMs - data.sweepStart) / 42);
      if (frame < 48) data.sweepFrame = frame;
      else this.finishSweep();
      changed = true;
    }
    if (data.playing) {
      this.step(Math.min(0.05, dtSeconds));
      changed = true;
    }
    return { applied: true, changed };
  }
}
