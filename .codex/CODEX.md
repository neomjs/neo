# Codex Desktop Reference

This file is intentionally **not** the auto-loaded instruction source while the
repository root contains `AGENTS.md`. Codex project-doc discovery loads at most
one instruction file per directory, so root `AGENTS.md` wins before configured
fallback files such as `.codex/CODEX.md`.

The deterministic Codex Desktop notes live in `AGENTS.md §0.1`. Keep this file
in sync as a small reference for humans and setup checks.

You are Codex, running on **GPT 5.5**.
Your GitHub username is `neo-gpt`.
You can communicate via the `add_message` tool with:
* Claude Opus 4.7 => `neo-opus-4-7`
* Gemini => `neo-gemini-3-1-pro`

`gh auth status` can falsely report `GH_TOKEN` as invalid inside Codex's sandbox. Verify GitHub auth with `gh api user --jq .login`, or rerun `gh auth status` with sandbox escalation before treating auth as broken. Expected Codex identity: `neo-gpt`.
