# Native mill reference

Use the original Panda3D demo to check scene behavior and capture render targets for the [browser lab](mill-shader-lab.md). This is the local project workflow. The [original tutorial](../README.md) retains its own build and control instructions.

## Build and run on macOS

Use Apple Clang and the Panda3D 1.10.16 macOS C++ SDK. Install the SDK with **C++ Header Files**, or extract the base and headers packages into one SDK directory with `lib/` and `include/`. The launcher checks `PANDA3D_SDK`, the checkout's ignored `.local/panda3d-sdk`, then `/Library/Developer/Panda3D`. The official C++ SDK is Intel; on Apple Silicon its executable runs through Rosetta.

From the repository root:

```sh
./demonstration/macos.sh build
./demonstration/macos.sh run
```

The launcher selects an architecture available in the SDK, sets the asset working directory and loads the demo's Panda3D configuration. Use the same SDK when building and running. See the [native keyboard and mouse controls](../sections/running-the-demo.md#demo-controls).

## Capture the scene or one buffer

```sh
./demonstration/macos.sh run --capture /tmp/mill-midday.png --preset midday
./demonstration/macos.sh run --capture /tmp/mill-night.png --preset midnight
./demonstration/macos.sh run --capture /tmp/mill-uv.png --buffer 'Refraction UV'
./demonstration/macos.sh run --capture /tmp/mill-unfocused.png --disable depth-of-field
./demonstration/macos.sh run --help
```

The capture mode renders offscreen with no audio. Give it an absolute PNG path with an existing parent directory. It uses the reset camera, steps at 60 Hz, and defaults to midday, final color, and 60 frames. Buffer names match the interactive Tab inspector. Use `--disable particles` to remove random smoke from matching captures. Capture mode still needs GPU access; on this Mac it runs outside the restricted command sandbox.

Record the source revision, preset, frame, buffer, and overrides with any retained capture. Store local captures outside Git. Use the interactive controls for camera positions and effect settings the CLI does not expose.
