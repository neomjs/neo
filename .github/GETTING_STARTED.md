# Neo.mjs: Getting Started Guide

This guide covers the two main paths for working with Neo.mjs:
1.  **Creating your own application**: The recommended approach for developers building apps with the engine.
2.  **Contributing to the engine (or running the repo's examples & tests)**: For those working directly on a clone of `neomjs/neo`.

---

## 1. Creating your own application (Recommended)
For building your own application, creating a dedicated workspace with `npx neo-app@latest` is the fastest way to start. This script scaffolds a new project, installs dependencies, runs the initial build, and starts the development server.

A workspace provides the same structure as the main Neo.mjs repository, while consuming `neo.mjs` as an npm dependency.

### Create a Workspace
1.  Open your terminal and navigate to the directory where you want to create your project.
2.  Run:
    ```sh
    npx neo-app@latest
    ```
3.  Follow the interactive prompts to configure your workspace and first application.

For a deeper walkthrough, see the **[Setup Guide](../learn/gettingstarted/Setup.md)**.

---

## 2. Contributing to the engine or running examples
If you want to contribute to `neomjs/neo` itself, or explore the full suite of demo applications and examples included in the main repository, follow the **[Contributing Guide](../CONTRIBUTING.md)** — it is the canonical reference for setup, testing, issue claiming, and pull requests.

### Quick Engine Setup Loop
You need **Node.js 24 or newer**:

```sh
git clone https://github.com/YOUR_USERNAME/neo.git
cd neo
npm install
npm run bundle-browser-deps               # bundles third-party browser dependencies into dist/
npm run build-themes -- -n -e dev -t all  # compiles development CSS themes into dist/development/css
npm run server-start                      # starts the local web server at http://localhost:8080/
```

> **Why those two build commands matter:** `dist/` is git-ignored on a fresh clone. `npm run bundle-browser-deps` populates the third-party browser bundles required by the engine and unit test suite, and `npm run build-themes -- -n -e dev -t all` compiles the CSS themes so apps render styled in development mode. Together they take under ten seconds.

### Running Tests & Exploring Apps
*   **Unit tests (no browser required):**
    ```sh
    npm run test-unit
    ```
    *(Always use the `npm run test-*` scripts rather than bare `npx playwright test`; see **[CONTRIBUTING.md](../CONTRIBUTING.md)** for `test-unit-tz`, `test-components`, and `test-e2e`.)*
*   **Development Mode in the Browser (zero JS build):**
    Once `npm run server-start` is running, open:
    > `http://localhost:8080/apps/portal/`
    >
    > `http://localhost:8080/examples/`

### Working with AI Coding Agents & Skills
*   **Materializing `.agents/skills`:** Running `npm install` automatically executes our `prepare` lifecycle script (`buildScripts/util/prepare.mjs` → `neo-agent-skills-materialize`), which symlinks our published `neo-agent-skills` workflows into `.agents/skills/` and `.claude/skills/`. If dependencies were installed with `--ignore-scripts`, run `npm run prepare` (or `npx neo-agent-skills-materialize`).
*   **Contributor Agent Instructions:** Print the contributor-scoped `AGENTS.md` (no private MCP servers or accounts needed) with:
    ```sh
    npx -p neo-agent-skills neo-agent-skills-agents-md --repo neo --audience contributor
    ```
*   **Opening a Pull Request:** Before committing or opening a PR targeting `dev`, read **[CONTRIBUTING.md](../CONTRIBUTING.md)** (and `.agents/skills/pull-request/SKILL.md` when using an AI agent). Every PR description must include a standalone **`Resolves #<issue-id>`** line (`Fixes #N` and `Closes #N` are rejected by CI) and can be verified locally with:
    ```sh
    npx neo-agent-skills-pr-body --body-file <path-to-body.md> --close-target-only
    ```

---

## Dive Deeper with Learning Resources
Once your environment is running, explore the architecture and guides in the learning section:

**[Explore the Learning Resources](../learn/README.md)**

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
