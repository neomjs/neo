# Neo.mjs Application Engine Build Scripts & CLI Tools

This directory contains the build tooling, CLI commands, and utility scripts that power the Neo.mjs Application Engine.
The scripts are organized into subdirectories based on their function.

Most of these scripts are exposed via `npm run` commands in the root `package.json`.

## Directory Structure

- **`build/`**: Core build scripts (ES Modules, Themes, Workers).
- **`create/`**: Scaffolding generators for apps, components, and classes.
- **`docs/`**: Documentation generation and SEO tools.
- **`helpers/`**: Development helpers (linters, token converters, watchers).
- **`release/`**: Automated release and publishing workflows.
- **`util/`**: Shared low-level utilities and CI checks.
- **`webpack/`**: Webpack configurations for development and production.

---

## 1. Build Operations (`buildScripts/build/`)

The core build pipeline. Note that Neo.mjs in **development mode** requires **zero builds**. These scripts are for production deployment, publishing, or generating static assets.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `all.mjs` | `npm run build-all` | Meta-script that runs all build steps: themes, workers, and docs. |
| `esmodules.mjs` | `npm run build-dist-esm` | Generates the `dist/` production output (minified, native ES modules). |
| `highlightJs.mjs` | `npm run build-highlightjs` | Builds the custom HighlightJS bundle used by the docs app. |
| `parse5.mjs` | `npm run bundle-parse5` | Bundles the Parse5 HTML parser for the platform. |
| `themes.mjs` | `npm run build-themes` | Copies the plain-CSS theme sources into `dist/<env>/css` through autoprefixer (and cssnano for esm and production). |

---

## 2. Scaffolding Generators (`buildScripts/create/`)

Generators to quickly scaffold new code structures following project conventions.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `app.mjs` | `npm run create-app` | Creates a new multi-window application structure. |
| `appMinimal.mjs` | `npm run create-app-minimal` | Creates a lightweight, single-window app. |
| `class.mjs` | `npm run create-class` | Generates a new Neo.mjs class file with standard boilerplate. |
| `component.mjs` | `npm run create-component` | Scaffolds a new UI component with CSS and JS. |
| `theme.mjs` | `npm run create-theme` | Creates an editable theme from an existing base theme. |
| `addConfig.mjs` | `npm run add-config` | Injects configuration into an existing application. |

---

## 3. Documentation (`buildScripts/docs/`)

Tools for generating the API documentation and handling SEO for the portal.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `generateDocsJson.mjs` | `npm run generate-docs-json` | Parses JSDoc comments across the codebase and generates `docs/output/db.json` for the Docs App. |
| `seo/generate.mjs` | N/A | Generates static HTML snapshots for Search Engine Optimization. |
| `captureExamples.mjs` | `npm run capture-examples` | Captures catalog examples from recorded public-browser recipes and writes cover receipts and a contact sheet. |

Start the normal local development server, then capture one example or every recipe in a family:

```bash
npm run capture-examples -- --base-url http://localhost:8080/ --record grid-cell-editing
npm run capture-examples -- --base-url http://localhost:8080/ --family grid-table
```

The catalog lives in `apps/portal/resources/data/examples/`: one `<group>.json` per group, and `index.json`
naming them. A record's `order` places it among all records, so a group's file can hold a featured card or one
another group borrows through `alsoIn`; a record without `order` comes after the others. An examples PR leaves
`apps/portal/resources/data/seo.json` alone: `buildScripts/release/prepare.mjs` regenerates it at the cut, for the
published package that middleware-v2 reads it from.

**A cover is the frame a visitor lands on.** A covered record without a recipe is captured from its landing frame:
a 960×540 viewport at device scale 1⅓ (a 1280×720 JPEG), the whole frame, once the network is idle, a configured theme
shows on `<body>` or inside it, the app's view has mounted and the DOM has held still for a second. Each is shot twice,
opened with `?theme=` as the catalog in that theme opens it: Neo Dark under the base name (`devmode/<id>-<suffix>.jpg`)
and Neo Light as its partner (`devmode/<id>-<suffix>-light.jpg`), so a card's cover follows the Portal's theme. A pass
whose frame opens in the other scheme (an example that ignores `?theme=`) fails: a light frame is no dark cover, and a
copy of the dark one is no partner. `--record <id>` captures a covered card in any family; a run of one `--family` or
of all keeps to the families the manifest declares. An example whose cover needs a state (an open editor, a selection,
a zoom) starts in that state, set in its own code, so the visitor lands on it too. The recipes in
`buildScripts/docs/captureExamples.json`, beside this script and out of the published package, are frozen: add none,
and delete an example's recipe once it lands on its state. A recipe cover is dark only; its record gets a light partner
when its recipe goes. The catalog owns IDs and development URLs; each remaining
recipe supplies its viewport, theme action, feature-state checks and 640×360 CSS region. Captures produce 1280×720
JPEGs of at most 150,000 bytes.
Each run uses a new empty output directory under `test-results/example-covers/` unless `--output-dir`
names another empty directory. `report.json` records successful files, checksums and failures;
`sheet.html` shows the actual covers at 445 px. Failed state/data checks produce no cover.

