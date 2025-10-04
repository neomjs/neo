# AI Knowledge Base Quick Start Guide

This guide provides a comprehensive walkthrough for setting up and using the local AI Knowledge Base
for the Neo.mjs repository.

## 1. Prerequisites

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

## 3. Setup & Build the Knowledge Base (Required)

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

### Step 3.3: Build the Knowledge Base

With the configuration in place, you can now build the local vector database.

1.  **Start the AI Server**: In a new terminal window, start the ChromaDB server. Keep this process running in the background.
    ```bash
    npm run ai:server
    ```
2.  **Build the Knowledge Base**: In another terminal, run the following commands sequentially. This may take a few
    minutes on the first run.
    ```bash
    # 1. Generates docs/output/structure.json for codebase mapping
    npm run generate-docs-json

    # 2. Creates, embeds, and stores all content in the local ChromaDB
    npm run ai:build-kb
    ```

## 4. Optional: Enable Agent Memory Core

To give your AI agent a persistent memory of past interactions, you can enable the optional memory core. This allows the agent to recall previous conversations, decisions, and thought processes, leading to more informed and consistent responses.

### Step 4.1: Start the Memory Server

In a new terminal window, start the dedicated ChromaDB server for agent memories. Keep this process running in the background.

```bash
npm run ai:server-memory
```

### Step 4.2: Initialize the Memory Collection

In another terminal, run the following command to create the necessary collection in the memory database.

```bash
npm run ai:setup-memory-db
```

## 5. Configuring an Agent (Optional Example: Gemini CLI)

Once the knowledge base is built, you can interact with it using any terminal-based AI agent. This is an optional
step showing how to install the Gemini CLI.

```bash
npm i -g @google/gemini-cli
```

## 6. The AI-Native Workflow: A Partnership

The goal of this system is to create a powerful partnership between you and the AI agent. To facilitate this, we use a dual-guide system:

-   **`AGENTS.md`**: This is the rulebook for the **AI**. It contains the critical instructions, protocols, and constraints the agent must follow to be an effective contributor.
-   **`WORKING_WITH_AGENTS.md`**: This is the playbook for **you**, the human developer. It provides essential strategies for guiding the agent, handling common issues, and maximizing its performance.

Your first step before starting a session should be to familiarize yourself with the `WORKING_WITH_AGENTS.md` guide.

### The Workflow in Action

Here’s how the intended workflow looks:

1.  **Start your AI Agent**: From the repo root, launch your AI agent of choice (e.g., Gemini CLI).
    ```bash

2.  **Give the Initial Handshake**: This is the most critical step. Your first prompt **must** direct the agent to its instructions.
    > **Your Prompt:** "follow the instructions inside @AGENTS.md"

3.  **Give a High-Level Prompt**: Once the agent has completed its initialization, you can give it a goal.
    > **Your Prompt:** "Explain the Neo.mjs two-tier reactivity model and provide a simple code example."

4.  **The AI Takes Over**: An agent following the `AGENTS.md` protocol will then:
    *   **Formulate a query**: It will determine that "reactivity" is the key concept.
    *   **Execute the tool**: It will run `npm run ai:query -- -q "reactivity" -t guide` on its own.
    *   **Synthesize the answer**: After getting the paths to the most relevant guides and source files, it will read them and use that fresh, accurate context to generate a comprehensive explanation.

This is the crucial difference: you are delegating the *research* task to the AI, making it a true partner that can autonomously navigate and understand your codebase.

## 7. Common Troubleshooting
-   **API Key Errors**: If queries fail with authentication issues, try regenerating the key in Google AI Studio or
    check your usage quotas.
-   **`gemini` Command Not Found**: If you installed the Gemini CLI but the command isn't found, ensure your system's
    PATH includes the global npm binaries directory. You can find this directory by running `npm bin -g`.
-   **Memory Issues during Build**: The `ai:build-kb` script can be memory-intensive. If it fails, you can try increasing
    the heap size available to Node.js: `node --max-old-space-size=4096 ./buildScripts/ai/embedKnowledgeBase.mjs`.
