"""Authored rigid motion clips, independent of the gallery and shader lessons."""


def wave(joints, values):
    """Degrees and cycle phase; one period keeps the chain in rhythm."""
    return {joint["id"]: dict(amplitude=amplitude, phase=phase, bias=0)
            for joint, (amplitude, phase) in zip(joints, values, strict=True)}


def sweep(joints):
    """Show one joint at a time, returning to rest between demonstrations."""
    tracks = {}
    count = len(joints)
    for i, joint in enumerate(joints):
        start, end = i / count, (i + 1) / count
        span = end - start
        angle = joint["poseLimit"] * .55
        keys = [[0, 0]]
        if start > 0:
            keys.append([start, 0])
        keys.extend([[start+span*.25, angle], [start+span*.65, -angle], [end, 0]])
        if end < 1:
            keys.append([1, 0])
        tracks[joint["id"]] = {"keys": keys}
    return dict(id="joint-sweep", label="Joint sweep", duration=count*2,
                description="One hinge at a time. Watch which parts follow, then inspect that joint below.", tracks=tracks)


def koi_clips(joints, amber=False):
    # Small body yaw leads a larger tail sweep; the fork follows rather than fighting it.
    handedness = -1 if amber else 1
    values = lambda a: [(x, handedness*p) for x,p in a]
    return [
        dict(id="gentle", label="Gentle swim", duration=3.2 if amber else 3.6,
             description="Small, slow strokes. A quiet body lets the delayed tail and fork carry the motion.",
             tracks=wave(joints, values([(1.2, .5), (5.0, 0), (4.0, -.16)]))),
        dict(id="brisk", label="Brisk swim", duration=1.15 if amber else 1.35,
             description="A stronger, faster tail beat with restrained body sway. An in-place swim cycle, not a travel path.",
             tracks=wave(joints, values([(2.6, .5), (12.5, 0), (9.0, -.16)]))),
        sweep(joints),
    ]


def dragon_clips(joints):
    # Torso, chest, head, then four tail links. The body carries the pose;
    # gaze and tail motion are separate branches, with progressively delayed beats.
    return [
        dict(id="idle", label="Quiet watch", duration=5,
             description="A held puppet with a small head turn and a slow tail follow-through.",
             tracks=wave(joints, [(1.2, 0), (1.5, -.10), (4, -.20), (2, -.12), (1, -.23), (3, -.34), (1.5, -.44)])),
        dict(id="ripple", label="Ribbon dance", duration=2.8,
             description="One steady rhythm flows down the segmented tail. The head answers without driving the whole body.",
             tracks=wave(joints, [(2, 0), (3, -.08), (7, -.18), (7, -.12), (3, -.24), (9, -.36), (4, -.48)])),
        sweep(joints),
    ]
