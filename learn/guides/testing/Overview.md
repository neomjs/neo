# Testing Neo.mjs Applications

Testing is a critical part of the Neo.mjs ecosystem. Because of the framework's unique multi-threaded architecture, our testing strategy is divided into three distinct pillars, each serving a specific purpose.

## 1. Unit Testing (Logic & State)
**Focus:** Core logic, State Management, VDOM Diffing.
**Environment:** Simulated Single-Thread Node.js (via Playwright).

Unit tests in Neo.mjs are designed for extreme speed and debugging simplicity. We simulate the entire worker architecture (App, VDom, Data) inside a single Node.js thread. This allows you to step through code execution across "workers" without context switching and verify logic without the overhead of a real browser.

[Read the Unit Testing Guide](UnitTesting.md)

## 2. Component Testing (Visual & Interaction)
**Focus:** DOM Events, CSS, Layout, Browser APIs.
**Environment:** Real Browser (Chrome/Firefox/Webkit).

Component tests run your actual application code inside a real browser environment. This is where you verify that your buttons click, your layouts resize correctly, and your CSS renders as expected. We use a specialized "Remote Control" architecture to drive the App Worker from the test runner.

[Read the Component Testing Guide](ComponentTesting.md)

## 3. Benchmarking (Performance & Resilience)
**Focus:** Concurrency, FPS, Resilience under Load, Cross-Framework Comparison.
**Environment:** Specialized High-Precision Harness (Separate Repository).

Standard functional tests pass if the UI "eventually" reaches the correct state. Benchmarks measure *how* it gets there. We focus on "Resilience Testing"—measuring if the application can handle high-frequency updates (e.g., 100k rows) without dropping frames.

Our harness uses **Atomic In-Browser Measurement** (MutationObservers) to eliminate test-runner latency, allowing us to generate fair, high-precision comparisons between Neo.mjs, React, and Angular.

**Note:** The benchmarking suite is maintained in a separate repository to ensure a sterile, isolation-focused environment.

[Read the Benchmarking Guide](Benchmarking.md)

## Summary

| Type | Environment | Use Case |
| :--- | :--- | :--- |
| **Unit** | Node.js (Simulated) | "Does the logic work?" (Store filtering, VDOM generation) |
| **Component** | Real Browser | "Does it look right and react to clicks?" (Drag & drop, Focus) |
| **Benchmark** | Specialized Harness | "Is it fast and stable under pressure?" (100k rows, 60 FPS) |
