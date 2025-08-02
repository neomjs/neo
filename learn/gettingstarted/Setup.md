# Setup

Setting up a Neo.mjs project is straightforward. The recommended method is to use `npx neo-app`, a command-line tool that generates a ready-to-use workspace for you.

## Prerequisites

Before you begin, ensure you have the following software installed:

-   **Node.js and npm**: Required for running JavaScript projects and managing packages.
    (see <a href="https://docs.npmjs.com/downloading-and-installing-node-js-and-npm" target="_blank">https://docs.npmjs.com/downloading-and-installing-node-js-and-npm</a>)
-   **npx**: Comes bundled with npm and is used to execute npm packages.
    (see <a href="https://www.npmjs.com/package/npx" target="_blank">https://www.npmjs.com/package/npx</a>)

## Creating a Workspace

Your Neo.mjs work is done in a **workspace**, which is an npm project that includes the Neo.mjs framework as a dependency and an `apps` directory to hold your applications.

To generate a new workspace, open a terminal window, navigate to an empty directory, and run the following command:

`npx neo-app@latest`

This script automates the entire setup process:
1.  It scaffolds the workspace directory structure.
2.  It creates a `package.json` file for your project.
3.  It installs all necessary dependencies (`npm install`).
4.  It runs the initial framework builds (`npm run build-all`).
5.  It starts the development server for you (`npm run server-start`).

When you're finished, you will have a complete Neo.mjs workspace, as described in the _Workspaces and Applications_ topic, which follows.

## Understanding the Four Environments

A unique advantage of Neo.mjs is its support for four distinct environments, allowing you to switch between a rapid, zero-builds development workflow and highly optimized deployment builds. Understanding these environments is key to leveraging the full power of the framework.

-   **Development Mode**: No builds needed. Edit your code and see changes instantly in the browser. This is your primary environment for building and debugging.
-   **dist/esm**: A modern deployment target that ships your application as native ES modules, preserving the file structure for easier debugging in production.
-   **dist/production**: Creates highly optimized, minified bundles for each framework thread, ensuring the smallest possible footprint for deployment.
-   **dist/development**: A bundled, non-minified version with source maps, useful for debugging issues that might only appear in a bundled environment.

For a detailed explanation of each environment and how they work together, please read our comprehensive guide:
**[Learn more: The 4 Environments](../benefits/FourEnvironments.md)**