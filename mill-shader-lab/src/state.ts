import { Spherical, Vector3 } from "three";

import { defaults, legacyEffects, type Effects } from "./effects";

import bookmarks from "./bookmarks.json";
export { bookmarks };
export type Bookmark = keyof typeof bookmarks;
export type CameraPose = typeof bookmarks.Waterline;
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

export class LabState {
  bookmark: Bookmark = "Waterline";
  orbit = new Spherical();
  target = new Vector3();
  sun = 270;
  time = 1;
  frame = 60;
  playing = false;
  effects: Effects = { ...defaults };
  baseline: Partial<Effects> = { rior: legacy.rior, refraction: 1 };
  legacyLink = true;
  sweepFrame: number | null = null;
  sweepOffset = 0;
  propsTime = 1;
  shutterSun = 270;
  flow = true;
  wheel = true;
  props = true;
  waterTime = 1;
  wheelTime = 1;
  focus: [number, number] = [...legacy.focus];
  side: "A" | "B" = "B";
  jointPose?: { reference: number[]; experiment: number[] };
  private entryPose?: CameraPose;
  constructor(private readonly waterline?: CameraPose, private readonly practice?: PracticeProfile) {
    this.open(practice?.start ?? "Waterline");
  }
  pose(name?: Bookmark): CameraPose {
    if (name === undefined && this.entryPose) return this.entryPose;
    name ??= this.bookmark;
    return this.practice?.bookmarks[name] ?? (name === "Waterline" && this.waterline ? this.waterline : bookmarks[name]);
  }
  open(name: Bookmark, entryPose?: CameraPose) {
    this.bookmark = name;
    this.entryPose = entryPose;
    const pose = this.pose();
    this.target.fromArray(pose.target);
    this.orbit.setFromVector3(new Vector3().fromArray(pose.offset));
    this.sun = pose.sun;
    this.time = this.waterTime = this.wheelTime = this.propsTime = 1;
    this.shutterSun = pose.sun;
    this.sweepOffset = 0;
    this.frame = 60;
    this.focus = [...legacy.focus];
    this.playing = false;
    this.sweepFrame = null;
  }
  activeEffects(): Effects {
    return this.side === "A" ? { ...this.effects, ...this.baseline } : this.effects;
  }
  freezePose(jointCount: number) {
    this.playing = false;
    this.jointPose = { reference: Array(jointCount).fill(0), experiment: Array(jointCount).fill(0) };
  }
  pinPose() {
    if (this.jointPose) this.jointPose.reference = [...this.jointPose.experiment];
  }
  jointOffset(index: number): number {
    const offsets = this.side === "A" ? this.jointPose?.reference : this.jointPose?.experiment;
    return offsets?.[index] ?? 0;
  }
  useLegacy() {
    this.effects = { ...defaults, ...legacyEffects };
    this.legacyLink = true;
  }
  step(dt: number) {
    if (this.jointPose) return;
    this.time += dt;
    this.frame += 1;
    if (this.props) this.propsTime += dt;
    if (this.flow) this.waterTime += dt;
    if (this.wheel && (!this.legacyLink || this.flow)) this.wheelTime += dt;
  }
}
