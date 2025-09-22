# AI Knowledge Base Quick Start

This guide assumes you have already cloned the `neo` repository and have all the necessary files.

## Installation

1.  **Install the Gemini CLI**
    If you haven't already, install the Google Gemini CLI globally via npm:
    ```bash
    npm install -g @google/gemini-cli
    ```

2.  **Start the CLI**
    Navigate to the root directory of your `neo` repository clone and start the Gemini CLI:
    ```bash
    gemini
    ```
    **Important:** You must run the CLI from the project root for it to have the correct context of the codebase.

## Prerequisites

To get started, you will need the following:

1.  **Google Account**: You'll need one to access Google AI Studio for an API key. If you don't have one, you can create it at [accounts.google.com](https://accounts.google.com).
2.  **Node.js**: Version 18 or later. If you don't have it, you can install it from [nodejs.org](https://nodejs.org).
3.  **Forked & Cloned Neo.mjs Repository**: To contribute, you should first fork the repository on GitHub, and then clone your personal fork.
    ```bash
    # In your browser, visit https://github.com/neomjs/neo and click the "Fork" button.
    # Then, clone your fork (replace YOUR_USERNAME):
    git clone https://github.com/YOUR_USERNAME/neo.git
    cd neo
    ```
4.  **Internet Access**: Required for the initial installation of tools and for generating your API key.

## A Note on Cost

This entire process uses the free tier of the Google Gemini API. The free tier is generous and more than sufficient for this development workflow, typically allowing up to **60 queries per minute** for the embedding model used here. You can check your specific limits in the Google AI Studio.

## Getting a Gemini API Key

To interact with the local knowledge base, you need a Google AI API key.

1.  Visit the Google AI Studio website: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2.  Sign in with your Google account.
3.  Click the "Create API key" button.
4.  Copy the generated API key. You will need it for the setup below.

## Setup Steps

1.  **Configure Environment**
    - Create a `.env` file in the root of the repository.
    - Add your API key to it: `GEMINI_API_KEY="YOUR_API_KEY_HERE"`

2.  **Start the AI Server**
    In a separate terminal, run:
    ```bash
    npm run ai:server
    ```
    Keep this server running.

3.  **Build the Knowledge Base**
    In another terminal, run:
    ```bash
    npm run generate-docs-json
    npm run ai:build-kb
    ```

4.  **Query the Knowledge Base**
    ```bash
    npm run ai:query -- -q "Your query here"
    ```
