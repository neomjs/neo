---
name: neo-identity-update
description: "Repeatable protocol for updating Neo's identity (what Neo IS) coherently across ALL surfaces that encode it — README, VISION, learn/benefits, package.json, GitHub repo metadata, portal app, and the build-generated SEO files. Treats FACTS (version, MCP-server count, Node req, dates) as single-source-derive and FRAMING (taglines, positioning) as audience-segmented against a canonical apex. Triggers: Use when changing Neo's tagline / positioning / description / keywords / pillar story; when a maintainer says 'update the identity / README / branding / how we describe Neo'; when a shipped capability outgrows the current framing; or when a fact (version, server count, requirement) drifts across surfaces. Foundation: ADR 0018."
---

# Neo Identity Update Skill

Neo's identity is distributed across ~30+ surfaces; editing one (e.g. README) leaves machine-facing JSON, build-generated SEO files, and external platform settings drifting silently. Before changing ANY identity surface (tagline, description, keywords, pillar story, or a drifted fact like version / MCP-server-count / Node-req), you MUST read `.agents/skills/neo-identity-update/references/update-protocol.md` and follow it — it routes to the surface inventory, facts ledger, and framing-governance payloads.

**Non-negotiables:** FACTS converge to one source (derive/coherence-check the rest); FRAMING stays audience-segmented against the README apex (escalate contradictions, never find-replace); never edit build-generated output (edit the generator `buildScripts/docs/seo/generate.mjs`); every identity-surface PR needs a cross-family review; never name a client/partner/customer. Foundation: [ADR 0018](../../../learn/agentos/decisions/0018-neo-identity-source-of-truth-model.md).
