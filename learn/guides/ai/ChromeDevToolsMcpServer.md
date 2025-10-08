# Chrome DevTools MCP Server Guide

This guide provides instructions for setting up and using the Chrome DevTools Model Context Protocol (MCP) server. This server acts as a bridge, allowing AI agents to interact with a live Chrome browser for tasks like debugging, performance analysis, and automation.

## Overview

The Chrome DevTools MCP server gives AI agents "eyes and hands" in the browser by providing access to the full power of Chrome DevTools. Key features include:

-   **Reliable Automation**: Uses Puppeteer to automate actions like clicks and form fills, automatically waiting for results.
-   **Advanced Debugging**: Allows for analysis of network requests, console logs, and taking screenshots.
-   **Performance Insights**: Can record traces and extract actionable performance insights.

## Prerequisites

A strict set of requirements must be met for the server to operate correctly:

1.  **Node.js:** You must have **Node.js version 22.12.0 or higher** installed.
2.  **Browser:** A current stable version of Google Chrome, Chromium, or Microsoft Edge.
3.  **npm:** A working installation of npm.

## Quick Start

You can run the server directly from your terminal to test it. For the most authoritative and up-to-date list of options, always run `npx chrome-devtools-mcp@latest --help`.

**Simple Run:**
```bash
npx chrome-devtools-mcp@latest
```

**Debug Run:**
This command starts the server in headless mode with a temporary profile, writes verbose logs to a file, and enables all debug logging.
```bash
DEBUG="*" npx chrome-devtools-mcp@latest --headless --isolated --logFile=./mcp-debug.log
```

## Configuration

For integration with an AI agent or client (e.g., Gemini CLI), you must configure the server in the appropriate settings file (e.g., `.gemini/settings.json`). Configuration is done using documented CLI flags passed in the `args` array.

### Example Configuration

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--isolated=true",
        "--executablePath=/path/to/your/chrome/executable"
      ]
    }
  }
}
```

### Automated Configuration for Agents

For a seamless experience, an AI agent should follow a dynamic process to detect the environment and configure the `executablePath` automatically.

**Agent Workflow:**

1.  **Determine Operating System:** The agent should first identify the OS. A reliable way is to run `uname -a`.
    *   **Linux:** Output will contain "Linux".
    *   **WSL:** Output will contain "microsoft-standard-WSL" or "WSL".
    *   **macOS:** Output will contain "Darwin".
    *   **Windows (e.g., Git Bash):** Output may contain "MINGW", "CYGWIN", or similar. If `uname` is not available, checking for the `windir` environment variable is a reliable fallback.

2.  **Find the Chrome Executable:** Based on the OS, the agent should search for the browser executable in standard locations.

    *   **If WSL:** Check for the existence of the following paths and use the first one found:
        1.  `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`
        2.  `/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe`

    *   **If Windows (Native/Git Bash):** Check these paths (using Windows-style paths):
        1.  `C:/Program Files/Google/Chrome/Application/chrome.exe`
        2.  `C:/Program Files (x86)/Google/Chrome/Application/chrome.exe`
        3.  Check the path stored in the registry at `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe`.

    *   **If macOS:** Check for this path:
        *   `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

    *   **If Linux:** The browser is typically on the system's `PATH`. The agent should run `command -v google-chrome` or `command -v chromium-browser`.
        *   If a path is returned, no `executablePath` is needed.
        *   If no path is returned, the agent could prompt the user or search common non-standard paths like `/opt/google/chrome/google-chrome`.

3.  **Update `.gemini/settings.json`:**
    *   The agent must read and parse the `.gemini/settings.json` file.
    *   **If a specific path was found (WSL, Windows, macOS):** The agent should find the `args` array for the `chrome-devtools` server and add or update the `--executablePath` entry with the correct path.
    *   **If no specific path is needed (standard Linux):** The agent should ensure that no `--executablePath` entry exists in the `args` array to allow the server to find the browser automatically.

