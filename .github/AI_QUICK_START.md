# AI Knowledge Base Quick Start

This guide assumes you have already cloned the `neo` repository and have all the necessary files.

## Prerequisites

1.  **Node.js**: v18 or later
2.  **Google AI API Key**: A `GEMINI_API_KEY` from Google AI Studio.

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
