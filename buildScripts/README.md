# Neo.mjs Build Scripts & CLI Tools

This directory contains the build tooling, CLI commands, and utility scripts that power the Neo.mjs framework.
The scripts are organized into subdirectories based on their function.

Most of these scripts are exposed via `npm run` commands in the root `package.json`.

## Directory Structure

- **`ai/`**: Model Context Protocol (MCP) servers and Knowledge Base management.
- **`build/`**: Core build scripts (ES Modules, Themes, Workers).
- **`create/`**: Scaffolding generators for apps, components, and classes.
- **`docs/`**: Documentation generation and SEO tools.
- **`helpers/`**: Development helpers (linters, token converters, watchers).
- **`release/`**: Automated release and publishing workflows.
- **`util/`**: Shared low-level utilities (file ops, sanitizers).
- **`webpack/`**: Webpack configurations for development and production.

---

## 1. AI & Knowledge Base (`buildScripts/ai/`)

Tools for managing the AI infrastructure, including Vector Database operations and Memory Core migration.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `defragChromaDB.mjs` | `npm run ai:defrag-kb`<br>`npm run ai:defrag-memory` | Vacuums and optimizes the ChromaDB collections to reclaim space. |
| `downloadKnowledgeBase.mjs` | `npm run ai:download-kb` | Downloads the latest pre-indexed Knowledge Base from the remote source. |
| `migrateMemoryCore.mjs` | `npm run ai:migrate-memory` | Migrates the Memory Core schema when breaking changes occur. |
| `syncKnowledgeBase.mjs` | `npm run ai:sync-kb` | Indexes the local codebase and updates the vector database with changes. |

---

## 2. Build Operations (`buildScripts/build/`)

The core build pipeline. Note that Neo.mjs in **development mode** requires **zero builds**. These scripts are for production deployment, publishing, or generating static assets.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `all.mjs` | `npm run build-all` | Meta-script that runs all build steps: themes, workers, and docs. |
| `esmodules.mjs` | `npm run build-dist-esm` | Generates the `dist/` production output (minified, native ES modules). |
| `highlightJs.mjs` | `npm run build-highlightjs` | Builds the custom HighlightJS bundle used by the docs app. |
| `parse5.mjs` | `npm run bundle-parse5` | Bundles the Parse5 HTML parser for the framework. |
| `themes.mjs` | `npm run build-themes` | Compiles SCSS files into CSS themes (dark/light) using Dart Sass. |

---

## 3. Scaffolding Generators (`buildScripts/create/`)

Generators to quickly scaffold new code structures following project conventions.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `app.mjs` | `npm run create-app` | Creates a new multi-window application structure. |
| `appMinimal.mjs` | `npm run create-app-minimal` | Creates a lightweight, single-window app. |
| `class.mjs` | `npm run create-class` | Generates a new Neo.mjs class file with standard boilerplate. |
| `component.mjs` | `npm run create-component` | Scaffolds a new UI component with SCSS and JS. |
| `addConfig.mjs` | `npm run add-config` | Injects configuration into an existing application. |

---

## 4. Documentation (`buildScripts/docs/`)

Tools for generating the API documentation and handling SEO for the portal.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `jsdocx.mjs` | `npm run generate-docs-json` | Parses JSDoc comments across the codebase and generates `docs/output/db.json` for the Docs App. |
| `seo/generate.mjs` | N/A | Generates static HTML snapshots for Search Engine Optimization. |

---

## 5. Helpers & Maintenance (`buildScripts/helpers/`)

Utilities for maintaining code quality and developer experience.

| Script | NPM Command | Description |
| :--- | :--- | :--- |
| `addReactiveTags.mjs` | `npm run add-reactive-tags` | Automatically adds `@reactive` JSDoc tags to config properties ending in `_`. |
| `checkReactiveTags.mjs` | `npm run check-reactive-tags` | Lints the codebase to ensure all reactive configs have the correct JSDoc tags. |
| `convertDesignTokens.mjs` | `npm run convert-design-tokens` | Converts JSON design tokens into SCSS variables and CSS custom properties. |
| `watchThemes.mjs` | `npm run watch-themes` | Watches SCSS files for changes and recompiles themes incrementally. |

---

## 6. Release Automation (`buildScripts/release/`)

Scripts used by the maintainers to publish new versions of the framework.

| Script | Description |
| :--- | :--- |
| `prepare.mjs` | Handles version bumping, changelog generation, and git tagging. |
| `publish.mjs` | Automates the NPM publish process, ensuring clean builds. |

---

## 7. Webpack Configurations (`buildScripts/webpack/`)

Webpack is used **only** for:
1. Running the development server (`npm run server-start`).
2. Creating the production builds (`dist/`).

It is **not** used for the daily development workflow, which uses native ES modules directly.

| Folder | Description |
| :--- | :--- |
| `development/` | Configs for the dev server (mapped to source). |
| `production/` | Configs for the production build (minification, tree-shaking). |
| `loader/` | Custom loaders for Neo.mjs templates. |

---

## 8. Utilities (`buildScripts/util/`)

Internal shared libraries used by the scripts above.

- `copyFile.mjs` / `copyFolder.mjs`: File system operations.
- `minifyFile.mjs` / `minifyHtml.mjs`: Terser/HTMLMinifier wrappers.
- `Sanitizer.mjs`: Input sanitization for CLI prompts.

---

# CLI Reference

Detailed usage for the primary command-line tools.

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

Compiles SCSS into CSS.

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

## `npm run create-class`
**Script:** `buildScripts/create/class.mjs`

Generates a new class file extending a framework base class.

```bash
Usage: neo.mjs create-class [options]

Options:
  -V, --version            output the version number
  -i, --info               print environment debug info
  -d, --drop               drops class in the currently selected folder
  -n, --singleton <value>  Create a singleton? Pick "yes" or "no"
  -s, --source <value>     name of the folder containing the project (default: apps)
  -b, --baseClass <value>  The base class to extend (e.g. component.Base)
  -c, --className <value>  The fully qualified class name (e.g. MyApp.view.Main)
  -r, --scss <value>       The scss class name
  -h, --help               display help for command
```

## `npm run create-component`
**Script:** `buildScripts/create/component.mjs`

Scaffolds a component with SCSS, JS, and optional example code.

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

## `npm run ai:defrag-kb` / `ai:defrag-memory`
**Script:** `buildScripts/ai/defragChromaDB.mjs`

Maintenance tool to defragment and optimize Vector Database instances.

```bash
Usage: defragChromaDB [options]

Options:
  -t, --target <name>  Database target (knowledge-base, memory-core)
  -h, --help           display help for command
```

## `npm run ai:migrate-memory`
**Script:** `buildScripts/ai/migrateMemoryCore.mjs`

Migrates a Memory Core database backup to the current embedding model by clearing the existing collection and re-generating embeddings.

```bash
Usage: node buildScripts/migrateMemoryCore.mjs <backup-file.jsonl>

Arguments:
  <backup-file.jsonl>  Path to the JSONL backup file to import and re-embed.

Options:
  --test-mode          Use test collections (test-re-embed-*) instead of production DB.
```

## `npm run ai:sync-kb`
**Script:** `buildScripts/ai/syncKnowledgeBase.mjs`

Indexes the local codebase and updates the vector database.
*Note: This script has no CLI options.*