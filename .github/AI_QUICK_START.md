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
This is different from web-based chat interfaces (like ChatGPT or the Gemini web UI) because it allows the AI
to directly interact with your codebase, run scripts, and access the local knowledge base.

You can use any CLI-based AI agent that you are comfortable with. The following sections will show you how to set up
the knowledge base, and then provide an optional guide for configuring the Gemini CLI as one possible agent.

## 3. Setup the AI Environment (Required)

This section covers the mandatory steps to create the local vector database. The embedding process uses a Google
Gemini model, so a Gemini API key is required regardless of which AI agent you choose for chatting.

### A Note on Cost

This entire process uses the free tier of the Google Gemini API. The free tier is generous and more than sufficient for
this development workflow, typically allowing up to **60 queries per minute** for the embedding model used here.
You can check your specific limits in the Google AI Studio.

### Step 3.1: Obtain a Gemini API Key

The API key authenticates your requests to Google's Gemini models.

1.  **Visit Google AI Studio**: Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
2.  **Sign In**: Use your Google account credentials. Complete any two-factor authentication (2FA) if prompted.
3.  **Create API Key**: Click the "Create API key" button. The key will be generated instantly.
4.  **Copy and Secure the Key**: Click the copy icon next to the key. **Treat this key like a password and never commit
    it to version control.**

### Step 3.2: Configure Your Local Environment

1.  **Navigate to Repo Root**: Make sure you are in the root directory of your cloned `neo` repository.
2.  **Create `.env` file**: Create a new file named `.env`.
3.  **Add API Key**: Add the following line to the `.env` file, replacing `YOUR_API_KEY_HERE` with the key you just copied:
    ```
    GEMINI_API_KEY="YOUR_API_KEY_HERE"
    ```
    This file is already listed in `.gitignore` to prevent you from accidentally committing your key.

### Step 3.3: Start the AI Servers

The AI tooling now leverages Model Context Protocol (MCP) servers that automatically manage the ChromaDB instances for both the knowledge base and agent memories. You no longer need to manually build the knowledge base or initialize the memory collection.

1.  **Start the AI Servers**: In a new terminal window, run the following command. This will start all necessary MCP servers.
    ```bash
    npm run ai:server-all
    ```
    Keep this process running in the background. The servers will automatically create and embed the knowledge base, and manage the memory core.

    **Note**: If you wish to run the ChromaDB instances in separate terminals to view their logs or errors, you can still use `npm run ai:server` (for the knowledge base) and `npm run ai:server-memory` (for the memory core) individually. However, this is optional, as `npm run ai:server-all` handles everything.

## 4. Configuring an Agent (Optional Example: Gemini CLI)

Once the AI servers are running, you can interact with them using any terminal-based AI agent. This is an optional step showing how to install the Gemini CLI.

```bash
npm i -g @google/gemini-cli
```

## 5. The AI-Native Workflow: A Partnership

The goal of this system is to create a powerful partnership between you and the AI agent. To facilitate this, we use a system of configuration and guide files that automate the agent's setup and define its behavior.

### Agent Configuration and Behavior

The agent's behavior is primarily controlled by the following files:

-   **`.gemini/settings.json`**: This file is the entry point for the agent's configuration. It tells the agent which files to load into its context at the beginning of a session, and also defines the Model Context Protocol (MCP) servers to be used for the session.
-   **`.gemini/GEMINI.md`**: This file provides the initial instructions for the agent, including the mandatory pre-response check to ensure it has completed the session initialization.
-   **`AGENTS_STARTUP.md`**: This guide contains the detailed, step-by-step instructions for the agent's session initialization. It ensures the agent has a foundational understanding of the Neo.mjs architecture before it begins any task.
-   **`AGENTS.md`**: This is the rulebook for the **AI**. It contains the critical "per-turn" instructions, protocols, and constraints the agent must follow to be an effective contributor. This includes the "Ticket-First" gate and the Memory Core protocol.
-   **`WORKING_WITH_AGENTS.md`**: This is the playbook for **you**, the human developer. It provides essential strategies for guiding the agent, handling common issues, and maximizing its performance.

**Note on Agent Specificity**: The `.gemini/settings.json` and `.gemini/GEMINI.md` files are specific to the Gemini CLI. Other AI agents may use different configuration files or methods to achieve similar results.

Your first step before starting a session should be to familiarize yourself with the `WORKING_WITH_AGENTS.md` guide.

### The Automated Workflow in Action

Here’s how the intended workflow looks with the automated setup:

1.  **Start your AI Agent**: From the repo root, launch your AI agent of choice (e.g., Gemini CLI).
    ```bash
    gemini
    ```
2.  **Give a High-Level Prompt**: The agent will automatically perform its initialization based on the configuration files. Once it's ready, you can give it a goal.
    > **Your Prompt:** "Explain the Neo.mjs two-tier reactivity model and provide a simple code example."

3.  **The AI Takes Over**: An agent following the `AGENTS.md` protocol will then:
    *   **Formulate a query**: It will determine that "reactivity" is the key concept.
    *   **Execute the tool**: It will use the `neo.mjs-knowledge-base` MCP server's `query_documents` tool to query the knowledge base for "reactivity".
    *   **Synthesize the answer**: After getting the paths to the most relevant guides and source files, it will read them and use that fresh, accurate context to generate a comprehensive explanation.

This is the crucial difference: you are delegating the *research* task to the AI, making it a true partner that can autonomously navigate and understand your codebase.

## 6. Common Troubleshooting
-   **API Key Errors**: If queries fail with authentication issues, try regenerating the key in Google AI Studio or
    check your usage quotas.
-   **`gemini` Command Not Found**: If you installed the Gemini CLI but the command isn't found, ensure your system's
    PATH includes the global npm binaries directory. You can find this directory by running `npm bin -g`.
