import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

// Use the existing TS loader without starting HTTP, WebSocket or file watchers.
const loader = await createServer({
  configFile: false, server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let LabState, bookmarks, lessons, practiceLessons;
try {
  ({ LabState, bookmarks } = await loader.ssrLoadModule("/src/state.ts"));
  ({ lessons, practiceLessons } = await loader.ssrLoadModule("/src/lessons.ts"));
} finally {
  await loader.close();
}
const lesson = id => {
  const found = practiceLessons("the creature", true).find(entry => entry.id === id);
  assert.ok(found, id);
  return found;
};
const enter = (id, options) => {
  const state = new LabState(undefined, undefined, options);
  state.enterLesson(lesson(id));
  return state;
};
const ok = result => assert.equal(result.applied, true);
const unchanged = (state, action, reason) => {
  const before = state.snapshot();
  const camera = [state.orbit.clone(), state.target.clone()];
  assert.deepEqual(action(), { applied: false, reason });
  assert.deepEqual(state.snapshot(), before, "Rejected actions must be atomic");
  assert.deepEqual([state.orbit, state.target], camera);
};

test("every lesson resets its comparison, clocks, toggles, focus and camera", () => {
  for (const entry of [...lessons, ...practiceLessons("the creature", true)]) {
    const state = new LabState(undefined, undefined, { jointLimits: [32, 12] });
    state.enterLesson(entry);
    const initial = state.snapshot();
    const camera = [state.orbit.clone(), state.target.clone()];
    ok(state.stepFrame());
    ok(state.setAnimation("flow", false));
    ok(state.setAnimation("wheel", false));
    ok(state.setAnimation("props", false));
    ok(state.setAnimation("legacyLink", false));
    ok(state.setSun(90));
    ok(state.setFocus(0.2, 0.7));
    ok(state.editEffect("shadows", 0));
    state.orbit.theta += 0.4;
    state.target.x += 2;
    if (entry.action === "pose") {
      ok(state.freezePose());
      ok(state.editJoint(0, 25));
      ok(state.pinReference());
    } else if (entry.action === "sweep") {
      ok(state.replaySweep(100));
      ok(state.advance(772, 0.02));
    }
    ok(state.selectSide("A"));
    ok(state.resetLesson());
    assert.deepEqual(state.snapshot(), initial, entry.id);
    assert.deepEqual([state.orbit, state.target], camera, entry.id);
  }
});

test("A pins lesson controls and reference keys while other effects remain shared", () => {
  const setup = { ...lesson("material"), reference: { normals: 0, shadows: 0 } };
  const state = new LabState();
  state.enterLesson(setup);
  ok(state.editEffect("texture", 0));
  ok(state.editEffect("normals", 2));
  ok(state.editEffect("shadows", 1));
  ok(state.pinReference());
  assert.deepEqual(state.snapshot().baseline, { normals: 2, shadows: 1, texture: 0 });
  ok(state.editEffect("normals", 1));
  ok(state.editEffect("rim", 1));
  ok(state.selectSide("A"));
  assert.equal(state.activeEffects().normals, 2);
  assert.equal(state.activeEffects().rim, 1);
  ok(state.selectSide("B"));
  assert.equal(state.activeEffects().normals, 1);
  assert.equal(state.activeEffects().rim, 1);
});

test("freeze holds the animated frame; pin copies ordered offsets; unfreeze clears without a time jump", () => {
  // Two rigs may reuse joint names. Their ordered limits, not IDs, identify offsets.
  const state = enter("pose", { jointLimits: [32, 12, 32] });
  for (let i = 0; i < 3; i++) ok(state.stepFrame());
  const clock = [state.time, state.frame, state.propsTime, state.waterTime, state.wheelTime];
  ok(state.togglePlayback());
  ok(state.freezePose());
  assert.equal(state.playing, false);
  assert.equal(state.availability().playback, false);
  assert.equal(state.availability().bookmark, false);
  unchanged(state, () => state.togglePlayback(), "frozen");
  unchanged(state, () => state.stepFrame(), "frozen");
  unchanged(state, () => state.openBookmark("Overview"), "frozen");
  unchanged(state, () => state.freezePose(), "frozen");
  assert.deepEqual(state.advance(3000, 1), { applied: true, changed: false });
  ok(state.editJoint(0, 32));
  ok(state.editJoint(2, -18));
  assert.equal(state.experimentOffset(0), 32);
  assert.equal(state.experimentOffset(1), 0);
  ok(state.selectSide("A"));
  assert.equal(state.jointOffset(0), 0);
  ok(state.pinReference());
  assert.equal(state.side, "B");
  ok(state.editJoint(0, -32));
  ok(state.selectSide("A"));
  assert.equal(state.jointOffset(0), 32);
  assert.equal(state.jointOffset(2), -18);
  ok(state.unfreezePose());
  assert.equal(state.side, "B");
  assert.equal(state.playing, false);
  assert.equal(state.jointOffset(0), 0);
  assert.deepEqual([state.time, state.frame, state.propsTime, state.waterTime, state.wheelTime], clock);
  assert.equal(state.availability().playback, true);
  ok(state.stepFrame());
  assert.equal(state.frame, clock[1] + 1);
  ok(state.freezePose());
  assert.equal(state.experimentOffset(0), 0);
});

test("pose preconditions and limits reject without changing either side", () => {
  const state = enter("pose", { jointLimits: [32, 12] });
  unchanged(state, () => state.pinReference(), "not-frozen");
  unchanged(state, () => state.editJoint(0, 2), "not-frozen");
  unchanged(state, () => state.unfreezePose(), "not-frozen");
  ok(state.freezePose());
  for (const index of [-1, 2, 0.5, NaN]) unchanged(state, () => state.editJoint(index, 2), "invalid-value");
  for (const angle of [-33, 33, NaN, Infinity, -Infinity]) {
    unchanged(state, () => state.editJoint(0, angle), "invalid-value");
  }
  unchanged(state, () => state.editJoint(1, 13), "invalid-value");
  state.enterLesson(lesson("refraction"));
  assert.equal(state.frozen, false);
  assert.equal(state.frame, 60);
  unchanged(state, () => state.freezePose(), "unavailable");
  const noRigs = enter("pose");
  unchanged(noRigs, () => noRigs.freezePose(), "unavailable");
});

test("selecting A/B holds a sweep sample; stopping keeps its angle without motion history", () => {
  const state = enter("motion");
  ok(state.togglePlayback());
  ok(state.replaySweep(100));
  assert.equal(state.playing, false);
  assert.equal(state.snapshot().sweeping, true);
  ok(state.advance(100 + 42 * 16, 1));
  assert.equal(state.sweepFrame, 16);
  assert.equal(state.frame, 60);
  ok(state.selectSide("A"));
  assert.equal(state.snapshot().sweeping, false);
  assert.deepEqual(state.advance(10000, 1), { applied: true, changed: false });
  assert.equal(state.sweepFrame, 16);
  ok(state.stopSweep());
  assert.equal(state.sweepFrame, null);
  assert.equal(state.sweepOffset, 16 * 0.008);
  ok(state.holdSweep());
  assert.equal(state.sweepFrame, 16);
  ok(state.replaySweep(20000));
  ok(state.advance(20000 + 42 * 47, 0));
  ok(state.advance(20000 + 42 * 48, 0));
  assert.equal(state.sweepFrame, null);
  assert.equal(state.sweepOffset, 47 * 0.008);
});

test("effect edits and pinning select B without cancelling a sweep replay", () => {
  const state = enter("motion");
  ok(state.selectSide("A"));
  ok(state.replaySweep(0));
  ok(state.editEffect("motionStrength", 2));
  assert.equal(state.side, "B");
  ok(state.advance(420, 0));
  assert.equal(state.sweepFrame, 10);
  ok(state.pinReference());
  ok(state.advance(840, 0));
  assert.equal(state.sweepFrame, 20);
  ok(state.togglePlayback());
  ok(state.holdSweep());
  assert.equal(state.playing, true, "Holding the camera does not pause separately started scene playback");
  ok(state.advance(1000, 1 / 60));
  assert.equal(state.sweepFrame, 20);
  assert.equal(state.frame, 61);
  ok(state.resetLesson());
  assert.deepEqual(state.advance(2000, 1), { applied: true, changed: false });
  assert.equal(state.sweepFrame, null);
});

test("bookmark changes keep comparison values; lesson entry cancels a pending sweep", () => {
  const state = enter("motion");
  ok(state.editEffect("motionStrength", 2));
  ok(state.pinReference());
  ok(state.selectSide("A"));
  ok(state.openBookmark("Waterline"));
  assert.equal(state.side, "A");
  assert.equal(state.activeEffects().motionStrength, 2);
  ok(state.replaySweep(100));
  state.enterLesson(lesson("material"));
  const fresh = state.snapshot();
  assert.deepEqual(state.advance(10000, 1), { applied: true, changed: false });
  assert.deepEqual(state.snapshot(), fresh);
  unchanged(state, () => state.replaySweep(0), "unavailable");
  unchanged(state, () => state.holdSweep(), "unavailable");
  unchanged(state, () => state.stopSweep(), "unavailable");
});

test("Legacy resets its camera and clock but retains the current lesson reference and toggles", () => {
  const state = enter("refraction");
  ok(state.editEffect("rior", 0.935));
  ok(state.pinReference());
  ok(state.setAnimation("flow", false));
  ok(state.setAnimation("props", false));
  ok(state.setAnimation("legacyLink", false));
  ok(state.stepFrame());
  ok(state.useLegacy());
  assert.equal(state.bookmark, "Overview");
  assert.equal(state.time, 1);
  assert.equal(state.legacyLink, true);
  assert.equal(state.flow, false);
  assert.equal(state.props, false);
  assert.equal(state.effects.rior, 1.05);
  ok(state.selectSide("A"));
  assert.equal(state.activeEffects().rior, 0.935);
  ok(state.stepFrame());
  assert.equal(state.wheelTime, 1);
  ok(state.setAnimation("legacyLink", false));
  ok(state.stepFrame());
  assert.ok(state.wheelTime > 1);
  assert.equal(state.waterTime, 1);
  assert.equal(state.propsTime, 1);
  ok(state.resetLesson());
  assert.equal(state.bookmark, "Waterline");
  assert.equal(state.flow, true);
});

test("scene clocks pause independently; enabling props catches shutters up to the sun", () => {
  const state = enter("refraction");
  ok(state.setAnimation("props", false));
  ok(state.setAnimation("wheel", false));
  ok(state.setSun(90));
  assert.equal(state.shutterSun, 270);
  ok(state.stepFrame());
  assert.equal(state.propsTime, 1);
  assert.equal(state.wheelTime, 1);
  assert.ok(state.waterTime > 1);
  ok(state.setAnimation("props", true));
  assert.equal(state.shutterSun, 90);
  ok(state.togglePlayback());
  const time = state.time;
  ok(state.advance(1000, 5));
  assert.equal(state.time, time + 0.05, "Animation-frame elapsed time retains the existing clamp");
  assert.equal(state.frame, 62);
});

test("authored startup staging can differ from the lesson reset staging", () => {
  const staged = structuredClone(bookmarks);
  staged.Waterline = { ...staged.Waterline, sun: 180, target: [4, 5, 6] };
  const entryPose = { ...bookmarks.Waterline, sun: 225, target: [1, 2, 3] };
  const practice = { start: "Overview", bookmarks: staged };
  const state = new LabState(entryPose, practice);
  state.enterLesson(lesson("refraction"));
  ok(state.openBookmark(practice.start, entryPose));
  assert.deepEqual(state.target.toArray(), [1, 2, 3]);
  assert.equal(state.sun, 225);
  entryPose.target[0] = 99;
  staged.Waterline.target[0] = 99;
  assert.deepEqual(state.pose().target, [1, 2, 3]);
  ok(state.resetLesson());
  assert.equal(state.bookmark, "Waterline");
  assert.deepEqual(state.target.toArray(), [4, 5, 6]);
  assert.equal(state.sun, 180);
  unchanged(state, () => state.useLegacy(), "unavailable");
});

test("snapshots, definitions and renderer reads cannot mutate comparison state", () => {
  const setup = structuredClone(lesson("pose"));
  const limits = [32];
  const state = new LabState(undefined, undefined, { jointLimits: limits });
  state.enterLesson(setup);
  ok(state.freezePose());
  ok(state.editJoint(0, 20));
  ok(state.pinReference());
  const before = state.snapshot();
  const snapshot = state.snapshot();
  snapshot.jointPose.reference[0] = 99;
  snapshot.jointPose.experiment[0] = 99;
  snapshot.effects.rior = 99;
  snapshot.baseline.rior = 99;
  snapshot.focus[0] = 99;
  snapshot.side = "A";
  snapshot.availability.playback = true;
  assert.deepEqual(state.snapshot(), before);
  assert.throws(() => { state.effects.rior = 99; }, TypeError);
  assert.throws(() => { state.activeEffects().rior = 99; }, TypeError);
  assert.throws(() => { state.focus[0] = 99; }, TypeError);
  assert.throws(() => { state.playing = true; }, TypeError);
  assert.throws(() => { state.pose().sun = 99; }, TypeError);
  assert.throws(() => { state.pose().target[0] = 99; }, TypeError);
  assert.throws(() => { state.pose().offset[0] = 99; }, TypeError);
  limits[0] = 99;
  unchanged(state, () => state.editJoint(0, 40), "invalid-value");
  setup.initial.rior = 99;
  ok(state.resetLesson());
  assert.equal(state.effects.rior, 0.935);
});

test("SDR lesson entry falls back to legacy bloom and rejects HDR edits", () => {
  const state = enter("bloom", { hdr: false });
  assert.equal(state.effects.bloom, 1);
  unchanged(state, () => state.editEffect("bloom", 2), "unavailable");
  ok(state.editEffect("bloom", 0));
  ok(state.resetLesson());
  assert.equal(state.effects.bloom, 1);
});

test("invalid controls and frame inputs leave all state unchanged", () => {
  const state = enter("refraction");
  for (const value of [NaN, Infinity, 0.5, 2]) unchanged(state, () => state.editEffect("rior", value), "invalid-value");
  unchanged(state, () => state.editEffect("normals", 0.5), "invalid-value");
  unchanged(state, () => state.editEffect("shadows", 2), "invalid-value");
  unchanged(state, () => state.editEffect("unknown", 1), "unavailable");
  unchanged(state, () => state.selectSide("C"), "invalid-value");
  unchanged(state, () => state.openBookmark("unknown"), "invalid-value");
  unchanged(state, () => state.setSun(NaN), "invalid-value");
  unchanged(state, () => state.setFocus(0.5, 2), "invalid-value");
  unchanged(state, () => state.setAnimation("unknown", true), "invalid-value");
  unchanged(state, () => state.setAnimation("flow", 1), "invalid-value");
  state.enterLesson(lesson("motion"));
  unchanged(state, () => state.replaySweep(NaN), "invalid-value");
  ok(state.replaySweep(100));
  for (const [now, dt] of [[99, 0], [NaN, 0], [200, NaN], [200, -1]]) {
    unchanged(state, () => state.advance(now, dt), "invalid-value");
  }
});

test("only a successful shader edit selects B and pauses playback", () => {
  const state = enter("refraction");
  ok(state.selectSide("A"));
  ok(state.togglePlayback());
  ok(state.shaderEditApplied());
  assert.equal(state.side, "B");
  assert.equal(state.playing, false);
  state.enterLesson(lesson("material"));
  unchanged(state, () => state.shaderEditApplied(), "unavailable");
  state.enterLesson(lesson("spaces"));
  unchanged(state, () => state.pinReference(), "unavailable");
  const fresh = new LabState();
  unchanged(fresh, () => fresh.resetLesson(), "unavailable");
});
