# Ticket: Create "Working with AI Agents" Guide

**Assignee:** Gemini
**Status:** Done

## Description

Create a new guide, `WORKING_WITH_AGENTS.md`, to provide comprehensive instructions for human developers on how to effectively and safely collaborate with AI agents within this repository.

This guide covers several critical topics:
1.  **Session Initiation:** How to start a session correctly by directing the agent to `AGENTS.md`.
2.  **Error Recovery:** How to guide an agent to recover from mistakes.
3.  **Agent Behavior:** An explanation of non-determinism and accuracy, setting the right expectations.
4.  **The "Golden Rule":** A critical safety rule about never using "Always Allow" for file modifications, backed by security research on agentic misalignment.
5.  **Panic Responses:** How to spot and handle destructive agent behavior.
6.  **The Session Lifecycle:** An analogy for understanding agent context degradation over time.
7.  **Proactive Context Management:** A best practice for knowing when to start a fresh session.