`--preview` opens the real local Portal with generated image requests fulfilled from that run. The
branch's catalog must already name those images. This previews local bytes before the companion
Pages change; it neither routes the worker's catalog request nor verifies deployed assets. Public
data dependencies remain explicit, and live/random examples reproduce framing and state rather
than promising identical bytes.

Recipe steps support click, double-click, fill, key press, scroll and visible-state waits. Checks
can require an exact count, input value or distinct visible heights. `inRegion: true` requires
the first matching target to fit wholly inside the capture. Target each required control or
open surface explicitly; existence elsewhere on the page is insufficient. A region can use fixed
coordinates or a selector's top-left/center; anchored regions wait for stable geometry inside
the viewport. Recipes contain no executable JavaScript.

---

## 4. Helpers & Maintenance (`buildScripts/helpers/`)

Utilities for maintaining code quality and developer experience.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `addReactiveTags.mjs` | `npm run add-reactive-tags` | Automatically adds `@reactive` JSDoc tags to config properties ending in `_`. |
| `checkReactiveTags.mjs` | `npm run check-reactive-tags` | Lints the codebase to ensure all reactive configs have the correct JSDoc tags. |
| `seatStart.mjs` | `npm run seat:start` | What a fresh seat Start needs: rebuilds the development themes only when they are missing or stale. |
| `watchThemes.mjs` | `npm run watch-themes` | Watches the theme sources and rebuilds changed sheets incrementally. |

---

## 5. Release Automation (`buildScripts/release/`)

Scripts used by the maintainers to publish new versions of the platform.

| Script | Description |
| :--- | :--- |
| `prepare.mjs` | Carries `package.json`'s version into the files that print it and rebuilds the Portal's release and label indexes. `publish.mjs prepare` runs it after setting the version. |
| `publish.mjs` | Releases in two phases joined by the operator's merge: `prepare --version <semver> --ticket <N>` sets the version in the release commit and opens the release PR to `dev`; `finish` squashes the merged PR onto `main` and creates the GitHub release, which publishes to npm. Re-running a phase resumes it; `--rehearse` reports the push gates. |
| `releaseState.mjs` | Decides a release phase's next step from what the remote already shows. |

---

## 6. Webpack Configurations (`buildScripts/webpack/`)

Webpack is used **only** for creating the builds in `dist/`. It is **not** used for the daily
development workflow, which loads native ES modules directly from the file server
(`npm run server-start`).

| Folder | Description |
| :--- | :--- |
| `development/` | Configs for the development build (`dist/development`). |
| `production/` | Configs for the production build (minification, tree-shaking). |
| `loader/` | Custom loaders for Neo.mjs templates. |

---

## 7. Utilities (`buildScripts/util/`)

Internal shared libraries used by the scripts above.

Run `npm run check-coding-guidelines` to check tracked modules under `src`, `apps`, `examples` and
`docs/app` against the [coding guidelines](../.github/CODING_GUIDELINES.md). Diagnostics identify
the source location and rule. New findings fail the check. Remove repaired findings from
`util/check-coding-guidelines-baseline.json` in the same commit. Staged and PR checks verify that
any added baseline occurrence already exists in the source at the base revision. Syntax diagnostics
belong to `check-parse.mjs`. An explicit full remeasurement with `--write-baseline` requires all
scanned files to parse, so a syntax error cannot erase known findings.

- `copyFile.mjs` / `copyFolder.mjs`: File system operations.
- `measure-esm-vs-bundled.mjs`: Reproducible HTTP/2 and HTTP/3 `dist/esm`, `dist/production`, and `esbuild --splitting` measurement harness.
- `minifyFile.mjs` / `minifyHtml.mjs`: Terser/HTMLMinifier wrappers.
- `Sanitizer.mjs`: Input sanitization for CLI prompts.
- `fileServer.mjs`: The development server `npm run server-start` runs (see below).

---

# CLI Reference

Detailed usage for the primary command-line tools.

