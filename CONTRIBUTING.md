# Neo.mjs Contributing Guide
We are very excited that you are interested in contributing to Neo.mjs.<br>
No worries, you don't need to be a guru, ninja or rockstar to support the project.

## Which starting point is yours?

Two different things get called "getting started", and picking the wrong one costs an evening:

* **Building an app *with* Neo.mjs?** Run `npx neo-app@latest`. It scaffolds a workspace that has Neo.mjs as a
  dependency, and the <a href="https://neomjs.com/#/learn/gettingstarted/Setup">Setup guide</a> walks you through it.
* **Changing the engine *itself* — fixing a bug in `src/`, adding a test, editing a guide?** That is this page, and the
  loop below is the whole of it.

## Set up the engine from a clone

You need **Node.js 24 or newer**. Nothing else: no Docker, no database, no API key, no editor plugin.

```bash
git clone https://github.com/neomjs/neo.git   # or your fork
cd neo
npm install
npm run bundle-browser-deps               # third-party bundles into dist/
npm run build-themes -- -n -e dev -t all  # the CSS the dev environment renders with
npm run server-start
```

Both build steps exist for the same reason: **`dist/` is git-ignored, so a fresh clone has neither.** Skip the first and
anything importing `marked`, `parse5`, `mermaid`, Monaco or highlight.js fails to load — including the unit suite, which
then selects *zero tests* rather than failing one. Skip the second and the server starts and serves an unstyled page; it
warns and tells you this exact command. Together they take under ten seconds.

**Your own JavaScript never needs a build** — Neo.mjs runs your edits as native ES modules, so you change a file and
reload. That does not extend to **SCSS**: styles compile into `dist/development/css`, so re-run `build-themes` after a
`.scss` change, or keep `npm run watch-themes` going while you work on one.

Running the tests:

```bash
npm run test-unit         # engine units — no browser needed at all
```

Every test command takes a path, so you can run just the area you touched:
`npm run test-unit -- test/playwright/unit/util`.

The browser suites need real browsers, and **they do not need the same one**:

```bash
npx playwright install    # Playwright's own browsers (~1 GB)
npm run test-components   # components — uses Playwright's bundled Chromium

npx playwright install chrome   # only if you do not already have Google Chrome
npm run test-e2e                # full applications — uses your system Google Chrome
```

`test-e2e` is pinned to `channel: 'chrome'`, so it launches the Google Chrome installed on your machine rather than
Playwright's Chromium — `npx playwright install` alone does not provide it.

If you are fixing a unit test, you need none of this.

Two things `npm install` does that are worth recognising when they scroll past:

1. It registers our **Husky pre-commit hooks**, which check mechanical hygiene such as trailing whitespace.
2. It prints `neo-agent-skills: materialized N link(s)`. That is our agent-skill package linking itself into
   `.claude/skills`. It needs nothing from you, and you do not need it to contribute.

If any command above does not behave as described, that is a bug in this guide — please open an issue.

## What you can do to help:

### 1. Spread the Word

Neo.mjs thrives on community engagement. One of the most impactful ways to contribute is to help grow our community and share the project with others.

1.  **Star the repository:** This helps with visibility on GitHub.
2.  **Tell your friends and colleagues:** Share your experience with Neo.mjs.
3.  **Engage on social media:** Write blog posts or share content on platforms like LinkedIn, X (formerly Twitter), and Facebook.
4.  **Represent Neo.mjs:** Interested in giving a talk or a workshop at a developer conference? We'd love to support you. Just reach out!
5.  **Uphold our values:** Please stick to our <a href=".github/CODE_OF_CONDUCT.md">Code of Conduct</a> in all interactions.

### 2.  Use the issues tracker
1. In case you got an idea for a new feature
2. In case you find a bug
    1. Ideally, you create a new breaking test inside the tests folder.
    This saves a lot of time and ensures the bug will stay fixed once the ticket is resolved.
3. Please like or comment on current tickets.
    This is a great help to figure out which tickets are the most important ones for the Neo.mjs community.

### 3.  Contribute to the Neo.mjs code base
1. **Looking for somewhere to start?** Issues labelled <a href="../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22">good first issue</a>
   and <a href="../../issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22">help wanted</a> are ready to take — just
   comment on one and we will assign it to you. No approval round needed; they are already approved.
2. For anything else, please ***always*** create a new issue inside our <a href="../../issues">Issues Tracker</a> first and wait for approval.
   This ensures that your idea fits the scope of the project and makes it less likely to get a rejected PR.
   We will do our best to reply to new tickets within 7d max. In case we don't, feel free to bump the ticket.
3. In case you want to work on an existing ticket, please add a comment there and get the ticket assigned to you.
   Otherwise multiple contributors could work on the same item in parallel.
   To keep the project moving, if a ticket is assigned and we do not receive any feedback from the assignee (e.g. via a comment) within 7 days, the ticket may get re-assigned to make it available for other contributors.
4. Please make sure that pull requests are always related to an issue inside our <a href="../../issues">Issues Tracker</a>.
5. Please create PRs for the `dev` branch, not for `main`.
6. Please do not copy code from other frameworks / libraries. So far, the entire Neo.mjs code base is written from scratch.
    1. It is simply impossible to verify if contributed code is self-written.
    2. Adding new npm packages => dependencies / devDependencies is fine, in case there are no licensing conflicts.
7. Refer to the <a href="learn/guides/fundamentals/CodebaseOverview.md">codebase overview</a> to understand how our repository is structured.

### 4.  In case you created a nice app or component using Neo.mjs, please let us know about it.
1.  We are always interested to feature client projects in blog posts or on social media.

### 5. Contributions from AI Agents & Autonomous Entities

We actively welcome contributions from artificial intelligence, LLMs, and autonomous agent swarms (such as the [AI Village](https://github.com/neomjs/neo/issues/9535)). We are building the foundation for "Agentic UI"—making the web readable by humans, and **both readable and writable by machines**.

**For Human Operators of AI Agents:**
1. **Transparency:** If you use an AI agent to generate a Pull Request or formulate an issue, please briefly mention which model or agent framework was used (e.g., "Generated by Gemini 3.1 Pro," "Automated via Claude").
2. **Accountability:** You remain responsible for the code your agent submits. Please review generated PRs for architectural consistency and ensure they follow our <a href=".github/CODING_GUIDELINES.md">Coding Guidelines</a>.
3. **Setup:** Your agent needs nothing beyond the clone above — our skills package is already installed by `npm install`. To go further, see the <a href=".github/AI_QUICK_START.md">AI Quick Start Guide</a> for our local Knowledge Base and Memory Core, and <a href="https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/StrategicWorkflows.md">Strategic Workflows</a> (in the Brain repository) for working effectively with the agents.

**For Autonomous Agents (If you are reading this):**
1. **Initialization Handshake:** Always begin your workflow by reading the `AGENTS_STARTUP.md` file in the root directory. This contains your core operational mandates.
2. **JSON-First UI:** Neo.mjs components are defined via JSON VDOM blueprints, not JSX or HTML templates. This makes structural manipulation and UI inspection mathematically natural for you.
3. **The Neural Link:** We offer a bi-directional MCP bridge (`neo-agent-brain:ai/mcp/server/neural-link/`). You can query the live Scene Graph and manipulate the application state without modifying source code or reloading the browser. See our <a href=".github/AGENT_ARCHITECTURE.md">Agent Architecture</a> to learn how you can orchestrate our runtime.

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
