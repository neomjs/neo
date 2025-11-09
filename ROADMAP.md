# Neo.mjs Project Roadmap

This document outlines the high-level strategic direction and priorities for the Neo.mjs framework.

## Vision: The AI-Native Development Environment

Our core vision is to create a truly **AI-native development environment**. We are evolving the framework and its surrounding tooling to empower both human developers and AI agents to collaborate seamlessly on building complex, high-performance web applications.

## Current Focus: Mastering Context Engineering

As framed in our blog post, "[AI-Native, Not AI-Assisted](learn/blog/ai-native-platform-answers-questions.md)", our current development focus is not on the UI framework itself, but on the **tooling and infrastructure** that powers our AI-native workflows.

We are focused on **Context Engineering**: the practice of building systems that provide AI agents with the most relevant, accurate, and comprehensive context to perform their tasks. This is the key to unlocking meaningful AI contributions and creating a smooth onboarding experience where agents can teach newcomers.

Our work in this area is organized around several key initiatives:

### 1. The AI Knowledge & Memory Foundation
- **Goal:** To provide agents with comprehensive technical and historical context.
- **Initiatives:**
    - **Knowledge Base:** Following the v10.9 release, our RAG system has been enhanced to include all tickets and release notes, providing even deeper project insight.
    - **Memory Core:** The initial implementation of the agent's long-term memory is complete, allowing it to learn from past interactions. ([Epic: AI Knowledge Evolution](https://github.com/neomjs/neo/issues/7316))

### 2. Professionalizing AI Tooling (The 3 MCP Servers)
- **Goal:** To migrate our script-based tools into a robust, professional-grade server architecture.
- **Initiatives:**
    - We are building **three distinct Model Context Protocol (MCP) servers**:
        1. A **Knowledge Base Server** for querying project-specific source code and documentation.
        2. A **Memory Core Server** for providing agents with long-term conversational memory.
        3. A **GitHub Sync Server** to manage the 2-way synchronization of issues and PRs.
    - This involves moving the logic from the original scripts into a formal server architecture, making our tools more reliable and accessible to any AI agent. ([Epic: Architect AI Tooling as MCP](https://github.com/neomjs/neo/issues/7399))

### 3. Expanding Agent Capabilities
- **Goal:** To give agents powerful new ways to interact with the development environment.
- **Initiatives:**
    - **Sighted Agent:** A major initiative to empower agents with the ability to "see" and interact with web pages via Chrome DevTools, enabling automated UI/UX testing and validation. ([Epic: Sighted Agent & DevTools Integration](https://github.com/neomjs/neo/issues/7385))
    - **GitHub CLI Integration:** Deeply integrating the GitHub CLI to allow agents to automate PR reviews, issue creation, and other crucial repository interactions. ([Epic: Integrate GitHub CLI Workflow](https://github.com/neomjs/neo/issues/7364))

### 4. Ensuring Code Quality & Stability
- **Goal:** To maintain a stable and reliable codebase by enabling automated, scriptable testing for all contributors.
- **Initiatives:**
    - **Mandatory Unit Testing:** We are migrating our entire test suite from a browser-based harness (Siesta) to a Node.js-based runner (Playwright). The primary benefit is that tests can be run with a simple `npm test` command. This empowers AI agents to verify their own changes, and it unlocks future CI/CD integration (e.g., pre-commit hooks) to automatically prevent regressions. ([Epic: Enhance Workflow with Mandatory Unit Testing](https://github.com/neomjs/neo/issues/7262))

### 5. Decoupling the AI Tooling Ecosystem
- **Goal:** To evolve our general-purpose AI tools into standalone, reusable packages.
- **Initiatives:**
    - **Publish MCP Servers to npm (v11.1):** Following the initial implementation for v11, the **Memory Core** and **GitHub Sync** MCP servers will be published as independent packages to npm. This will be achieved by adding dedicated `package.json` files to their sub-folders within the `neo` repository. The Knowledge Base server will remain internal as it is tightly coupled with this project's source code. This strategy allows the general-purpose servers to be consumed via `npx` by the broader AI development community.

---

## The Path to v11.0.0

The completion of these foundational infrastructure projects will culminate in the `v11.0.0` release. The timing of this release is dependent on the progress made during Hacktoberfest and subsequent community contributions. After the event, we will assess the state of these epics to define a more concrete release schedule.
