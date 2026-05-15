---
id: 8764
title: Refactor buildScripts folder structure
state: CLOSED
labels:
  - ai
  - refactoring
  - build
assignees:
  - tobiu
createdAt: '2026-01-17T18:59:56Z'
updatedAt: '2026-01-17T19:34:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8764'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T19:34:47Z'
---
# Refactor buildScripts folder structure

We need to restructure the `buildScripts/` directory to improve organization and maintainability. Currently, it's a flat list of diverse scripts.

**Proposed Structure:**

```
buildScripts/
├── ai/                     # AI related scripts
│   ├── defragChromaDB.mjs
│   ├── downloadKnowledgeBase.mjs
│   ├── migrateMemoryCore.mjs
│   ├── syncKnowledgeBase.mjs
│   └── uploadKnowledgeBase.mjs
├── build/                  # Core build scripts
│   ├── all.mjs             # buildAll.mjs
│   ├── esmodules.mjs       # buildESModules.mjs
│   ├── highlightJs.mjs     # buildHighlightJs.mjs
│   ├── parse5.mjs          # bundleParse5.mjs
│   └── themes.mjs          # buildThemes.mjs
├── create/                 # Scaffolding/Generators
│   ├── addConfig.mjs
│   ├── app.mjs             # createApp.mjs
│   ├── appMinimal.mjs      # createAppMinimal.mjs
│   ├── class.mjs           # createClass.mjs
│   ├── component.mjs       # createComponent.mjs
│   ├── example.mjs         # tools/createExample.mjs
│   └── scss.mjs            # tools/createScss.mjs
├── docs/                   # Documentation generation
│   ├── index/              # Index generators
│   │   ├── labels.mjs      # createLabelIndex.mjs
│   │   ├── release.mjs     # createReleaseIndex.mjs
│   │   └── tickets.mjs     # createTicketIndex.mjs
│   ├── jsdoc-x/            # Existing
│   ├── seo/                # SEO related
│   │   ├── copy.mjs        # copySeoFiles.mjs
│   │   └── generate.mjs    # generateSeoFiles.mjs
│   └── jsdocx.mjs          # generate-docs-json
├── helpers/                # Codemods and helpers
│   ├── addReactiveTags.mjs
│   ├── checkReactiveTags.mjs
│   ├── convertDesignTokens.mjs
│   └── watchThemes.mjs
├── release/                # Release management
│   ├── prepare.mjs         # prepareRelease.mjs
│   ├── publish.mjs         # publishRelease.mjs
├── util/                   # Shared utilities
│   ├── copyFile.mjs
│   ├── copyFolder.mjs
│   ├── minifyFile.mjs
│   ├── Sanitizer.mjs
│   └── ...
└── webpack/                # Webpack configs (unchanged)
```

**Tasks:**
1. Create new folder structure.
2. Move and rename scripts.
3. Update internal relative paths and imports in all moved scripts.
4. Update `package.json` scripts to point to new locations.
5. Update `buildScripts/README.md`.

## Timeline

- 2026-01-17T18:59:57Z @tobiu added the `ai` label
- 2026-01-17T18:59:58Z @tobiu added the `refactoring` label
- 2026-01-17T18:59:58Z @tobiu added the `build` label
- 2026-01-17T19:32:28Z @tobiu referenced in commit `7e91f74` - "refactor: restructure buildScripts directory (#8764)

- Move scripts into logical subdirectories (ai, build, create, docs, helpers, release, util)
- Update internal paths and imports in all affected scripts
- Update package.json scripts to point to new locations
- Update webpack configs to reflect new paths
- Update webpackExclude patterns in App, Task, and Canvas workers to exclude buildScripts from dynamic imports"
- 2026-01-17T19:33:01Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-17T19:33:20Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored the `buildScripts` folder structure as requested.
> 
> ### Changes:
> 1.  **Restructured Directory:** Moved scripts into logical subdirectories (`ai`, `build`, `create`, `docs`, `helpers`, `release`, `util`).
> 2.  **Updated Imports:** Fixed all relative path imports within the moved scripts.
> 3.  **Updated `package.json`:** Modified all `npm run` scripts to point to the new file locations.
> 4.  **Updated Webpack Configs:** Adjusted paths in webpack configurations to align with the new structure.
> 5.  **Fixed Webpack Build:** Updated `webpackExclude` patterns in `src/worker/App.mjs`, `src/worker/Task.mjs`, and `src/worker/Canvas.mjs` to specifically exclude the `buildScripts` directory. This prevents Webpack from attempting to bundle node-only scripts (like those using `fs`) into the browser-based worker bundles, resolving the "Module not found" errors encountered during the build.
> 
> ### Verification:
> The `npm run build-all` command should now execute successfully without errors related to missing modules or incorrect paths.
> 
> **Note:** I also removed the empty `buildScripts/tools` directory.

- 2026-01-17T19:34:47Z @tobiu closed this issue

