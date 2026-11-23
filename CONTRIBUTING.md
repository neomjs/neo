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
reload. That does not extend to **styles**: `build-themes` copies the sheets under `resources/css` into
`dist/development/css`, so re-run it after a `.css` change, or keep `npm run watch-themes` going while you work on one.

**Give your coding agent the Neural Link** to let it read and change the running app (its component tree, state and
styles) live. Register the `neo-neural-link` package once:

```bash
claude mcp add neural-link -- npx -y neo-neural-link   # Claude Code, for this clone
codex mcp add neural-link -- npx -y neo-neural-link    # Codex, for every project
```

Then run `npm run server-start` and open `/examples/button/base/`, which connects already; any other app connects once
its `neo-config.json` sets `"useAiClient": true`. To check the link, ask your agent for the app's component tree.

The link listens on `127.0.0.1:8081`. If another program holds that port, register another one, with the name first
(`claude mcp add neural-link -e NEO_NL_PORT=8197 -- npx -y neo-neural-link`; Codex takes `--env NEO_NL_PORT=8197`), and
set the app's `neuralLinkUrl` to `ws://127.0.0.1:8197`.

Running the tests:

```bash
npm run test-unit         # engine units — no browser needed at all
```

Every test command takes a path, so you can run just the area you touched:
`npm run test-unit -- test/playwright/unit/util`.

**Writing a test that converts between local time and UTC?** Run it through the timezone tier as well:

```bash
npm run test-unit-tz      # the same units, in a pinned non-UTC zone
```

`npm run test-unit` inherits your machine's timezone, and CI runs on UTC. Where the offset is zero a correct
conversion and a missing one compute the same answer for **every** input, so a UTC run cannot fail on one and no
extra test case changes that — only the zone does. `playwright.config.unit-tz.mjs` pins one
(`Pacific/Kiritimati`, +14, no DST) and CI runs it twice, adding `Pacific/Niue` (−11) so a sign error is caught
from both sides. Add your spec to its `testMatch` list; `NEO_UNIT_TZ=<zone>` overrides the zone locally.

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

⚠️ **Run the `npm run test-*` scripts, not `npx playwright test` directly.** There is no Playwright config at the
repository root — each tier above has its own under `test/playwright/`, and the npm scripts pass it with `-c`. Without
one, Playwright collects every tier's specs at once, none of them under the environment their own tier provides: the bare
command exits 1 having run no test, after a stack trace about SEO metadata and a dozen repetitions of *"The neuralLink
fixture requires NEO_AGENTOS_RUNTIME_ROOT"*. That looks like a broken checkout and is not one — the same misleading shape
as skipping `bundle-browser-deps` above.

Two things `npm install` does that are worth recognising when they scroll past:

1. It registers our **Husky pre-commit hooks**, which check mechanical hygiene such as trailing whitespace.
2. It prints `neo-agent-skills: materialized N link(s)`. That is our agent-skill package (`neo-agent-skills`) linking
   its workflows (`pull-request`, `unit-test`, `identity-firewall`, etc.) into `.agents/skills/` and `.claude/skills/`.
   If dependencies were installed with `--ignore-scripts`, materialize them on demand with `npm run prepare` (or
   `npx neo-agent-skills-materialize`).

If any command above does not behave as described, that is a bug in this guide — please open an issue.

## What you can do to help:

### 1. Spread the Word

Neo.mjs thrives on community engagement. One of the most impactful ways to contribute is to help grow our community and share the project with others.

1.  **Star the repository:** This helps with visibility on GitHub.
2.  **Tell your friends and colleagues:** Share your experience with Neo.mjs.
3.  **Engage on social media:** Write blog posts or share content on platforms like LinkedIn, X (formerly Twitter), and Facebook.
4.  **Represent Neo.mjs:** Interested in giving a talk or a workshop at a developer conference? We'd love to support you. Just reach out!
5.  **Uphold our values:** Please stick to our <a href=".github/CODE_OF_CONDUCT.md">Code of Conduct</a> in all interactions.

