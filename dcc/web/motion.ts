/* Authored rigid-joint clips. Angles are degrees; pivots and axes are rest-world. */
(() => {
  const identity = (): DCC.Matrix => [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ];
  const finite = (x: unknown): x is number =>
    typeof x === "number" && Number.isFinite(x);
  const vector = (x: unknown): x is DCC.Vec3 =>
    Array.isArray(x) && x.length === 3 && x.every(finite);
  function assert(ok: unknown, message: string): asserts ok {
    if (!ok) throw new Error("Invalid motion: " + message);
  }
  const object = (x: unknown): x is Record<string, unknown> =>
    x !== null && typeof x === "object" && !Array.isArray(x);
  const multiply = (a: DCC.Matrix, b: DCC.Matrix) =>
    Array.from({ length: 16 }, (_, i) => {
      const row = i % 4,
        col = Math.floor(i / 4);
      return [0, 1, 2, 3].reduce(
        (sum, k) => sum + a[k * 4 + row]! * b[col * 4 + k]!,
        0,
      );
    });
  const point = (m: DCC.Matrix, p: number[]): DCC.Vec3 =>
    [0, 1, 2].map(
      (i) => m[i]! * p[0]! + m[4 + i]! * p[1]! + m[8 + i]! * p[2]! + m[12 + i]!,
    ) as DCC.Vec3;
  function hinge(pivot: DCC.Vec3, axis: DCC.Vec3, degrees: number) {
    const length = Math.hypot(...axis),
      [x, y, z] = axis.map((v) => v / length) as DCC.Vec3;
    const a = (degrees * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a),
      t = 1 - c;
    const m = [
      t * x * x + c,
      t * x * y + s * z,
      t * x * z - s * y,
      0,
      t * x * y - s * z,
      t * y * y + c,
      t * y * z + s * x,
      0,
      t * x * z + s * y,
      t * y * z - s * x,
      t * z * z + c,
      0,
      0,
      0,
      0,
      1,
    ];
    const rotated = point(m, pivot);
    for (let i = 0; i < 3; i++) m[12 + i] = pivot[i]! - rotated[i]!;
    return m;
  }
  function validateRig(
    rig: unknown,
    partIds: string[],
  ): asserts rig is DCC.Rig & { clips: DCC.Clip[] } {
    assert(
      object(rig) &&
        typeof rig.name === "string" &&
        Array.isArray(rig.joints) &&
        rig.joints.length > 0 &&
        rig.joints.length <= 32,
      "joint list",
    );
    const joints = new Map<string, number>(),
      claimed = new Set<string>();
    for (const joint of rig.joints as unknown[]) {
      assert(object(joint), "joint");
      assert(
        typeof joint.id === "string" && !joints.has(joint.id),
        "duplicate joint",
      );
      assert(
        joint.parent === undefined ||
          (typeof joint.parent === "string" && joints.has(joint.parent)),
        "parent must precede child",
      );
      assert(
        vector(joint.pivot) &&
          vector(joint.axis) &&
          Math.hypot(...joint.axis) > 1e-6,
        "pivot/axis",
      );
      assert(
        finite(joint.poseLimit) && joint.poseLimit > 0 && joint.poseLimit <= 90,
        "joint limit",
      );
      assert(
        joint.label === undefined || typeof joint.label === "string",
        "joint label",
      );
      for (const key of ["amplitude", "phase", "speed"])
        assert(joint[key] === undefined || finite(joint[key]), "joint motion");
      assert(
        Array.isArray(joint.parts) && joint.parts.length > 0,
        "joint parts",
      );
      for (const part of joint.parts as unknown[]) {
        assert(
          typeof part === "string" &&
            partIds.includes(part) &&
            !claimed.has(part),
          "unknown or reused part",
        );
        claimed.add(part);
      }
      joints.set(joint.id, joint.poseLimit);
    }
    const clips = new Set<string>();
    assert(Array.isArray(rig.clips) && rig.clips.length <= 16, "clip list");
    for (const clip of rig.clips as unknown[]) {
      assert(object(clip), "clip");
      assert(
        typeof clip.id === "string" && clip.id && !clips.has(clip.id),
        "duplicate clip",
      );
      assert(
        typeof clip.label === "string" && clip.label.length > 0,
        "clip label",
      );
      assert(
        clip.description === undefined || typeof clip.description === "string",
        "clip description",
      );
      assert(
        finite(clip.duration) && clip.duration > 0 && clip.duration <= 60,
        "clip duration",
      );
      assert(object(clip.tracks), "tracks");
      for (const [id, track] of Object.entries(clip.tracks)) {
        const limit = joints.get(id);
        assert(limit !== undefined && object(track), "unknown track joint");
        if (track.keys !== undefined) {
          assert(
            Array.isArray(track.keys) && track.keys.length >= 2,
            "keyframes",
          );
          let prior = -1;
          for (const key of track.keys as unknown[]) {
            assert(
              Array.isArray(key) &&
                key.length === 2 &&
                finite(key[0]) &&
                finite(key[1]) &&
                key[0] > prior &&
                key[0] <= 1 &&
                key[0] >= 0 &&
                Math.abs(key[1]) <= limit,
              "keyframe order/range",
            );
            prior = key[0];
          }
          const keys = track.keys as [number, number][]; // Each pair was checked above.
          assert(
            keys[0]![0] === 0 &&
              keys.at(-1)![0] === 1 &&
              keys[0]![1] === keys.at(-1)![1],
            "loop seam",
          );
        } else {
          assert(
            finite(track.amplitude) &&
              finite(track.phase) &&
              finite(track.bias) &&
              track.amplitude >= 0 &&
              track.amplitude + Math.abs(track.bias) <= limit,
            "wave exceeds joint limit",
          );
        }
      }
      clips.add(clip.id);
    }
  }
  function create(rig: unknown, partIds: string[]): DCC.Motion {
    validateRig(rig, partIds);
    const joints = new Map(rig.joints.map((j) => [j.id, j]));
    const clips = new Map(rig.clips.map((c) => [c.id, c]));
    function angles(clipId: string, time: number): Record<string, number> {
      assert(finite(time) && time >= 0, "time");
      if (!clipId) return {};
      const clip = clips.get(clipId);
      assert(clip, "unknown clip");
      const phase = (time % clip.duration) / clip.duration;
      return Object.fromEntries(
        Object.entries(clip.tracks).map(([id, track]) => {
          if (!track.keys)
            return [
              id,
              track.bias +
                track.amplitude * Math.sin(2 * Math.PI * (phase + track.phase)),
            ];
          const i = track.keys.findIndex((key) => key[0] > phase);
          const a = track.keys[i - 1]!,
            b = track.keys[i]!;
          const t = (phase - a[0]) / (b[0] - a[0]),
            blend = (1 - Math.cos(Math.PI * t)) / 2;
          return [id, a[1] + (b[1] - a[1]) * blend];
        }),
      );
    }
    function transforms(
      clipId = "",
      time = 0,
      manual: Record<string, number> = {},
    ) {
      const values = angles(clipId, time),
        world = new Map<string, DCC.Matrix>(),
        parts = new Map<string, DCC.Matrix>();
      for (const [id, value] of Object.entries(manual)) {
        assert(
          joints.has(id) &&
            finite(value) &&
            Math.abs(value) <= joints.get(id)!.poseLimit,
          "manual angle",
        );
        values[id] = value;
      }
      for (const joint of joints.values()) {
        const local = hinge(joint.pivot, joint.axis, values[joint.id] ?? 0);
        const m = joint.parent
          ? multiply(world.get(joint.parent)!, local)
          : local;
        world.set(joint.id, m);
        joint.parts.forEach((part) => parts.set(part, m));
      }
      return parts;
    }
    function bounds(parts: DCC.PartAsset[]): DCC.Bounds {
      const low: DCC.Vec3 = [Infinity, Infinity, Infinity],
        high: DCC.Vec3 = [-Infinity, -Infinity, -Infinity];
      const include = (matrices: Map<string, DCC.Matrix>) => {
        for (const part of parts)
          for (let mask = 0; mask < 8; mask++) {
            const p = point(
              matrices.get(part.meshParts[0]!) ?? identity(),
              [0, 1, 2].map((i) => part.bounds[(mask >> i) & 1]![i]!),
            );
            p.forEach((v, i) => {
              low[i] = Math.min(low[i]!, v);
              high[i] = Math.max(high[i]!, v);
            });
          }
      };
      include(transforms());
      for (const clip of clips.values())
        for (let i = 0; i < 64; i++)
          include(transforms(clip.id, (clip.duration * i) / 64));
      for (const joint of joints.values())
        for (const sign of [-1, 1])
          include(transforms("", 0, { [joint.id]: joint.poseLimit * sign }));
      // Fixed envelope across clips keeps comparison framing steady. Margin covers sampling error.
      return [
        low.map((v, i) => v - (high[i]! - v) * 0.025) as DCC.Vec3,
        high.map((v, i) => v + (v - low[i]!) * 0.025) as DCC.Vec3,
      ];
    }
    return {
      clips: [...clips.values()],
      joints: [...joints.values()],
      angles,
      transforms,
      bounds,
    };
  }
  globalThis.DCCMotion = { create, identity, point };
})();
