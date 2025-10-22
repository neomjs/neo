---
id: 7387
title: Create Guide for Chrome DevTools MCP Server
state: CLOSED
labels:
  - documentation
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - kart-u
createdAt: '2025-10-06T10:29:56Z'
updatedAt: '2025-10-08T20:57:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7387'
author: tobiu
commentsCount: 2
parentIssue: 7385
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-08T20:57:32Z'
---
# Create Guide for Chrome DevTools MCP Server

**Reported by:** @tobiu on 2025-10-06

---

**Parent Issue:** #7385 - 'Sighted' Agent - Chrome DevTools Integration

---

To ensure that human and AI developers can successfully set up and use the Chrome DevTools Model Context Protocol (MCP) server, a new guide needs to be created. This guide will live in `learn/guides/ai/` and will provide clear instructions for installation and troubleshooting.

## Acceptance Criteria

1.  A new markdown file is created at `learn/guides/ai/ChromeDevToolsMcpServer.md`.
2.  The guide explains the purpose of the MCP server.
3.  The guide explicitly states that Node.js v22.12.0 or higher is a strict requirement.
4.  The guide explains how the MCP server is configured in `.gemini/settings.json`.
5.  The guide provides basic troubleshooting steps, including how to check the server status and log files.

## Comments

### @kart-u - 2025-10-06 20:27

@tobiu can you please assign this to me??

### @tobiu - 2025-10-06 20:40

This is a really exciting epic from a R&D perspective (literally bleeding edge).

Hint: for the MCP server to run, you need node v22.20 or higher. Otherwise gemini fails silently when trying to start it (damn, this did cost me time).

Let me give you more input:

<img width="967" height="408" alt="Image" src="https://github.com/user-attachments/assets/09b4d0b8-9d20-4636-bbaf-f5d459a82650" />

Gemini tried several commands at first, none worked. Then it googled for quite some time. Result: "After installation, using this server requires restarting the terminal, meaning ending our session. Why did Google not include such a crucial detail into their blog post?"

The memory core resolved this gracefully (not starting from 0 again):

<img width="800" height="532" alt="Image" src="https://github.com/user-attachments/assets/926299fa-bb60-4369-a823-c18e43f56cb2" />

Current testing:

<img width="1304" height="1360" alt="Image" src="https://github.com/user-attachments/assets/73bcbf44-f685-4f46-a49f-5c0a871380be" />

DOM access works, and this is indeed huge, since Gemini can now examine the output of code. After the MCP server is started, Gemini was self-aware of the available tools. However, I think this guide is still valuable, even when it means maintenance work for us when the server gets extended.

