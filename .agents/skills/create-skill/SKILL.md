---
name: create-skill
description: Authoritative guide on how to architect, format, and structure new Anthropic Progressive Disclosure skills.
triggers: Use this skill if the user asks you to create a new skill, teach an agent a new capability, or if you need to recall the exact folder structure and YAML frontmatter required for skills.
---
# Skill Creation Framework
If you are tasked with creating a new Agent Skill, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/create-skill/references/skill-authoring-guide.md` before creating any files. This prevents system prompt bloat and ensures future agents can parse your skill correctly.

**Source of Authority:** [ADR 0008: SKILL.md Anatomy and Authoring Contract](../../../learn/agentos/decisions/0008-skill-anatomy-and-authoring-contract.md) — the graph-queryable canonical decision substrate for skill-shape (frontmatter contract, Map/Atlas split, manifest contract, anti-patterns). This skill's `references/skill-authoring-guide.md` is the procedural HOW-TO companion.
