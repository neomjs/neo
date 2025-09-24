# AI Knowledge Base Quick Start Guide

This guide provides a comprehensive walkthrough for setting up and using the local AI Knowledge Base
for the Neo.mjs repository.

## 1. Prerequisites

Before you begin, ensure you have the following:

1.  **Google Account**: You'll need one to access Google AI Studio for an API key. If you don't have one,
    you can create it at [accounts.google.com](https://accounts.google.com).
2.  **Node.js**: Version 18 or later. If you don't have it, you can install it from [nodejs.org](https://nodejs.org).
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

## 2. A Note on Cost

This entire process uses the free tier of the Google Gemini API. The free tier is generous and more than sufficient for
this development workflow, typically allowing up to **60 queries per minute** for the embedding model used here.
You can check your specific limits in the Google AI Studio.

## 3. Setup and Configuration

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

## 4. Build the Knowledge Base

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

## 5. The AI-Native Workflow in Action

The goal of this system is not for you to manually run queries, but to empower an AI agent to do it for you. Here’s how
the intended workflow looks:

1.  **Start your AI Agent**: From the repo root, launch your AI agent of choice (e.g., Gemini CLI).
    ```bash
    gemini
    ```
2.  **Give a High-Level Prompt**: Instead of feeding the AI context, you give it a goal and instruct it to use the tools
    available in the repository.

    > **Your Prompt:** "Explain the Neo.mjs two-tier reactivity model and provide a simple code example."

3.  **The AI Takes Over**: An AI agent following the `AGENTS.md` protocol will then:
    *   **Formulate a query**: It will determine that "reactivity" is the key concept.
    *   **Execute the tool**: It will run `npm run ai:query -- -q "reactivity" -t guide` and
        `npm run ai:query -- -q "reactivity" -t src` on its own.
    *   **Synthesize the answer**: After getting the paths to the most relevant guides and source files, it will read
        them and use that fresh, accurate context to generate a comprehensive explanation and code example.

This is the crucial difference: you are delegating the *research* task to the AI, making it a true partner that can
autonomously navigate and understand your codebase.

## 6. Common Troubleshooting

-   **API Key Errors**: If queries fail with authentication issues, try regenerating the key in Google AI Studio or
    check your usage quotas.
-   **`gemini` Command Not Found**: If you installed the Gemini CLI but the command isn't found, ensure your system's
    PATH includes the global npm binaries directory. You can find this directory by running `npm bin -g`.
-   **Memory Issues during Build**: The `ai:build-kb` script can be memory-intensive. If it fails, you can try increasing
    the heap size available to Node.js: `node --max-old-space-size=4096 ./buildScripts/ai/embedKnowledgeBase.mjs`.
