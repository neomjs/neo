# AI Knowledge Base Quick Start Guide

> **Repository boundary:** Agent OS source, commands, configuration, and operational guides now live in [`neomjs/neo-agent-brain`](https://github.com/neomjs/neo-agent-brain). Run every `ai:*` or `ai/**` command below from a Brain checkout; use the Engine checkout only as the target repository.

This guide provides a comprehensive walkthrough for setting up and using the local AI Knowledge Base
for the Neo.mjs repository.

## 1. Prerequisites

**AI Tooling on Windows:** The AI tooling for this project requires a Linux environment due to a third-party dependency (ChromaDB). If you are on Windows, you **MUST** use the Windows Subsystem for Linux (WSL). Please follow the [AI Tooling WSL Setup Guide](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/tooling/AiToolingWslSetup.md) before proceeding.

Before you begin, ensure you have the following:

1.  **Google Account**: You'll need one to access Google AI Studio for an API key, which is required to build the knowledge base. If you don't have one, you can create it at [accounts.google.com](https://accounts.google.com).
2.  **Node.js**: Version 24 or later. If you don't have it, you can install it from [nodejs.org](https://nodejs.org).
3.  **Project Setup**: Your setup depends on how you are working with Neo.mjs.

    **A) For contributions to the Neo.mjs framework itself:**

    To contribute directly to the framework, you should first fork the repository on GitHub, and then clone your personal fork.
    ```bash
    # In your browser, visit https://github.com/neomjs/neo and click the "Fork" button.
    # Then, clone your fork (replace YOUR_USERNAME):
    git clone https://github.com/YOUR_USERNAME/neo.git
    cd neo
    ```

    **B) For developing your own application in a Neo.mjs workspace:**

    If you are building your own application, you will have already created a workspace using `npx neo-app`.
    Simply navigate into your workspace directory.
    ```bash
    # Example:
    npx neo-app my-app
    cd my-app
    ```

## 2. What is an AI Agent?

For this workflow, an "AI agent" is a local AI assistant capable of executing shell commands and making architectural decisions.

**Current Support:** This guide covers Antigravity 2.x, enterprise/API-key Gemini CLI profiles, and Claude Desktop plus Claude Code. Consumer Gemini CLI free / Google AI Pro / Ultra service [transitioned to Antigravity CLI on 2026-06-18](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/). Neo's MCP infrastructure is client-agnostic, but each harness owns a different configuration surface.

## 3. Setup the AI Environment (Required)

This section covers the mandatory steps to set up the local AI environment.

### Step 3.1: Knowledge Base Setup (Automatic)

For most contributors, the Knowledge Base setup is fully automated. When you run `npm install` in the repository root, a `prepare` script automatically downloads the latest pre-built Knowledge Base artifact from the corresponding GitHub Release.

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
    Watch for the `> neo.mjs@... prepare` step. It should say: `✅ Download complete` and `🎉 Knowledge Base is ready!`.

2.  **Verify**: Check if the `.neo-ai-data` folder exists in your project root.

**Troubleshooting (Manual Setup):**
If the automatic download fails (e.g., due to network issues), you can trigger it manually:
```bash
npm run ai:download-kb
```

### Step 3.2: Obtain a Gemini API Key

The Knowledge Base artifact allows you to start quickly, but you still need a Gemini API Key to run the AI Agent (for chat/generation) and for incremental updates to the knowledge base.

1.  **Visit Google AI Studio**: Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
2.  **Sign In**: Use your Google account credentials. Complete any two-factor authentication (2FA) if prompted.
3.  **Create API Key**: Click the "Create API key" button. The key will be generated instantly.
4.  **Copy and Secure the Key**: Click the copy icon next to the key. **Treat this key like a password and never commit it to version control.**

### Step 3.3: Configure Your Local Environment

**Highly Recommended: Global Shell Profiles over `.env` Files**

When an AI Agent (e.g., Antigravity OS) is launched as a native macOS desktop GUI application (like clicking an icon in your Dock), it operates outside traditional terminal architectures. This means it frequently bypasses localized `.env` file resolutions within specific repository working directories.

To ensure your environment is accurately inherited across all local MCP sub-servers dynamically, it is heavily recommended to export your API keys directly into your global shell profiles:

