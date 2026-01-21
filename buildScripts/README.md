# Neo.mjs Application Engine Build Scripts & CLI Tools

This directory contains the build tooling, CLI commands, and utility scripts that power the Neo.mjs Application Engine.
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
| `parse5.mjs` | `npm run bundle-parse5` | Bundles the Parse5 HTML parser for the platform. |
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

Scripts used by the maintainers to publish new versions of the platform.

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

## `npm run ai:defrag-kb` / `ai:defrag-memory`
**Script:** `buildScripts/ai/defragChromaDB.mjs`

Maintenance tool to defragment and optimize Vector Database instances.

```bash
Usage: defragChromaDB [options]

Options:
  -t, --target <name>  Database target (knowledge-base, memory-core)
  -h, --help           display help for command
```

## `npm run ai:download-kb`
**Script:** `buildScripts/ai/downloadKnowledgeBase.mjs`

Downloads the pre-indexed Knowledge Base artifact matching the current `package.json` version from GitHub Releases.
*Note: This script has no CLI options.*

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

## `npm run check-reactive-tags`
**Script:** `buildScripts/helpers/checkReactiveTags.mjs`

Lints the codebase to identify reactive configuration properties that are missing the `@reactive` JSDoc tag.
*Note: This script has no CLI options.*

## `npm run convert-design-tokens`
**Script:** `buildScripts/helpers/convertDesignTokens.mjs`

Converts JSON design tokens from `resources/design-tokens/json` into SCSS variables.
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

## `npm run create-class`
**Script:** `buildScripts/create/class.mjs`

Generates a new class file extending a core base class.

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

## `npm run server-start`
**Script:** `webpack serve -c ./buildScripts/webpack/webpack.server.config.mjs --open`

Starts the development server with Hot Module Replacement (HMR).
- Opens the App Store (portal) by default.
- Serves the project on `localhost:8080`.

## `npm run test`
**Script:** `playwright test`

Runs the automated test suite using Playwright.
*   `npm run test`: Runs all tests.
*   `npm run test-components`: Runs component-level tests.
*   `npm run test-unit`: Runs unit tests.

## `npm run watch-themes`
**Script:** `buildScripts/helpers/watchThemes.mjs`

Watches the `resources/scss` directory and incrementally recompiles themes when files change.
*Note: This script has no CLI options.*

---

# Advanced Tools

## `npm run ai:mcp-client`
**Script:** `ai/mcp/client/mcp-cli.mjs`

A CLI tool for manually interacting with MCP servers. Useful for testing tool execution in isolation without an IDE extension.

```bash
# Example: List tools on the GitHub server
npm run ai:mcp-client -- --server github-workflow --list-tools
```

## `npm run ai:server`
**Script:** `chroma run --path ./chroma-neo-knowledge-base`

Manually starts the ChromaDB instance for the **Knowledge Base**.
Useful for debugging vector store operations outside of the MCP client.

## `npm run ai:server-memory`
**Script:** `chroma run --path ./chroma-neo-memory-core --port 8001`

Manually starts the ChromaDB instance for the **Memory Core** on port 8001.

## `npm run ai:server-neural-link`
**Script:** `ai/mcp/server/neural-link/run-bridge.mjs`

Starts the WebSocket bridge for the Neural Link, enabling the browser to communicate with the AI agent.

---

# Internal Infrastructure

The following scripts are **automated entry points** used by IDE extensions (like the VSCode MCP Client). You generally **do not** need to run these manually.

| NPM Command | Description |
| :--- | :--- |
| `ai:mcp-server-github-workflow` | StdIO entry point for the GitHub Agent. |
| `ai:mcp-server-knowledge-base` | StdIO entry point for the Knowledge Base. |
| `ai:mcp-server-memory-core` | StdIO entry point for the Memory Core. |
| `ai:mcp-server-neural-link` | StdIO entry point for the Neural Link. |