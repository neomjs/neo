# neo.mjs: Getting Started Guide

This guide covers two main paths for working with neo.mjs:
1.  **Creating your own application**: The recommended approach for all developers building apps with the framework.
2.  **Contributing to the framework**: For those who want to contribute code directly to the neo.mjs core.

---

## 1. Creating your own application (Recommended)
For most use cases, creating a dedicated workspace with `npx neo-app` is the best way to start. This script scaffolds a new project, automatically installs dependencies, runs the initial build, and can even start the development server for you.

A workspace provides the same structure as the main neo.mjs repository, but includes the framework as an NPM dependency, making it easier to manage.

### Create a Workspace
1.  Open your terminal and navigate to the directory where you want to create your project.
2.  Run the following command:
    ```sh
    npx neo-app@latest
    ```
3.  Follow the interactive prompts. The script will guide you through setting up your workspace and creating your first application.

This single command handles the entire setup process, allowing you to start developing immediately.

---

## 2. Contributing to the framework or running examples
If you want to contribute to the development of neo.mjs itself, or if you want to run the many demo applications and examples included in the main repository, you will need to set up the core repository locally. The examples are not included in workspaces created with `npx neo-app`.

### Fork and Clone the Repository
1.  **Fork the repository**: First, create a fork of the `neomjs/neo` repository on GitHub to your own account.
2.  **Clone your fork**: Clone your forked repository to your local machine.
    ```sh
    git clone https://github.com/YOUR_USERNAME/neo.git
    ```

### Local Setup
1.  Navigate into the cloned repository folder:
    ```sh
    cd neo
    ```
2.  Install the required node modules:
    ```sh
    npm install
    ```
3.  Run all relevant build scripts at once:
    ```sh
    npm run build-all
    ```
    (See the <a href="https://github.com/neomjs/neo/blob/dev/buildScripts/README.md">Command-Line Interface</a> for further details.)

### Running the Examples
1.  **Start the web server**:
    ```sh
    npm run server-start
    ```
    A browser tab will open automatically. You can also manually access it at `http://localhost:8080/`. A local web server is required because modern browser security policies prevent JavaScript modules from loading directly from the local file system.

2.  **Explore the apps**:
    *   **Development Mode**: You can run the docs and examples apps **without** any JS build directly in all major browsers (Chrome, Edge, Firefox, Safari).
        > http://localhost:8080/neo/docs/
        >
        > http://localhost:8080/neo/examples/
    *   **Distribution Versions**: These versions also work in all major browsers and represent the built state of the examples.
        > http://localhost:8080/neo/dist/development/examples/
        >
        > http://localhost:8080/neo/dist/production/examples/

---

## Dive Deeper with Learning Resources
Once you have your environment set up, you can dive deeper into the concepts and architecture of the framework. The learning resources provide a structured path to mastering neo.mjs.

**[Explore the Learning Resources](../learn/README.md)**

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