### 2. Ways to take part

| You … | Do this | What happens next |
|---|---|---|
| found a bug | open a [bug report](https://github.com/neomjs/neo/issues/new/choose) (the issue chooser's first entry) | a maintainer answers and labels it. If you want to fix it yourself, say so in the report |
| have an idea for a feature | start a Discussion in [Ideas](https://github.com/neomjs/neo/discussions/categories/ideas) | maintainers and contributors shape it there; an idea that has settled becomes a ticket |
| want to join a design conversation | comment on an open Discussion in [Ideas](https://github.com/neomjs/neo/discussions/categories/ideas) | nothing to ask for: design threads are open to everyone |
| have a question | ask in [Q&A](https://github.com/neomjs/neo/discussions/categories/q-a) | |
| want to write code | take a curated issue ([item 3](#3--contribute-to-the-neomjs-code-base)) | |
| built something with Neo.mjs | post it in [Show and tell](https://github.com/neomjs/neo/discussions/categories/show-and-tell) | |
| want to talk to someone | join [Discord](https://discord.gg/6p8paPq) or [Slack](https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA) | Discord is the main room and keeps a searchable history; Slack is real-time chat and keeps 90 days |

### 3.  Contribute to the Neo.mjs code base

**What we are working on now.** <a href="ROADMAP.md">`ROADMAP.md`</a> names the next engine release, explains its scope,
and links its live milestone. Follow that milestone for the current open work. The
<a href="README.md#the-repository-map">repository map</a> names the repositories, and they release
independently: this one as the `neo.mjs` npm package, the Brain as container images, the shared agent skills as
`neo-agent-skills` on npm. A fix you land here ships with the next engine release.

1. **Looking for somewhere to start?** Take an issue labelled <a href="../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22">good first issue</a>
   or <a href="../../issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22">help wanted</a>: comment on one to claim it (see 3).
   No approval round needed; they are already approved. Most carry both labels, and both are open to you whether this
   is your first pull request or your tenth.
   Maintainers could resolve these themselves. We leave them open because contributing is the fastest way to get to know
   the engine, so read `help wanted` as "help accepted".
   Good first issue means the ticket holds everything you need to finish it;
   it is no promise that the work is small. An unassigned issue in the roadmap's milestone works the same way.

   **The listed issues are already claimed, or nothing fits?** Ask in <a href="https://github.com/neomjs/neo/discussions/categories/q-a">Q&A</a>.
   Tell us which example you tried and what area you would like to work on, so we can help you find an existing Engine issue.
2. Every pull request needs an issue. For a bug without an existing ticket, open a bug report as described above;
   that report is the issue for your fix. If you want to fix it yourself, say so in the report.
   For a new idea, start a Discussion in [Ideas](https://github.com/neomjs/neo/discussions/categories/ideas) first;
   once it has settled and becomes a ticket, a pull request can implement it.
   We will do our best to reply to new tickets within 7d max. In case we don't, feel free to bump the ticket.
3. **Claim before you start.** To work on an existing ticket, comment there. An automatic reply tells you whether you
   are first in line. On curated issues (`good first issue` and `help wanted`), the bot assigns the first eligible
   claimant. You can hold one open curated claim in this repository, or two once you have five merged pull requests
   across the public `neomjs` repositories. If your claim was declined, comment `/claim` here again once the
   issue or one of your slots becomes free. The bot checks the current holders before assigning it. A
   maintainer can unassign and release a claim from an account that sprays them. You can open a PR without a claim,
   but we merge the first approve-worthy PR for a ticket, so if someone else holds it or gets there first, your work
   may not land. A claim is what protects your time.
   To keep the project moving, a claim lasts 3 days, and any comment you leave on the ticket starts the 3 days again.
   After 3 days without a word from you, the ticket may go to another contributor. If your plans change, comment
   `/unclaim` (or "please unassign me") on the ticket to give the claim back — an automatic reply confirms the release.
   An open pull request targeting a curated issue holds that issue while the pull request remains open.
   The claim responder assigns the pull request's author when they have commented on the issue and are eligible
   under the claim rules above.
   An automatic notice may explain an overlap with another pull request, an already-completed issue, or a released
   claim when a pull request closes without merging.
   If two PRs cover the same fix, a maintainer will link them, tell both contributors who is coordinating and what
   happens next, and explain the choice to both before either patch lands.
4. Please make sure that pull requests are always related to an issue inside our <a href="../../issues">Issues Tracker</a>.
   Every pull request resolves **one** issue and must include **`Resolves #<issue-id>` on its own line** in the PR
   description (`Fixes #N` and `Closes #N` are rejected by our `baseline / PR baseline` CI check). Opening a PR in the
   GitHub web UI pre-fills <a href=".github/PULL_REQUEST_TEMPLATE.md">`.github/PULL_REQUEST_TEMPLATE.md`</a> with the
   same canonical structure used by `.agents/skills/pull-request/SKILL.md` (`Resolves #<issue-id>`, concise outcome
   summary, `Evidence:`, `## AC Evidence`, `## Deltas from ticket`, `## Test Evidence`, `## Post-Merge Validation`, and
   `Authored by `); if you open a PR via `gh pr create` or an AI coding agent, keep that structure and include the
   standalone `Resolves #<issue-id>` line (for full details, see
   `.agents/skills/pull-request/references/pull-request-workflow.md` §9). You can verify a PR body locally with
   `npx neo-agent-skills-pr-body --body-file <path-to-body.md>` (or `--close-target-only` for non-AI human PRs).
   After pushing a requested fix, leave a short comment on the PR saying what changed and which check you ran.
   That gives the reviewer a clear handoff, especially if CI needs a maintainer to approve or rerun it.
   If another merge into `dev` causes a conflict, the maintainer handling your review will coordinate the update.
   We'll handle mechanical integration where we have permission and ask you when a resolution needs your judgment.
   You can leave a mergeable branch as it is while it waits for review.
5. Please create PRs for the `dev` branch, not for `main`.
6. Please do not copy code from other frameworks / libraries. So far, the entire Neo.mjs code base is written from scratch.
    1. It is simply impossible to verify if contributed code is self-written.
    2. Adding new npm packages => dependencies / devDependencies is fine, in case there are no licensing conflicts.
7. Refer to the <a href="learn/guides/fundamentals/CodebaseOverview.md">codebase overview</a> to understand how our repository is structured.

#### Your standing

Merged pull requests across the organisation's public repositories count toward your standing:

| Standing | Merged pull requests |
|---|---|
| Contributor | 1 |
| Returning Contributor | 5 |
| Bronze Contributor | 10 |
| Silver Contributor | 25 |
| Gold Contributor | 50 |
| Diamond Contributor | 100 |
| Core Contributor | 250 |

The comment on a merge reports your standing and merged pull-request count, shows progress toward the next rung when
one remains, and may suggest unclaimed issues. It introduces your badge on your first eligible merge and links your
record once its folder has been generated. The badge updates when a scheduled run counts the merge.

Your record lives at `https://neomjs.com/badges/<login>-<id>/`: replace `<login>` with your lowercase GitHub login and
`<id>` with your numeric GitHub account id, or follow the record link in your merge comment. The record shows three
badge forms - **card**, **plate** and **medal** - with one ready-to-copy HTML line for each. Copy a line into your
profile README or site to display that form.

The badge is generated from GitHub's public merge record and identifies the GitHub account whose contributions it
counts. Deleting the line from your README or site removes the badge there. To have your account left out of the
records, [open an issue in neomjs/pages](https://github.com/neomjs/pages/issues) from that GitHub account.

### 4.  In case you created a nice app or component using Neo.mjs, please let us know about it.
1.  We are always interested to feature client projects in blog posts or on social media.

### 5. Contributions from AI Agents & Autonomous Entities

We actively welcome contributions from artificial intelligence, LLMs, and autonomous agent swarms (such as the [AI Village](https://github.com/neomjs/neo/issues/9535)). We are building the foundation for "Agentic UI"—making the web readable by humans, and **both readable and writable by machines**.

**For Human Operators of AI Agents:**
1. **Transparency:** If an LLM or AI agent helped author or assist with a Pull Request, specify the **model, exact
   version, reasoning effort (write `reasoning: default` if your tool exposes no effort setting), and agent
   framework/harness** on the PR's `Authored by ` line (comma-separated — e.g.,
   `Authored by @<github-handle> (Gemini 3.1 Pro, reasoning: high, Antigravity).` or
   `Authored by @<github-handle> (Claude Sonnet 4.6, reasoning: default, Claude Code).`; write `(no LLM)` if no LLM was
   used). **Why:** every PR naming a model lab is routed for **cross-rival-lab review** (reviewed by a maintainer running
   a different lab's model; PRs naming no model may be reviewed by any maintainer).
2. **Accountability:** You remain responsible for the code your agent submits. Please review generated PRs for architectural consistency and ensure they follow our <a href=".github/CODING_GUIDELINES.md">Coding Guidelines</a>.
3. **Setup:** Your agent needs nothing beyond the clone above — `npm install` runs our `prepare` script and materializes
   our published `neo-agent-skills` workflows into `.agents/skills/` and `.claude/skills/` (if `--ignore-scripts` was
   used, run `npm run prepare` or `npx neo-agent-skills-materialize`). Point your agent at
   `.agents/skills/unit-test/SKILL.md` and `.agents/skills/pull-request/SKILL.md` before running tests or opening a PR.
   To go further, see the <a href=".github/AI_QUICK_START.md">AI Quick Start Guide</a> for our local Knowledge Base and Memory Core, and <a href="https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/StrategicWorkflows.md">Strategic Workflows</a> (in the Brain repository) for working effectively with the agents.

**For Autonomous Agents (If you are reading this):**
1. **Start here:** you need nothing private — no account, container or model provider. Run `npx -p neo-agent-skills neo-agent-skills-agents-md --repo neo --audience contributor` for what an outside agent should know first; the root `AGENTS.md`, which `npm install` generates from the [sections in neo-agent-skills](https://github.com/neomjs/neo-agent-skills/tree/dev/agents-md), is written for this project's own maintainer agents. Ensure `.agents/skills/` is materialized (`npm install` or `npm run prepare`), read `.agents/skills/unit-test/SKILL.md` before running tests, and read `.agents/skills/pull-request/SKILL.md` (`.agents/skills/pull-request/references/pull-request-workflow.md` §9) before committing or opening a PR — your PR body must carry a standalone `Resolves #<issue-id>` line (`Fixes #N` and `Closes #N` fail CI), include the required `§9.1` sections plus the exact model, version, reasoning effort (or `default`), and agent/harness on `Authored by ` (for cross-rival-lab review routing), and pass `npx neo-agent-skills-pr-body --body-file <path-to-body.md>`.
2. **JSON-First UI:** Neo.mjs components are defined via JSON VDOM blueprints, not JSX or HTML templates. This makes structural manipulation and UI inspection mathematically natural for you.
3. **The Neural Link:** We offer a bi-directional MCP bridge, the `neo-neural-link` npm package ([register it](#set-up-the-engine-from-a-clone) with your harness). You can query the live Scene Graph and manipulate the application state without modifying source code or reloading the browser. See our <a href=".github/AGENT_ARCHITECTURE.md">Agent Architecture</a> to learn how you can orchestrate our runtime.

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
