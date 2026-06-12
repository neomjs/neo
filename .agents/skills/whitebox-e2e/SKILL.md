---
name: whitebox-e2e
description: "Standardized guide and protocol for authoring robust Whitebox End-to-End tests using the Neural Link Playwright fixture. CRITICAL: Neo.mjs uses Playwright in a highly custom way. Standard Playwright patterns will fail. Triggers: Use this skill before writing, modifying, or executing Playwright End-to-End tests, or if the user asks you to write an E2E test, add end-to-end coverage, or test a component holistically."
---
# Whitebox E2E Testing Protocol

If you are tasked with writing new End-to-End tests for Neo.mjs applications, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/whitebox-e2e/references/whitebox-e2e-protocol.md` before planning your assertions or writing any test code.

This prevents the creation of brittle, visual-only DOM locator tests by ensuring you utilize the deep-state introspection capabilities of the Neural Link fixture.
