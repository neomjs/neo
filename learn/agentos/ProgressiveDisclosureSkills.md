# Progressive Disclosure Skills

The Neo Agent OS utilizes a **Progressive Disclosure** pattern for agent skills. Instead of
loading every possible instruction set into the master system prompt (which consumes 
massive amounts of context window tokens and dilutes agent focus), skills are 
lazy-loaded into the context window exactly when they are needed.

For the overall platform topology, see [Architecture Overview](../benefits/ArchitectureOverview.md).
For the agent delegation model, see [Swarm Intelligence](./SwarmIntelligence.md).

## Token Economics

The primary driver for the Progressive Disclosure pattern is **System Prompt Budgeting**.

LLM reasoning degrades as the context window fills up (the "lost in the middle"
phenomenon). If an agent is tasked with a simple CSS fix, it does not need the 
4,000-token `pull-request` execution guide or the `neural-link` tactical debugging 
sequences in its prompt.

By deferring specialized procedural knowledge into standalone Markdown files 
(`.agent/skills/*/SKILL.md`), we keep the root `AGENTS.md` system prompt lean.
The root prompt outlines the *rules of engagement*, while the skills provide the 
*tactical implementation manuals*.

## The Progressive Disclosure Pattern

A skill in the Neo Agent OS is a directory containing instructional context. 
The contract for a skill is simple:

1. **`SKILL.md` (Mandatory):** The entry point. It must contain YAML frontmatter
   with a `name`, `description`, and `triggers` (to explain when an agent should invoke it),
   followed by standard Markdown instructions.
2. **`references/` (Optional):** Deeper architectural documentation or procedural 
   steps linked from the main `SKILL.md`.
3. **`assets/` (Optional):** Templates, Markdown snippets, or structural files the 
   skill relies on.

When an agent encounters a trigger scenario (e.g., "Open a Pull Request"), it uses 
the `view_file` tool to read the `SKILL.md`, absorbs the temporary context, and 
executes the procedural knowledge.

## How Skills Compose with AGENTS.md

The root system prompt (`AGENTS.md`) and the skills layer are symbiotic:
- **`AGENTS.md`** contains the *Mandates*. It tells the agent *when* a behavior is 
  required (e.g., "You MUST use the `pull-request` skill to open a PR. You are forbidden 
  from running `gh pr create` raw.").
- **The Skill** contains the *How*. It provides the precise Git branch naming 
  conventions, the "Stepping Back" reflection protocol, and the exact CLI arguments.

## The Lifecycle Triad

Three primary skills form the backbone of the Agent OS issue lifecycle. They act as 
strict architectural gates that prevent context-blind execution and topological regression.

### 1. `ticket-intake` (The Pre-Execution Reflection Gate)
Invoked immediately upon picking up a ticket, before any code is written.
- **Validation Sweep:** Forces the agent to ensure the ticket has enough architectural context to be actionable.
- **ROI/Negative ROI Calculation:** An agent must consider if solving the ticket introduces tech debt or violates framework philosophy.
- **Rejection Protocol:** If a ticket is fatally flawed, the agent applies a `status: needs-re-triage` label, suspending it gracefully rather than hallucinating bad code.

### 2. `pull-request` (The Post-Implementation Gate)
Invoked when terminating a task.
- **"Stepping Back" Reflection:** Forces the agent to transition from tactical coding to architectural reflection, identifying missing JSDoc or unit tests before committing.
- **Branch Mandate:** Enforces strict naming conventions.
- **State Handoff:** Defines the exact sequence to open the PR and signal completion to the Orchestrator.

### 3. `pr-review` (The Quality Gate)
Invoked when evaluating a PR (either peer-reviewing another agent or guiding a human).
- **Evaluation Metrics:** Quantifies quality across 7 dimensions (e.g., `[ARCH_ALIGNMENT]`, `[EXECUTION_QUALITY]`).
- **Graph Ingestion Tags:** Standardizes feedback using markers like `[KB_GAP]` or `[RETROSPECTIVE]` so the Dream Pipeline can extract lessons learned into the Native Edge Graph.
- **LGTM/Required Actions:** Ensures every review resolves in a clear state.

## Tactical & Creative Skills

Beyond lifecycle governance, specialized contexts exist for live action:

- **`neural-link`:** A tactical manual mapping how to sequence the Neural Link MCP 
  tools (e.g., retrieving VDOM trees, finding bounding boxes, simulating DOM clicks) to debug a live browser instance.
- **`unit-test`:** Patterns for authoring strict Playwright unit tests within the Neo.mjs single-thread architecture.
- **`ideation-sandbox`:** A creative workflow ensuring brainstorming occurs politely in GitHub Discussions rather than polluting the active Issue queue.

## The Meta-Skill: Adding New Skills

The ecosystem is self-extending via the **`create-skill`** meta-skill.
When the swarm identifies a repeating failure mode or a complex recurring task, 
an agent can use `create-skill` to bootstrap a new progressive disclosure package, 
ensuring the YAML frontmatter and folder consistency are perfectly formed.

## Skill Inventory

| Skill | Type | Purpose |
|---|---|---|
| `ticket-intake` | Lifecycle | Pre-execution validation gate |
| `pull-request` | Lifecycle | Post-implementation reflection + PR creation |
| `pr-review` | Lifecycle | Structured quality evaluation & graph ingestion |
| `neural-link` | Tactical | Live application inspection sequences |
| `unit-test` | Tactical | Playwright test authoring patterns |
| `ideation-sandbox` | Creative | GitHub Discussion brainstorming |
| `create-skill` | Meta | Skill authoring bootstrap guide |

## Related Guides

- [Swarm Intelligence](./SwarmIntelligence.md) — Autonomous sub-agent delegation
- [Strategic Workflows](./StrategicWorkflows.md) — How multiple skills chain together in practice
- [The Dream Pipeline & Golden Path](./DreamPipeline.md) — How issue lifecycle outcomes are forecasted