This dynamic approach ensures the configuration is correct across different user environments without manual intervention.

**Illustrative `.gemini/settings.json` Structure:**

The agent will dynamically modify a base configuration, preserving existing fields like `commandDescription` and `environment`. The `args` array will be updated based on the detected operating system.

*Initial or Base Configuration (before agent modification):*
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--isolated=true"
      ],
      "commandDescription": "Starts the Chrome DevTools MCP server, enabling browser automation and debugging.",
      "environment": {
        "CHROME_DEVTOOLS_MCP_LOG_LEVEL": "info",
        "CHROME_DEVTOOLS_MCP_PORT": "8080"
      }
    }
  }
}
```

*After Agent Modification on WSL (Example):*
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--isolated=true",
        "--executablePath=/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
      ],
      "commandDescription": "Starts the Chrome DevTools MCP server, enabling browser automation and debugging.",
      "environment": {
        "CHROME_DEVTOOLS_MCP_LOG_LEVEL": "info",
        "CHROME_DEVTOOLS_MCP_PORT": "8080"
      }
    }
  }
}
```

### All Configuration Options

| Argument | Alias | Description |
|---|---|---|
| `--executablePath` | `-e` | Path to a custom Chrome executable. **Use this if your browser is not on the system `PATH`.** |
| `--headless` | | Whether to run in headless (no UI) mode. |
| `--isolated` | | If specified, creates a temporary user data directory that is cleaned up after the browser closes. |
| `--channel` | | Specify a different Chrome channel to use (`stable`, `canary`, `beta`, `dev`). |
| `--browserUrl` | `-u` | Connect to a running Chrome instance using a remote debugging URL. |
| `--viewport` | | Initial viewport size (e.g., `1280x720`). |
| `--proxyServer` | | Proxy server configuration. |
| `--acceptInsecureCerts` | | Ignores errors from self-signed/expired certificates. |
| `--logFile` | | Path to a file to write debug logs to. |

## Security Considerations

**Warning:** The MCP server provides extensive control over a browser instance. The connected AI client can access all DOM content, network requests, and execute arbitrary scripts.

-   **Use Test Accounts:** Never use personal or privileged accounts in the automated browser.
-   **Isolated Profiles:** Use the `--isolated` flag to create a clean, temporary profile for each run, preventing session data from leaking.
-   **Trusted Networks:** Only run the MCP server on a trusted local machine or within a secure, isolated network.

## Agent Usage Workflow & Best Practices

A robust agent should follow this workflow:

1.  **Navigate:** Use `navigate_page` to load the target web page.
2.  **Snapshot:** Use `take_snapshot` to get the initial DOM state and `uid`s.
3.  **Interact & Verify:** Use an interaction tool (`click`, `fill`), then immediately use an inspection tool (`list_network_requests`, `take_snapshot`) to verify the outcome and get the new state. **Always re-run `take_snapshot` after any action that modifies the DOM.**
4.  **Log Everything:** For auditability and debugging, log every tool call, its parameters, and its result.

### Agent Best Practices Checklist
-   **Prefer Targeted Extraction:** For simple data needs, use `evaluate_script` to extract only the necessary information instead of taking a large snapshot.
-   **Handle Stale `uid`s:** If a `click` or `fill` fails, assume the `uid` is stale. Re-run `take_snapshot` to get the latest DOM state and try the interaction again.
-   **Chunk Large Data:** If a snapshot is too large for your context window, use `evaluate_script` to paginate or chunk the data.
-   **Implement Retries:** For network-dependent actions, use a simple retry mechanism (e.g., exponential backoff) for transient errors.

## Tool Reference & Examples

This section details key tools with machine-readable examples.

### `take_snapshot`
Captures the DOM and assigns `uid`s to elements. This is the primary tool for enabling interaction.

