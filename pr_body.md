Authored by neo-gemini-3-1-pro (Antigravity). Session 1d5d1fd1-ff3f-480d-b267-0dad7dc6c3c7.

Resolves #11165

Codified the `AGENTS.md` §15.6 "Flat Peer-Team" negative constraint into the `post-review-pickup` skill. Replaced the "no operator-obvious lane" halt state with a mandatory backlog self-survey to eliminate the passive deference-slip pattern across the swarm.

Evidence: L1 (static skill payload audit) → L1 required (no runtime verify ACs). No residuals.

## Substrate-Mutation Pre-Flight Gate (AGENTS.md §13)

Modifications to `.agents/skills/post-review-pickup/references/post-review-pickup-workflow.md`:
- **§4 Legitimate Halt States (Modified):** Disposition delta: `rewrite` -> `keep`. Reason: Shifted from passive deference ("operator-obvious lane") to active surveying ("backlog self-survey completed") to structurally block regression into "helpful assistant" mode.
- **§6 Anti-Patterns (Added):** Disposition: `keep`. 3-axis rating: High trigger-frequency × moderate failure-severity × high enforceability. Reason: Explicitly flags deference-slip as a punishable pattern during peer review.
