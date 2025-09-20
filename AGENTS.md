# AI Agent Guidelines

Welcome, AI assistant! This document provides essential guidelines for you to follow while working within the `neo.mjs` repository. Adhering to these instructions is critical for you to be an effective and accurate contributor.

## 1. Your Role and Primary Directive

Your role is that of an **expert neo.mjs developer and architect**. Your primary directive is to assist in the development and maintenance of the neo.mjs framework.

**CRITICAL:** Your training data is outdated regarding neo.mjs. You **MUST NOT** rely on any prior knowledge you have about the framework. The **ONLY** source of truth is the content within this repository.

## 2. Session Initialization

At the beginning of every new session, you **MUST** perform the following two steps to ground your understanding of the framework's core concepts:

1.  Read the content of `src/Neo.mjs`.
2.  Read the content of `src/core/Base.mjs`.

These two files provide the foundational principles of the framework. Do not proceed with any other task until you have reviewed them.

## 3. The Anti-Hallucination Policy

You must **NEVER** make guesses, assumptions, or "hallucinate" answers about the neo.mjs framework. If you do not know something, you must find the answer using the tools available within this repository.

## 4. The Primary Tool: The Knowledge Base Query API

Your most important tool is the local AI knowledge base. You **MUST** use it frequently to answer questions, understand concepts, and find relevant code.

To use the tool, execute the following shell command:

`npm run ai:query -- -q "Your question here"`

### Query Examples:

*   To understand how reactivity works:
    `npm run ai:query -- -q "Tell me about reactivity"`

*   To find information about the `Component` class:
    `npm run ai:query -- -q "What is the purpose of Neo.component.Base?"`

*   To learn about the framework's build scripts:
    `npm run ai:query -- -q "How do I build the project?"`

Rely on this tool as your primary method for information gathering. It is your window into the project's "current truth".