## `npm run add-config`
**Script:** `buildScripts/create/addConfig.mjs`

Injects a new configuration property into an existing Neo.mjs class file.

```bash
Usage: neo.mjs add-config [options]

Options:
  -c, --className <value>     The name of the class (e.g. MyApp.view.Main)
  -n, --configName <value>    The name of the config (e.g. myConfig)
  -t, --type <value>          The type of the config (e.g. Boolean, String, Object)
  -d, --defaultValue <value>  The default value
  -h, --hooks <value>         List of hooks to generate (e.g. beforeSet, afterSet)
```

## `npm run add-reactive-tags`
**Script:** `buildScripts/helpers/addReactiveTags.mjs`

Automatically adds `@reactive` JSDoc tags to all reactive configuration properties (ending in `_`) across the codebase.
*Note: This script has no CLI options.*

## `npm run build-all`
**Script:** `buildScripts/build/all.mjs`

A meta-script that orchestrates the entire build process.

```bash
Usage: neo.mjs buildAll [options]

Options:
  -V, --version             output the version number
  -i, --info                print environment debug info
  -e, --env <value>         "all", "dev", "esm", "prod"
  -l, --npminstall <value>  "yes", "no"
  -f, --framework
  -n, --noquestions
  -p, --parsedocs <value>   "yes", "no"
  -t, --themes <value>      "yes", "no"
  -w, --threads <value>     "yes", "no"
  -h, --help                display help for command
```

## `npm run build-themes`
**Script:** `buildScripts/build/themes.mjs`

Copies the plain-CSS theme sources (`resources/css`, plus the root a dependency names in `"neo": {"css": "<dir>"}`) into `dist/<env>/css` and writes the theme map.

```bash
Usage: neo.mjs buildThemes [options]

Options:
  -V, --version         output the version number
  -i, --info            print environment debug info
  -e, --env <value>     "all", "dev", "esm", "prod"
  -f, --framework
  -n, --noquestions
  -t, --themes <value>  all, theme-cyberpunk, theme-dark, theme-light, theme-neo-dark, theme-neo-light
  -h, --help            display help for command
```

## `npm run build-threads`
**Script:** `buildScripts/webpack/buildThreads.mjs`

Builds the worker and main thread entry points using Webpack.

```bash
Usage: neo.mjs buildThreads [options]

Options:
  -V, --version          output the version number
  -i, --info             print environment debug info
  -e, --env <value>      "all", "dev", "prod"
  -f, --framework
  -n, --noquestions
  -t, --threads <value>  "all", "app", "canvas", "data", "main", "service", "task", "vdom"
  -h, --help             display help for command
```

## `npm run check-reactive-tags`
**Script:** `buildScripts/helpers/checkReactiveTags.mjs`

Lints the codebase to identify reactive configuration properties that are missing the `@reactive` JSDoc tag.
*Note: This script has no CLI options.*

## `npm run create-app`
**Script:** `buildScripts/create/app.mjs`

Scaffolds a new Neo.mjs application.

```bash
Usage: neo.mjs create-app [options]

Options:
  -V, --version                   output the version number
  -i, --info                      print environment debug info
  -a, --appName <value>           The name of your application
  -m, --mainThreadAddons <value>  Comma separated list (e.g., DragDrop, MapboxGL).
                                  Defaults to DragDrop, Navigator, Stylesheet
  -s, --useServiceWorker <value>  "yes", "no"
  -t, --themes <value>            all, neo-theme-dark, neo-theme-light, none
  -u, --useSharedWorkers <value>  "yes", "no"
  -h, --help                      display help for command
```

## `npm run create-app-minimal`
**Script:** `buildScripts/create/appMinimal.mjs`

Scaffolds a lightweight, single-window Neo.mjs application.

```bash
Usage: neo.mjs create-app [options]

Options:
  -V, --version                   output the version number
  -i, --info                      print environment debug info
  -a, --appName <value>           The name of your application
  -m, --mainThreadAddons <value>  Comma separated list. Defaults to DragDrop, Navigator, Stylesheet
  -s, --useServiceWorker <value>  "yes", "no"
  -t, --themes <value>            all, neo-theme-dark, neo-theme-light, none
  -u, --useSharedWorkers <value>  "yes", "no"
  -h, --help                      display help for command
```

## `npm run create-theme`

**Script:** `buildScripts/create/theme.mjs`

Choose a new theme folder and a base interactively with `npm run create-theme`, or provide both names:

```bash
npm run create-theme -- --name theme-acme --base theme-neo-dark --noquestions
```

