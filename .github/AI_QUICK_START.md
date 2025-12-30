# AI Knowledge Base Quick Start Guide

This guide provides a comprehensive walkthrough for setting up and using the local AI Knowledge Base
for the Neo.mjs repository.

## 1. Prerequisites

**AI Tooling on Windows:** The AI tooling for this project requires a Linux environment due to a third-party dependency (ChromaDB). If you are on Windows, you **MUST** use the Windows Subsystem for Linux (WSL). Please follow the [AI Tooling WSL Setup Guide](../learn/guides/ai/AiToolingWslSetup.md) before proceeding.

Before you begin, ensure you have the following:

1.  **Google Account**: You'll need one to access Google AI Studio for an API key, which is required to build the knowledge base. If you don't have one, you can create it at [accounts.google.com](https://accounts.google.com).
2.  **Node.js**: Version 20 or later. If you don't have it, you can install it from [nodejs.org](https://nodejs.org).
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

For this workflow, an "AI agent" is a terminal-based AI assistant capable of executing local shell commands.

**Current Support:** This guide focuses on the Gemini CLI setup. Support for other agents (Claude Code, Aider, etc.) is planned. The core infrastructure (MCP servers, knowledge base) is agent-agnostic, but the configuration files in `.gemini/` are Gemini-specific.

## 3. Setup the AI Environment (Required)

This section covers the mandatory steps to set up the local AI environment.

### Step 3.1: Knowledge Base Setup (Automatic)

For most contributors, the Knowledge Base setup is fully automated. When you run `npm install` in the repository root, a `prepare` script automatically downloads the latest pre-built Knowledge Base artifact from the corresponding GitHub Release.

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
    Watch for the `> neo.mjs@... prepare` step. It should say: `✅ Download complete` and `🎉 Knowledge Base is ready!`.

2.  **Verify**: Check if the `chroma-neo-knowledge-base` folder exists in your project root.

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

1.  **Navigate to Repo Root**: Make sure you are in the root directory of your cloned `neo` repository.
2.  **Create `.env` file**: Create a new file named `.env`.
3.  **Add API Key**: Add the following line to the `.env` file, replacing `YOUR_API_KEY_HERE` with the key you just copied:
    ```
    GEMINI_API_KEY="YOUR_API_KEY_HERE"
    ```
    This file is already listed in `.gitignore` to prevent you from accidentally committing your key.

### Step 3.4: Understanding the Workflow

**Subsequent Sessions:**
- The MCP servers are automatically started by the Gemini CLI when you run `gemini`.
- The knowledge base is cached. Incremental updates (when you modify files) are fast and consume very little API quota.
- **You do not need to manually start servers** unless debugging.

**Critical Rate Limit Warning (Manual Rebuilds):**
The free tier of the Gemini API has a strict limit of **1,000 requests per day** for the embedding model.
*   **Do NOT** run `npm run ai:sync-kb` (full rebuild) unless absolutely necessary. A full rebuild requires ~153 requests and takes ~25 minutes due to rate-limiting delays.
*   The pre-built artifact saves you from this cost and delay.

### Step 3.5: Advanced Configuration (Optional)

You can tune the embedding process (e.g., for paid tier usage) by modifying `ai/mcp/server/knowledge-base/config.mjs` or by loading a custom config file.

*   **`batchSize`**: Number of documents per API request (Default: 50).
*   **`batchDelay`**: Wait time between batches in ms (Default: 10000).

Higher batch sizes or lower delays may trigger `429 Too Many Requests` errors on the free tier.

**Model Compatibility Warning:**
The pre-built Knowledge Base artifact is generated using **`gemini-embedding-001`**.
If you change the `embeddingModel` in the configuration (e.g., to a newer model), the existing database will be incompatible. You **MUST** run `npm run ai:sync-kb` to rebuild the database from scratch with the new model. Querying with a mismatched model will return irrelevant results.

## 4. Installing the Gemini CLI Agent

To interact with the AI servers, install the Gemini CLI:
```bash
npm i -g @google/gemini-cli
```

## 5. Understanding the Configuration Files

The agent's behavior is controlled by several configuration files:

### Core Configuration (`.gemini/` directory)
- **`settings.json`**: Defines context files and MCP servers for the session

### Agent Guidelines (Repository root)
- **`AGENTS_STARTUP.md`**: Step-by-step session initialization instructions
- **`AGENTS.md`**: Per-turn operational mandates (automatically loaded via settings.json)

### Developer Guide (Repository root)
- **`WORKING_WITH_AGENTS.md`**: Your playbook for working effectively with AI agents

**Important:** Before starting your first session, read [WORKING_WITH_AGENTS.md]() to understand how to guide the agent effectively.

## 6. Your First Agent Session

Once the Gemini CLI is installed:

1. **Start the agent** from the repository root:
   ```bash
   gemini
   ```

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

### Installation Issues
- **`gemini` command not found**: Add npm global binaries to PATH
  ```bash
  npm bin -g
  # Add the output directory to your PATH
  ```
