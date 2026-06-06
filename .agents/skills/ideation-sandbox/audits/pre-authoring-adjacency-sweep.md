# Pre-Authoring Adjacency Sweep

Before drafting a Discussion body, architectural sketch, or multi-idea proposal,
verify no equivalent ideation or ticket already owns the concept. This mirrors
`ticket-create` Gate 0 for the ideation surface: re-deriving an existing Open
Question or adjacent Epic is a substrate failure, not a fresh idea.

## Sweep Order

- **Live sweep:** check current open issues and, when available, open/recent
  Discussions for the proposal's core nouns, existing Epic names, and likely
  aliases.
- **Semantic sweep:** use `ask_knowledge_base(query='<proposal concept>',
  type='all')` when the Knowledge Base is available. Do not invent unsupported
  filters; if KB is unavailable, record that and continue with live/local
  evidence.
- **Local exact sweep:** search `resources/content/discussions/` and
  `resources/content/issues/` for exact keywords and issue/discussion anchors.
- **Memory sweep:** use `query_raw_memories` when the concept plausibly appeared
  in your own or team sessions; self-remembering is the failure mode this gate
  exists to counter.

## Exit Criteria

If equivalent ideation exists, do not file a duplicate. Comment on the existing
Discussion, extend its body via the `#10119` annotation pattern, or reshape the
new proposal to the residual gap only.

## Canonical Trap

The 2026-04-24 Agent-Brain proposal duplicated substantial in-flight scope
(#10030 Concept Ontology and #10137 Open Questions) despite the author having
recently touched that territory. Gate 0 exists so that adjacency is checked
before the sketch hardens.
