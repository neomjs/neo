---
id: 8764
title: Refactor buildScripts folder structure
state: OPEN
labels:
  - ai
  - refactoring
  - build
assignees: []
createdAt: '2026-01-17T18:59:56Z'
updatedAt: '2026-01-17T18:59:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8764'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

