# Stack, checks and delivery

Keep each runtime independent. The root npm package only provides check tools.

| Owner | Stack and boundary | Automated checks |
| --- | --- | --- |
| `demonstration/` | Panda3D 1.10.16 C++ SDK, C++11 and desktop GLSL 1.50. The native program owns the reference pass order. | Ubuntu build and link with warnings as errors, plus glslang validation of every vertex and fragment stage. |
| `mill-shader-lab/` | Vite, strict TypeScript, Three.js and WebGL2. Converted original art and adapted DCC scenes stay in local assets. | Type check, production build, state and buffer tests, pinned delivery adapter tests, and a real WebGL smoke test using a freshly built Glasshouse candidate. |
| `dcc/` | Python 3.12 authors and verifies deliveries. TypeScript builds the offline gallery and shares its data contract with the viewer. | Type check, compiler and motion tests, geometry, selection and recovery contracts. The test service runs in memory. |
| `shader-field-guide/` | Dependency-free browser JavaScript and WebGL2. Python generates the single-file version. | Standalone drift check; render all 17 lesson modes in Chromium and exercise the labeled Canvas2D fallback. |
| `sections/`, `docs/`, `tools/` | Markdown is the original tutorial source; Pandoc generates its HTML. Python and shell tools do local build and archive work. | Build tutorial HTML in scratch space; Ruff, Oxlint, ShellCheck and actionlint check the maintained sources and workflow. |

## Run locally from the repository root

Use the Node version in `.nvmrc` (`nvm use`), Python 3.12, Pandoc,
ShellCheck, actionlint 1.7.12 and Ruff 0.17.5.

```sh
make setup-check        # Install each package from its lockfile.
make ci-check           # Lint, docs, contracts and the Lab production build.
```

The checks work offline after setup. Use `make lint`, `make test` or
`make check-docs` for a focused run.

`make check-full` also runs `make check-browser`, `make check-native` and
`make check-shaders`. The browser checks need local Chrome by default, using
a disposable profile. CI installs the headless Chromium pinned by Playwright
and uses software WebGL2. Follow [Native mill reference](native-reference.md)
on macOS or [Building the Demo](../sections/building-the-demo.md#linux) on
Linux for the SDK, and install `glslangValidator` for the shader checks.
These commands also work offline after setup.

After restoring the reviewed deliveries, run `make check-reviewed` to verify
the gallery's selected payloads and prepare all exact Lab pins in scratch
space. Run it when artwork, delivery selection, pins or adapter bindings
change. For native captures, pixel parity and full user flows, follow
[Lab verification](mill-shader-lab-verification.md) and
[DCC gallery verification](dcc-gallery.md#verification).

## GitHub Actions

[Checks and delivery](../.github/workflows/ci.yml) runs on pull requests, pushes
to `master`, and manual dispatch. It uses read-only repository access, cancels
superseded runs, and times out each job. Routine, browser and native jobs call
the same local targets. A green `master` push packages only the
independent Shader Field Guide as a commit-named download for 14 days. Open
`demo.html` directly or serve the unpacked files to use `index.html`. The workflow
does not deploy a website, upload DCC objects, or package the native demo or
original mill art.

Tutorial HTML is built as a smoke check. Pandoc releases differ in generated
highlighting and markup, so this gate does not require byte-for-byte agreement
with legacy pages. For tutorial edits, regenerate and review the affected pages
alongside their Markdown sources.