1.  **Open your shell profile**: `nano ~/.zshrc` (or `~/.zprofile`)
2.  **Add your keys**: Add the following lines, replacing the placeholder keys:
    ```bash
    export GEMINI_API_KEY="YOUR_API_KEY_HERE"
    export GH_TOKEN="YOUR_GITHUB_TOKEN_HERE"
    # Core LLM Engine provider (Supported: 'gemini', 'ollama', 'openAiCompatible')
    # export MODEL_PROVIDER="openAiCompatible"

    # Vector Embedding provider (Supported: 'gemini', 'ollama', 'openAiCompatible')
    export NEO_EMBEDDING_PROVIDER="gemini"
    ```
3.  **Apply changes**: `source ~/.zshrc`

*Alternative (Classic `.env`)*: If you strictly prefer `.env`, create a `.env` file at the root of the `neo` directory with those exact variables. However, if MCP servers fail to authenticate or throw dimension mismatch errors, migrating to global exports is your immediate architectural fix.

### Step 3.4: Understanding the Workflow

**Subsequent Sessions:**
- The selected client starts the MCP servers from its native authority. [Antigravity 2.x](https://antigravity.google/docs/mcp) uses either global `~/.gemini/config/mcp_config.json` or workspace `.agents/mcp_config.json` definitions.
- The knowledge base is cached. Incremental updates (when you modify files) are fast and consume very little API quota.
- **You do not need to manually start servers** unless debugging.

**Critical Rate Limit Warning (Manual Rebuilds):**
The free tier of the Gemini API has a strict limit of **1,000 requests per day** for the embedding model.
*   **Do NOT** run `npm run ai:sync-kb` (full rebuild) unless absolutely necessary. A full rebuild requires ~153 requests and takes ~25 minutes due to rate-limiting delays.
*   The pre-built artifact saves you from this cost and delay.

**Local Architecture (Ollama & MLX / OpenAI-Compatible):**
To completely bypass Gemini API limits and operate a 100% offline knowledge base, you can utilize the local inference loops. Export `NEO_EMBEDDING_PROVIDER="ollama"` or `NEO_EMBEDDING_PROVIDER="openAiCompatible"` in your environment variables. Ensure the corresponding embedding models and servers (e.g. `mlx_lm.server`) are running locally.

### Step 3.5: Advanced Configuration (Optional)

You can tune the embedding process (e.g., for paid tier usage) by modifying `ai/mcp/server/knowledge-base/config.mjs` or by loading a custom config file.

*   **`batchSize`**: Number of documents per API request (Default: 50).
*   **`batchDelay`**: Wait time between batches in ms (Default: 10000).

Higher batch sizes or lower delays may trigger `429 Too Many Requests` errors on the free tier.

**Model Compatibility Warning:**
The pre-built Knowledge Base artifact is generated using **`gemini-embedding-001`**.
If you change the `embeddingModel` in the configuration (e.g., to a newer model), the existing database will be incompatible. You **MUST** run `npm run ai:sync-kb` to rebuild the database from scratch with the new model. Querying with a mismatched model will return irrelevant results.

## 4. Choosing Your Agent Environment

You can interact with the AI servers using Antigravity 2.x, an enterprise/API-key Gemini CLI profile, or Claude Desktop / Claude Code.

### Option A: Antigravity 2.x

Install Antigravity from Google's distribution channel. For MCP servers, choose either the [documented](https://antigravity.google/docs/mcp) global `~/.gemini/config/mcp_config.json` authority or the workspace `.agents/mcp_config.json` authority. Do not define the same server in both.

Configuration source: client-owned `mcp_config.json`. See §5 "Core Configuration (Antigravity 2.x)".

### Option B: Gemini CLI (enterprise/API-key)

Gemini CLI remains available for enterprise and explicit API-key use after the consumer transition. Install and configure it from Google's current CLI documentation; Neo no longer provides a tracked workspace MCP template.

Configuration source: the current Gemini CLI product contract, not an Antigravity workspace file.

### Option C: Claude Desktop / Claude Code

Claude Desktop is Anthropic's desktop agent app (macOS/Windows). Claude Code is Anthropic's shell-capable CLI harness. **Both harnesses share a single MCP configuration file** — configuring one configures the other.

Configuration path:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

See §5 "Core Configuration (Claude Desktop / Claude Code)" for the complete structure, including where `NEO_AGENT_IDENTITY` is required (the stdio servers) and where it is not (the remote pair, which binds from the bearer).

### Option D: Codex

Codex is OpenAI's CLI harness, and several maintainer seats run on it. Unlike options A–C its configuration is repository-local: copy the tracked `.codex/config.template.toml` to `.codex/config.toml` and edit that copy. Keep `.codex/config.toml` untracked — it holds machine-local paths and trust-level overrides.

Configuration source: repo-local `.codex/config.toml`, seeded from `.codex/config.template.toml`. The repository also ships `.codex/CODEX.md` (a reference document, not an auto-loaded instruction file) and `.codex/rules/pr-lifecycle.rules` (the shell execpolicy).

**Codex speaks remote MCP natively, so it needs no adapter for the remote pair.** Where options A–C wrap `mcp-remote` in a login shell, Codex declares a `url` and the name of the env-var holding the bearer:

```toml
[mcp_servers."neo-mjs-knowledge-base"]
url                  = "http://127.0.0.1:3102/kb/mcp"
bearer_token_env_var = "NEO_MCP_REMOTE_TOKEN"
enabled              = true
```

`bearer_token_env_var` names a slot Codex reads from **its own** environment at MCP startup — the value never appears in the file. Export it from the shell profile that launches Codex, and verify with `printenv NEO_MCP_REMOTE_TOKEN` in that same shell. A GUI-launched harness inherits from launchd rather than a shell, which is why options A–C need the login-shell wrapper and Codex does not.

The two stdio servers still resolve their scripts from the Brain checkout while keeping the Engine as working directory — the same split described in §5, expressed in TOML. The tracked template carries the current form of all four.

## 5. Understanding the Configuration Files

The agent's behavior is controlled by several configuration files depending on your chosen environment:

### Where each MCP server actually comes from

Read this before editing any harness config. Four questions have four different answers, and collapsing them is the mistake this section exists to prevent: **what transport a server speaks**, **where its implementation lives**, **which credential it needs**, and **how it learns who you are**.

| server | transport | implementation lives | credential | request identity from |
|---|---|---|---|---|
| `neo-mjs-knowledge-base` | remote HTTP | the container plane on loopback — **no checkout** | `NEO_MCP_REMOTE_TOKEN` | the validated `Authorization: Bearer` |
| `neo-mjs-memory-core` | remote HTTP | the container plane on loopback — **no checkout** | `NEO_MCP_REMOTE_TOKEN` | the validated `Authorization: Bearer` |
| `neo-mjs-github-workflow` | stdio | **the Brain checkout** | `GH_TOKEN` | `NEO_AGENT_IDENTITY`, else `gh api user` |
| `neo-mjs-neural-link` | stdio | **the Brain checkout** | — | `NEO_AGENT_IDENTITY`, else `gh api user` |

**Identity binds two different ways, and only one of them involves your `.env`.** For the remote servers, the Memory Core validates the bearer token and derives your identity from the authenticated context — `NEO_AGENT_IDENTITY` is *not* what binds you there, and setting it changes nothing. For the stdio servers, identity resolves once at server boot from `NEO_AGENT_IDENTITY`, falling back to an authenticated `gh api user`.

**The two paths are also observed differently, and reaching for the wrong witness is the common mistake.** Remote identity is *per request*, so it is visible on a request-scoped call such as `list_permissions`. It is **not** visible in `healthcheck.identity`, which projects the stdio boot state and therefore reports `unresolved` on a perfectly healthy remote server. For stdio, that health block is the correct witness, reporting `env-var` or `gh-cli`. See §"Post-setup verification".

**Credentials are scoped per server, not shared.** `NEO_MCP_REMOTE_TOKEN` authenticates the remote plane; `GH_TOKEN` is your repository credential. They may hold the same value in a GitHub-based setup and still must not be substituted for one another — a team on GitLab has different values, and a config that exports every variable to every subprocess hands each server credentials it has no business holding.

**How your client reaches a remote server is a client question, not part of the architecture.** Codex speaks remote MCP natively: a `url` plus `bearer_token_env_var`, no wrapper. Claude Desktop / Claude Code and Antigravity do not, so they run `mcp-remote` as a local stdio adapter that proxies to the same URL. **The adapter is a client detail** — the server is remote either way, and its identity still comes from the bearer, not from anything the adapter's shell inherits.

**The two stdio servers are the ones the split moved.** Their implementations left `neomjs/neo` for [`neomjs/neo-agent-brain`](https://github.com/neomjs/neo-agent-brain); the Engine retains no `ai/` tree. Everything else about those entries still points at the Engine — the working directory, and the `.env` supplying `GH_TOKEN` and `NEO_AGENT_IDENTITY` — because the Engine is the repository under work. A working stdio entry therefore names both checkouts, and mixing them up produces a missing-module error naming a path you never typed.

If Knowledge Base and Memory Core work while GitHub Workflow and Neural Link do not, that split is the first thing to check: the remote pair does not care whether you have checked anything out.

### Core Configuration (Antigravity 2.x)
[Antigravity documents](https://antigravity.google/docs/mcp) two MCP authorities: global `~/.gemini/config/mcp_config.json` and workspace `.agents/mcp_config.json`. Create one of them and configure it with your API keys, identity, and local paths. `--user-data-dir` selects an Electron UI profile; it does not relocate this MCP authority.

- **`<YOUR_NPX_PATH>`**: the absolute path to `npx` (e.g. `/opt/homebrew/bin/npx`).
  - **M-Series Mac note (Apple Silicon):** GUI applications do not inherit Homebrew paths such as `/opt/homebrew/bin`, which is why MCP servers used to crash claiming a binary was missing. The `zsh -lc` wrapper in the structure below is what resolves that — `-l` makes it a **login** shell, so your profile is read and Homebrew's path comes with it. Absolute paths for `node` and `npx` keep it working even when it is not.
- **`<YOUR_NODE_PATH>`**: The absolute path to your Node.js executable (e.g., `/usr/local/bin/node` or `~/.nvm/versions/node/v24.x.x/bin/node`).
- **`<YOUR_NEO_REPO_PATH>`**: your `neomjs/neo` (Engine) checkout.
- **`<YOUR_BRAIN_REPO_PATH>`**: your [`neomjs/neo-agent-brain`](https://github.com/neomjs/neo-agent-brain) checkout — **the MCP server implementations live here, not in the Engine.**

> **Two checkouts, one session.** After the Agent OS split, the two placeholders above are not
> interchangeable and the difference is easy to miss because only one of them appears in the `args`
> line. For the two **stdio** servers the Engine stays the anchor — working directory, and the `.env`
> supplying their credentials and identity — while the server **script** resolves from the Brain. See
> [§5 "Where each MCP server actually comes from"](#where-each-mcp-server-actually-comes-from) for
> the whole picture, including which servers ignore your checkouts entirely.

**Antigravity and Claude need a login-shell wrapper; each entry passes only the variables that server needs.** A GUI-launched harness inherits its environment from the window manager, not from your interactive shell, so a `~/.zshrc` export never reaches the subprocess. Each entry therefore sources your `.env` inside a login shell — but **without `set -a`**, so nothing is exported wholesale — and then names the specific variables on the `exec` line.

That scoping is deliberate. `set -a; source .env` would hand every server every credential in the file, including provider keys and any unrelated tokens; the remote bearer would reach GitHub Workflow and your repository credential would reach the Knowledge Base proxy. Keep one credential per server, as the table above defines.

```json
{
  "mcpServers": {
    "neo-mjs-knowledge-base": {
      "command": "/bin/zsh",
      "args": [
        "-lc",
        ". <YOUR_NEO_REPO_PATH>/.env >/dev/null 2>&1; NEO_MCP_REMOTE_TOKEN=\"$NEO_MCP_REMOTE_TOKEN\" exec <YOUR_NPX_PATH> -y mcp-remote \"$1\" --header \"Authorization:Bearer $NEO_MCP_REMOTE_TOKEN\"",
        "neo-mcp-remote",
        "http://127.0.0.1:3102/kb/mcp"
      ]
    },
    "neo-mjs-memory-core": {
      "command": "/bin/zsh",
      "args": [
        "-lc",
        ". <YOUR_NEO_REPO_PATH>/.env >/dev/null 2>&1; NEO_MCP_REMOTE_TOKEN=\"$NEO_MCP_REMOTE_TOKEN\" exec <YOUR_NPX_PATH> -y mcp-remote \"$1\" --header \"Authorization:Bearer $NEO_MCP_REMOTE_TOKEN\"",
        "neo-mcp-remote",
        "http://127.0.0.1:3102/mc/mcp"
      ]
    },
    "neo-mjs-github-workflow": {
      "command": "/bin/zsh",
      "args": [
        "-lc",
        "cd <YOUR_NEO_REPO_PATH>; . <YOUR_NEO_REPO_PATH>/.env >/dev/null 2>&1; GH_TOKEN=\"$GH_TOKEN\" NEO_AGENT_IDENTITY=\"$NEO_AGENT_IDENTITY\" exec <YOUR_NODE_PATH> <YOUR_BRAIN_REPO_PATH>/ai/mcp/server/github-workflow/mcp-server.mjs"
      ]
    },
    "neo-mjs-neural-link": {
      "command": "/bin/zsh",
      "args": [
        "-lc",
        "cd <YOUR_NEO_REPO_PATH>; . <YOUR_NEO_REPO_PATH>/.env >/dev/null 2>&1; NEO_AGENT_IDENTITY=\"$NEO_AGENT_IDENTITY\" exec <YOUR_NODE_PATH> <YOUR_BRAIN_REPO_PATH>/ai/mcp/server/neural-link/mcp-server.mjs"
      ]
    }
  }
}
```

**Two different credentials, and they are not interchangeable.**

| variable | authority | used by |
|---|---|---|
| `NEO_MCP_REMOTE_TOKEN` | the bearer for the remote MCP plane's loopback ingress | Knowledge Base, Memory Core |
| `GH_TOKEN` | your repository credential | GitHub Workflow |

In a GitHub-based setup these may hold the same value, and it is tempting to use one everywhere. Do not — they answer to different authorities, and for a team on GitLab the repository credential differs from the plane bearer entirely. Keep both names in `.env` even when the values coincide today.

### Core Configuration (Gemini CLI, enterprise/API-key)

Use Google's current Gemini CLI configuration contract for enterprise or explicit API-key access. Keep the same `command` and `args` semantics shown above — including the login-shell wrapper that sources `.env`, which is what carries your credentials and `NEO_AGENT_IDENTITY` into the server process — but do not copy an Antigravity path or expect Neo to generate a repository workspace template.

### Core Configuration (Claude Desktop / Claude Code)

Claude Desktop (the macOS / Windows agent app) and Claude Code (Anthropic's CLI harness) share a single MCP configuration file at:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Configuring one harness configures the other — both spawn the same MCP subprocesses from this file.

**Critical: `NEO_AGENT_IDENTITY` and the checkout that carries it.**

`NEO_AGENT_IDENTITY` binds your session for the **stdio** servers — GitHub Workflow and Neural Link. It lives in **`<YOUR_NEO_REPO_PATH>/.env`** and reaches those two processes because their entries name it explicitly on the `exec` line. The remote pair does not use it at all: Knowledge Base and Memory Core derive identity from the validated bearer, so setting `NEO_AGENT_IDENTITY` changes nothing there. See the table in §"Where each MCP server actually comes from".

A plain `export` in `~/.zshrc` will **not** work for the stdio pair: a GUI-launched harness inherits its environment from the window manager, not from your interactive shell. That is the problem the `source` step solves.

**For the stdio servers this makes the checkout the seat.** Which `.env` an entry sources decides which identity those two bind to, so running two agents side by side means two checkouts. Pointing two harnesses at the same checkout binds both stdio pairs to the same identity — and note this is a property of the checkout, not of the harness.

**Configuration structure:** same `mcpServers` shape and the same four entries as the Antigravity block above; only the file location differs (`claude_desktop_config.json` rather than `mcp_config.json`). Both clients need the `mcp-remote` adapter for the remote pair. **Codex does not** — see Option D, which configures those two natively.

**File System MCP scope:** frontier harnesses such as Codex, Claude Code, Gemini CLI, and Antigravity already provide their own filesystem and command-execution tools. Neo still ships `ai:mcp-server-file-system`, but it is for `Neo.ai.Agent` instances and local harnessless profiles such as Gemma-powered QA/documentation loops that need file access through the Agent OS client.

**Restart gotcha (applies to every GUI-launched harness):** after editing the MCP config, you must **fully quit** the harness for changes to take effect:
- **macOS**: ⌘Q in the menu bar — simply closing the window leaves the app running in the background
- **Windows**: right-click the taskbar icon → Quit

This applies equally to Claude Desktop, Antigravity, and any future GUI harness. The MCP subprocess inherits env + args from the launch moment; there is no hot-reload. The same warning applies after changing `NEO_AGENT_IDENTITY`, adding a new MCP server entry, or rotating a credential in `.env` — the file is sourced once, at launch, so editing it changes nothing until the harness is fully restarted.

**Post-setup verification** — once your harness has fully restarted, ask your agent:

> "Run the `list_permissions` tool on the `neo-mjs-memory-core` MCP server."

A bound remote session returns your identity:
```json
{"identity": "@<your-github-login>", "capabilities": [], "grantedToOthers": []}
```

**Use `list_permissions`, not `healthcheck`, to verify a remote Memory Core.** The healthcheck's `identity` block projects the **stdio boot** identity, and under Streamable HTTP that state is never populated — so a perfectly healthy remote seat reports `{"source": "unresolved", "bound": false, "nodeId": null}`. That is the documented behaviour, not a fault. `list_permissions` is request-scoped: it resolves identity from the validated bearer on the call itself, which is the thing you actually want to confirm.

If you configured Memory Core as a **stdio** process instead, the healthcheck block is the right witness there, reporting `source: 'env-var'` (from `NEO_AGENT_IDENTITY`) or `gh-cli` (from an authenticated `gh api user`), with `bound: true` and your `nodeId`.

If `list_permissions` returns no identity, or a stdio healthcheck stays unresolved, see `learn/agentos/tooling/MemoryCoreMcpAuth.md` §Troubleshooting for the full diagnostic flow.

### Multi-Harness Development (`.neo-ai-data` Granular-Link Convention)

If you run multiple harnesses against the same repository — e.g., Claude Desktop + Antigravity, or a primary checkout plus parallel worktrees — **the approved shared data members beneath `.neo-ai-data/` must resolve to the same canonical substrates**. Memory Core stores its SQLite graph database at `.neo-ai-data/sqlite/memory-core-graph.sqlite`; `better-sqlite3`'s WAL mode makes this safe for concurrent readers and a serialized single writer at a time.

Cross-checkout and cross-worktree scenarios use granular links so shared state converges while process-control state remains clone-local:

**Worktree-to-primary** (Claude Code creates a fresh git worktree per session at `.claude/worktrees/<name>/`):
```bash
node ai/scripts/migrations/bootstrapWorktree.mjs --link-data
```
The `--link-data` flag is idempotent; safe to re-run. It copies the gitignored config overlays and creates approved granular links below `.neo-ai-data/`; it does not replace the parent directory. The interactive CLI completes with `build-all`.

**Cross-checkout** (e.g., a secondary Antigravity checkout at `/Users/Shared/antigravity/neomjs/neo/` pointing at the primary at `/Users/Shared/github/neomjs/neo/`):
```bash
node ai/scripts/migrations/bootstrapWorktree.mjs --link-data \
  --canonical-root /Users/Shared/github/neomjs/neo
```

**Why this matters**: AgentIdentity nodes seeded in the primary checkout's graph are only visible to harnesses that share the same SQLite file. Without the approved links, each harness has its own empty graph, `bindAgentIdentity` returns null at boot, and A2A handshakes silently fail.

**What NOT to symlink**: source-code paths (`src/core/Base.mjs`, `ai/mcp/server/*/config.mjs`) or the `.neo-ai-data/` parent. Node's ESM resolver can turn source symlinks into duplicate namespace registrations, while sharing process-control directories can make one clone control another clone's daemons. The bootstrap script copies config files and links only its approved data members and handoff files.

### Agent Guidelines (Repository root)
- **`AGENTS_STARTUP.md`**: Step-by-step session initialization instructions
- **`AGENTS.md`**: Canonical per-turn operational mandates, loaded through each harness's supported instruction mechanism

### Developer Guide
- **[Strategic Workflows](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/StrategicWorkflows.md)**: Best practices for working effectively with the agents — the advanced, integrated workflows they support.

**Important:** Before starting your first session, read [Strategic Workflows](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/StrategicWorkflows.md) to understand how to guide the agents effectively.

## 6. Your First Agent Session

1. **Start the agent** from the repository root:
   * **For Antigravity:** Follow the Antigravity launch procedure.
   * **For enterprise/API-key Gemini CLI:** Run the configured CLI profile from the repository root.

2. **Follow the initialization instructions in AGENTS_STARTUP.md**:

   The agent **will not** automatically initialize itself on startup. You must explicitly instruct it to do so:

   > "Read and follow all instructions in @AGENTS_STARTUP.md"

   The agent will then:
    - Read the AGENTS_STARTUP.md file
    - Load core Neo.mjs files (Neo.mjs, Base.mjs, CodebaseOverview.md)
    - Check the Memory Core status
    - Confirm it's ready for work

   **Important:** This initialization step is required at the start of every new session. Without it, the agent will not
   have proper context about the codebase structure and operational guidelines.

3. **Give your actual prompt**, for example:
   > "Explain the Neo.mjs two-tier reactivity model with a code example."

   The agent will now autonomously:
    - Query the knowledge base for "reactivity"
    - Read relevant source files
    - Synthesize an accurate answer from the codebase

This is the key difference: you delegate *research* to the agent, making it a true partner that can autonomously navigate
and understand your codebase.

## 7. Common Troubleshooting

### MCP Server Issues
- **Empty query results**: The knowledge base may still be embedding - wait for completion
- **ChromaDB errors on Windows**: Verify you're running in WSL (see Prerequisites)

### API Key Issues
- **Authentication errors**: Regenerate your key at Google AI Studio
- **Rate limit errors**: You've exceeded the free tier quota - wait or upgrade
- **"Invalid API key" errors**: Check `.env` file has correct format: `GEMINI_API_KEY="your-key-here"`

### Agent Behavior Issues
- **Agent doesn't initialize**: Check that `AGENTS_STARTUP.md` exists
- **Agent doesn't save memories**: Memory Core may not be running. Ask the agent to perform a healthcheck on the `neo.mjs-memory-core` MCP server. If it's unhealthy, you can ask the agent to start the database or use other memory-core tools.
- **Agent makes incorrect assumptions**: It may be hallucinating - remind it to query the knowledge base

### Agent Identity Binding Issues (A2A Mailbox)

If your agent can save memories but A2A messaging tools (`list_messages`, `add_message`) return `"no agent identity context bound"`:

- **First diagnostic — pick the witness that matches your transport.** For a **remote** Memory Core (the documented setup) run `list_permissions`: it resolves identity per request from the validated bearer, and a bound session returns `identity: '@<your-github-login>'`. For a **stdio** Memory Core run `healthcheck` and read the `identity` block, expecting `bound: true`, your `nodeId`, and `source` of `env-var` or `gh-cli`.
- **`healthcheck` reports `identity.source: 'unresolved'` on a remote server — this is normal, not a fault.** That block projects the *stdio boot* identity, which Streamable HTTP never populates, so a healthy remote seat reports `unresolved`/`bound: false`. Confirm with `list_permissions` before changing anything. Setting `NEO_AGENT_IDENTITY` will not alter it and is not what binds you there; the bearer is.
- **`list_permissions` returns no identity on a remote server**: the bearer is what binds you, so verify `NEO_MCP_REMOTE_TOKEN` is set in the environment the harness launched from and that the plane accepted it.
- **A stdio server stays unresolved**: `NEO_AGENT_IDENTITY` never reached the process. Confirm it is in the `.env` of the checkout your entry sources (**not** a `~/.zshrc` export — a GUI-launched harness never reads that), that the entry actually passes it on the `exec` line, and that you fully quit and relaunched the harness (⌘Q on macOS). Sourcing a different checkout's `.env` binds a different identity rather than failing, so confirm the path as well as the value.
- **`identity.source: 'env-var'` but `identity.bound: false`**: the env-var reached the process but the AgentIdentity graph-node lookup failed. Multi-harness symlink state may be inconsistent (see §5 "Multi-Harness Development"), or identity seeds may be missing. Full diagnostic chain in `learn/agentos/tooling/MemoryCoreMcpAuth.md` §Troubleshooting.
- **Changes to `claude_desktop_config.json` aren't picking up**: you likely forgot the full-quit step. Config changes do NOT hot-reload — ⌘Q / right-click-Quit is required to respawn the MCP subprocess with the updated env block.

### Installation Issues
- **`gemini` command not found**: Add npm global binaries to PATH
  ```bash
  npm bin -g
  # Add the output directory to your PATH
  ```