**Caveats:**
-   **Stale `uid`s:** `uid`s become invalid after any DOM change (e.g., navigation, button click that loads new content). Always re-snapshot after such actions.
-   **Large Snapshots:** On complex pages, the snapshot can be very large and may exceed token limits. Use `evaluate_script` for targeted data extraction as an alternative.

**Request:**
```json
{
  "tool_code": "take_snapshot"
}
```
**Success Response (truncated):**
```json
{
  "tool_name": "take_snapshot",
  "output": "Snapshot of page content..."
}
```
**Failure Response:**
```json
{
  "tool_name": "take_snapshot",
  "error": "Failed to take snapshot: No page selected."
}
```

---
### `click`
Clicks on an element with the given `uid`.

**Request:**
```json
{
  "tool_code": "click(uid='12')"
}
```
**Success Response:**
```json
{
  "tool_name": "click",
  "output": "Successfully clicked on the element."
}
```
**Failure Response (Stale `uid`):**
```json
{
  "tool_name": "click",
  "error": "Element with uid '12' not found."
}
```

---
### `evaluate_script`
Executes a JavaScript function in the page context.

**Request:**
```json
{
  "tool_code": "evaluate_script(function='() => document.title')"
}
```
**Success Response:**
```json
{
  "tool_name": "evaluate_script",
  "output": "{\"result\":\"Example Domain\"}"
}
```
**Failure Response:**
```json
{
  "tool_name": "evaluate_script",
  "error": "JavaScript execution failed: ReferenceError: myFunction is not defined"
}
```

---
### `performance_start_trace`
Starts a performance trace recording.

**Request:**
```json
{
  "tool_code": "performance_start_trace(reload=true, autoStop=true)"
}
```
**Success Response:**
```json
{
  "tool_name": "performance_start_trace",
  "output": "Performance trace started."
}
```
**Failure Response:**
```json
{
  "tool_name": "performance_start_trace",
  "error": "A performance trace is already running."
}
```

## Troubleshooting

### Health Check Pattern
The simplest health check is to see if the server's port is listening. A more robust check is a successful tool call, like `list_pages()`.

### Finding the Process
-   **Linux/macOS:** `ps aux | grep chrome-devtools-mcp`
-   **Windows:** `tasklist | findstr "node"`

### Enabling Verbose Logs
To diagnose issues, enable verbose logging by setting the `DEBUG` environment variable and using the `--logFile` argument.
-   **Command:** `DEBUG="*" npx chrome-devtools-mcp@latest --logFile=./mcp-debug.log`
-   **Logs Location:** The logs will be written to `mcp-debug.log` in your current directory.

### Common Failures & Commands
-   **`Target closed` error**: The browser could not be started.
    1.  **Check for other Chrome instances:** Close any running Chrome processes.
    2.  **Verify executable path:** Ensure your browser is on the system `PATH` or use the `--executablePath` flag with the correct path.
    3.  **Check for port conflicts:** Another process might be using the remote debugging port.

-   **`Error [ERR_MODULE_NOT_FOUND]`**: Indicates a Node.js or npm cache issue.
    1.  **Verify Node.js version:** Run `node -v` to ensure you are on v22.12.0 or higher.
    2.  **Clear npx cache:** Run `rm -rf ~/.npm/_npx` (on Linux/macOS). This may remove other npx executables.
    3.  **Reinstall:** Run `npm cache clean --force` and try again.

## Platform-Specific Caveats
-   **WSL/Containers:** When running in a containerized environment or WSL, the server may not be able to find the browser. You must use `--executablePath` to point to the browser executable on the host machine or use `--browserUrl` to connect to a browser you run manually.
-   **Remote Debugging:** The `--browserUrl` flag allows you to connect to a Chrome instance running on a different machine (e.g., a dedicated test server).

## Concepts
### User Data Directory
By default, the server stores the Chrome profile in a dedicated directory to persist state between runs:
-   **Linux / macOS:** `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
-   **Windows:** `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

To use a fresh, temporary profile for each run that gets deleted automatically, use the `--isolated=true` argument.