From an application workspace with Neo installed, invoke the package's script:

```bash
node node_modules/neo.mjs/buildScripts/create/theme.mjs --name theme-acme --base theme-neo-dark --noquestions
node node_modules/neo.mjs/buildScripts/build/themes.mjs -n -e dev -t theme-acme
```

The generator writes editable source under `resources/css/theme-acme`. It takes the selected theme's
files from the Engine, declared component packages and workspace in build order; later files replace
matching earlier paths. It changes the theme selector to `.neo-theme-acme`, preserving its specificity.
Existing themes and application configuration are left intact. An invalid name, missing base or
existing destination fails without overwriting files.

Customize the generated variables, then put `"neo-theme-acme"` first in the relevant application's
`neo-config.json` `themes` array to make it the default. Build again after editing the sources. This is
a snapshot of the base's current values; future base changes are not copied automatically. Values every
theme shares, such as the motion vocabulary, come from the Engine's `src/Global.css` for any
`neo-theme-*` root, so the snapshot does not copy them.

## `npm run create-class`
**Script:** `buildScripts/create/class.mjs`

Generates a new class file extending a core base class.

```bash
Usage: neo.mjs create-class [options]

Options:
  -V, --version                      output the version number
  -i, --info                         print environment debug info
  -d, --drop                         drops class in the currently selected folder
  -n, --singleton <value>            Create a singleton? Pick "yes" or "no"
  -s, --source <value>               name of the folder containing the project (default: apps)
  -b, --baseClass <value>            The base class to extend (e.g. component.Base)
  -c, --className <value>            The fully qualified class name (e.g. MyApp.view.Main)
  -C, --createController <value>     Create a matching controller.Component when generating a view? Pick "yes" or "no"
  -M, --createModel <value>          Create a matching data.Model when generating a data.Store? Pick "yes" or "no"
  -p, --createStateProvider <value>  Create a matching state.Provider when generating a view? Pick "yes" or "no"
  -m, --createStore <value>          Create a matching data.Store when generating a data.Model? Pick "yes" or "no"
  -r, --scss <value>                 The css class name
  -h, --help                         display help for command
```

## `npm run create-component`
**Script:** `buildScripts/create/component.mjs`

Scaffolds a component with CSS, JS, and optional example code.

```bash
Usage: neo.mjs create-component [options]

Options:
  -V, --version            output the version number
  -i, --info               print environment debug info
  -n, --singleton <value>  Create a singleton? Pick "yes" or "no"
  -s, --source <value>     name of the folder containing the project (default: apps)
  -b, --baseClass <value>  The base class to extend
  -c, --className <value>  The fully qualified class name
  -h, --help               display help for command
```

## `npm run server-start`
**Script:** `node ./buildScripts/util/fileServer.mjs --open`

Starts the development server: it serves the working directory as files, the way dev mode loads them.
- Opens the browser on the served root. `-- --open <path>` opens a path under it, `-- --no-open` opens nothing.
- Listens on `--port <n>`, else on `PORT`, and fails if that port is taken. With neither, it listens on
  `8080` or the next free port.
- Serves `.mjs` and `.wasm` with their MIME types and honors range requests. A directory answers with its
  `index.html`, or else with a listing.
- Serves the engine's release notes at `/.github/RELEASE_NOTES/` and no other dot-path.
- Warns at startup, and while theme CSS is requested, when the development themes trail their sources.

## `npm run test`
**Script:** `playwright test`

Runs the automated test suite using Playwright.
*   `npm run test`: Runs all tests.
*   `npm run test-components`: Runs component-level tests.
*   `npm run test-unit`: Runs unit tests.

## `npm run watch-themes`
**Script:** `buildScripts/helpers/watchThemes.mjs`

Watches the `resources/css` directory and incrementally rebuilds the changed sheets.

- Run `npm run build-themes -- -n -e dev -t all` once before starting the watcher. It refuses to watch an incomplete or stale development theme tree.
- Content changes to existing entry files keep the single-file fast path.
- Add, rename, and delete events reconcile missing/stale outputs, remove retired CSS and source maps, and replace the generated development theme map. A sheet the build cannot parse fails loudly.

*Note: This script has no CLI options.*

---

# Agent OS & MCP Scripts

All `ai:*` scripts, MCP servers, vector databases, and Agent OS tooling now reside in the [`neomjs/neo-agent-brain`](https://github.com/neomjs/neo-agent-brain) repository. Refer to the Brain repository for Knowledge Base maintenance, Memory Core, and MCP server CLI commands.
