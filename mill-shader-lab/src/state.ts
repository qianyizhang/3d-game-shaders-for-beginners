import { Spherical, Vector3 } from "three";

import { defaults, legacyEffects, type Effects } from "./effects";

import bookmarks from "./bookmarks.json";
export { bookmarks };
export type Bookmark = keyof typeof bookmarks;

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
  constructor() { this.open("Waterline"); }
  open(name: Bookmark) {
    this.bookmark = name;
    const pose = bookmarks[name];
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
  useLegacy() {
    this.effects = { ...defaults, ...legacyEffects };
    this.legacyLink = true;
  }
  step(dt: number) {
    this.time += dt;
    this.frame += 1;
    if (this.props) this.propsTime += dt;
    if (this.flow) this.waterTime += dt;
    if (this.wheel && (!this.legacyLink || this.flow)) this.wheelTime += dt;
  }
}
