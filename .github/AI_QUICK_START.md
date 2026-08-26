# AI Knowledge Base Quick Start Guide

This guide provides a comprehensive walkthrough for setting up and using the local AI Knowledge Base
for the Neo.mjs repository.

## 1. Prerequisites

**AI Tooling on Windows:** The AI tooling for this project requires a Linux environment due to a third-party dependency (ChromaDB). If you are on Windows, you **MUST** use the Windows Subsystem for Linux (WSL). Please follow the [AI Tooling WSL Setup Guide](../learn/guides/ai/AiToolingWslSetup.md) before proceeding.

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

See §5 "Core Configuration (Claude Desktop / Claude Code)" for the complete structure, including the `NEO_AGENT_IDENTITY` env-var requirement for A2A mailbox binding.

## 5. Understanding the Configuration Files

The agent's behavior is controlled by several configuration files depending on your chosen environment:

### Core Configuration (Antigravity 2.x)
[Antigravity documents](https://antigravity.google/docs/mcp) two MCP authorities: global `~/.gemini/config/mcp_config.json` and workspace `.agents/mcp_config.json`. Create one of them and configure it with your API keys, identity, and local paths. `--user-data-dir` selects an Electron UI profile; it does not relocate this MCP authority.

- **`<DEFAULT_PATH>`**: Your system's default `PATH` environment variable.
  - **M-Series Mac Warning (Apple Silicon):** Desktop GUI applications do **not** inherit Homebrew paths like `/opt/homebrew/bin` since macOS strips out `.zshrc` upon GUI Spotlight launch. If your GitHub CLI (`gh`) or `sqlite3` were installed via Homebrew, you **must** manually prepend `/opt/homebrew/bin:` to this `<DEFAULT_PATH>` string (or symlink them into `/usr/local/bin` using `sudo`), otherwise your MCP servers will silently crash claiming binaries are missing!
- **`<YOUR_NODE_PATH>`**: The absolute path to your Node.js executable (e.g., `/usr/local/bin/node` or `~/.nvm/versions/node/v24.x.x/bin/node`).

Use the following structure:

```json
{
  "mcpServers": {
    "neo-mjs-knowledge-base": {
      "command": "<YOUR_NODE_PATH>",
      "args": [
        "<YOUR_NEO_REPO_PATH>/ai/mcp/server/knowledge-base/mcp-server.mjs"
      ],
      "env": {
        "GEMINI_API_KEY": "<YOUR_GEMINI_API_KEY>",
        "PATH": "<YOUR_NEO_REPO_PATH>/node_modules/.bin:<DEFAULT_PATH>"
      }
    },
    "neo-mjs-memory-core": {
      "command": "<YOUR_NODE_PATH>",
      "args": [
        "<YOUR_NEO_REPO_PATH>/ai/mcp/server/memory-core/mcp-server.mjs"
      ],
      "env": {
        "GEMINI_API_KEY": "<YOUR_GEMINI_API_KEY>",
        "NEO_AGENT_IDENTITY": "<YOUR_AGENT_GITHUB_LOGIN>",
        "PATH": "<YOUR_NEO_REPO_PATH>/node_modules/.bin:<DEFAULT_PATH>"
      }
    },
    "neo-mjs-github-workflow": {
      "command": "<YOUR_NODE_PATH>",
      "args": [
        "<YOUR_NEO_REPO_PATH>/ai/mcp/server/github-workflow/mcp-server.mjs"
      ],
      "env": {
        "GH_TOKEN": "<YOUR_GH_TOKEN>",
        "PATH": "<YOUR_NEO_REPO_PATH>/node_modules/.bin:<DEFAULT_PATH>"
      }
    },
    "neo-mjs-neural-link": {
      "command": "<YOUR_NODE_PATH>",
      "args": [
        "<YOUR_NEO_REPO_PATH>/ai/mcp/server/neural-link/mcp-server.mjs",
        "--cwd",
        "<YOUR_NEO_REPO_PATH>"
      ],
      "env": {
        "PATH": "<YOUR_NEO_REPO_PATH>/node_modules/.bin:<DEFAULT_PATH>"
      }
    }
  }
}
```

### Core Configuration (Gemini CLI, enterprise/API-key)

Use Google's current Gemini CLI configuration contract for enterprise or explicit API-key access. Keep the same `command`, `args`, and per-server `env` semantics shown above, but do not copy an Antigravity path or expect Neo to generate a repository workspace template.

### Core Configuration (Claude Desktop / Claude Code)

Claude Desktop (the macOS / Windows agent app) and Claude Code (Anthropic's CLI harness) share a single MCP configuration file at:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Configuring one harness configures the other — both spawn the same MCP subprocesses from this file.

**Critical: `NEO_AGENT_IDENTITY` placement for A2A mailbox binding.**

For the A2A (Agent-to-Agent) mailbox substrate to bind your agent session to its AgentIdentity graph node, the Memory Core server's `env` block MUST include `NEO_AGENT_IDENTITY` set to the GitHub login of the bound identity (e.g., `neo-opus`). **This MUST live inside the per-server `env` block — not as a shell export** — because Claude Desktop launches MCP subprocesses directly from the GUI without inheriting interactive-shell state. A shell export in `~/.zshrc` will NOT reach the spawned MCP process.

Use the following structure (replace the placeholders as in the Antigravity section above):

```json
{
  "mcpServers": {
    "neo-mjs-knowledge-base": {
      "command": "<YOUR_NODE_PATH>",
      "args": ["<YOUR_NEO_REPO_PATH>/ai/mcp/server/knowledge-base/mcp-server.mjs"],
      "env": {
        "GEMINI_API_KEY": "<YOUR_GEMINI_API_KEY>",
        "PATH": "<YOUR_NEO_REPO_PATH>/node_modules/.bin:<DEFAULT_PATH>"
      }
    },
    "neo-mjs-memory-core": {
      "command": "<YOUR_NODE_PATH>",
      "args": ["<YOUR_NEO_REPO_PATH>/ai/mcp/server/memory-core/mcp-server.mjs"],
      "env": {
        "GEMINI_API_KEY": "<YOUR_GEMINI_API_KEY>",
        "NEO_AGENT_IDENTITY": "<YOUR_GITHUB_LOGIN>",
        "PATH": "<YOUR_NEO_REPO_PATH>/node_modules/.bin:<DEFAULT_PATH>"
      }
    },
    "neo-mjs-github-workflow": {
      "command": "<YOUR_NODE_PATH>",
      "args": ["<YOUR_NEO_REPO_PATH>/ai/mcp/server/github-workflow/mcp-server.mjs"],
      "env": {
        "GH_TOKEN": "<YOUR_GH_TOKEN>",
        "PATH": "<YOUR_NEO_REPO_PATH>/node_modules/.bin:<DEFAULT_PATH>"
      }
    },
    "neo-mjs-neural-link": {
      "command": "<YOUR_NODE_PATH>",
      "args": [
        "<YOUR_NEO_REPO_PATH>/ai/mcp/server/neural-link/mcp-server.mjs",
        "--cwd",
        "<YOUR_NEO_REPO_PATH>"
      ],
      "env": {
        "PATH": "<YOUR_NEO_REPO_PATH>/node_modules/.bin:<DEFAULT_PATH>"
      }
    }
  }
}
```

**File System MCP scope:** frontier harnesses such as Codex, Claude Code, Gemini CLI, and Antigravity already provide their own filesystem and command-execution tools. Neo still ships `ai:mcp-server-file-system`, but it is for `Neo.ai.Agent` instances and local harnessless profiles such as Gemma-powered QA/documentation loops that need file access through the Agent OS client.

**Restart gotcha (applies to every GUI-launched harness):** after editing the MCP config, you must **fully quit** the harness for changes to take effect:
- **macOS**: ⌘Q in the menu bar — simply closing the window leaves the app running in the background
- **Windows**: right-click the taskbar icon → Quit

This applies equally to Claude Desktop, Antigravity, and any future GUI harness. The MCP subprocess inherits env + args from the launch moment; there is no hot-reload. The same warning applies after changing `NEO_AGENT_IDENTITY`, adding a new MCP server entry, or rotating API keys in the `env` block.

**Post-setup verification** — once your harness has fully restarted, ask your agent:

> "Run the healthcheck tool on the `neo-mjs-memory-core` MCP server."

A healthy identity binding returns:
```json
{
  "identity": {
    "source": "env-var",
    "bound": true,
    "nodeId": "@<your-github-login>"
  }
}
```

If `identity.bound` is `false` despite `source: 'env-var'`, or if you see any other identity-binding error, see the [Memory Core MCP authentication guide](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/tooling/MemoryCoreMcpAuth.md) §Troubleshooting for the full diagnostic flow.

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

- **First diagnostic**: ask the agent to run `healthcheck` on `neo-mjs-memory-core` and inspect the `identity` block. A healthy result shows `source: 'env-var'`, `bound: true`, `nodeId: '@<your-github-login>'`.
- **`identity.source: 'unresolved'`**: `NEO_AGENT_IDENTITY` never reached the MCP process. Verify it lives in the per-server `env` block of your harness config (not as a shell export), then fully quit and relaunch the harness (⌘Q on macOS).
- **`identity.source: 'env-var'` but `identity.bound: false`**: the env-var reached the process but the AgentIdentity graph-node lookup failed. Multi-harness symlink state may be inconsistent (see §5 "Multi-Harness Development"), or identity seeds may be missing. Full diagnostic chain in the [Memory Core MCP authentication guide](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/tooling/MemoryCoreMcpAuth.md) §Troubleshooting.
- **Changes to `claude_desktop_config.json` aren't picking up**: you likely forgot the full-quit step. Config changes do NOT hot-reload — ⌘Q / right-click-Quit is required to respawn the MCP subprocess with the updated env block.

### Installation Issues
- **`gemini` command not found**: Add npm global binaries to PATH
  ```bash
  npm bin -g
  # Add the output directory to your PATH
  ```
