# AI Knowledge Base Quick Start

This guide assumes you have already cloned the `neo` repository and have all the necessary files.

## Prerequisites

1.  **Node.js**: v18 or later
2.  **Google AI API Key**: A `GEMINI_API_KEY` from Google AI Studio.

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
