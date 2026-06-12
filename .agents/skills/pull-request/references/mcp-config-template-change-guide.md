# MCP Config Template Change Guide

Use this guide only when a PR changes `ai/mcp/server/<name>/config.template.mjs`.

## Scope

Four MCP servers have committed template files paired with gitignored local config files:

- `ai/mcp/server/github-workflow/config.template.mjs`
- `ai/mcp/server/knowledge-base/config.template.mjs`
- `ai/mcp/server/memory-core/config.template.mjs`
- `ai/mcp/server/neural-link/config.template.mjs`

`ai/mcp/server/file-system` is out of scope. It has no local `config.mjs` pair.

## Why This Gate Exists

The core swarm runs from three Neo clones: Codex/GPT, Claude, and Gemini. Template changes land through git, but each clone's live `config.mjs` is gitignored and can drift after merge. That drift can make one agent test against fresh config keys while another keeps running stale local config.

The invariant is not byte-identical local files. Local values can differ by operator. The invariant is that every active clone understands the changed config shape, changed keys, and required local follow-up.

## Author Checklist

When authoring a PR that changes a scoped `config.template.mjs` file:

- List the changed config keys in the PR body.
- State whether matching local `config.mjs` files need manual shape/key updates after merge.
- State whether harness restart is required, recommended, or unnecessary.
- Send normal-priority A2A peer notifications if the change affects live MCP behavior in other clones.
- Do not commit any gitignored `config.mjs` file.

## Reviewer Checklist

When reviewing a PR that changes a scoped `config.template.mjs` file:

- Verify the PR body lists changed config keys.
- Verify local `config.mjs` follow-up is explicit when required.
- Verify peer notification is planned or already sent for live-behavior changes.
- Check shape/key sync expectations, not byte-identical local values.
- Flag missing clone-sync guidance before approval.
