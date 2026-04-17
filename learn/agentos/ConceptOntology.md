# The Concept Ontology

The Concept Ontology is a version-controlled graph that provides the **semantic stratum**
between source code and learning content. It is the foundation for the Dream Pipeline's
deterministic documentation gap detection.

## The Problem It Solves

The GapInferenceEngine (Phase 4 of the Dream Pipeline) needs to detect which parts of
Neo.mjs lack adequate documentation. The original approach used regex-based token
matching against file paths:

```javascript
// OLD: Fragile regex token matching
const hasGuide = guideFilePaths.some(p => nodeTokens.some(term => regex.test(p)));
```

This fails structurally — `"Reactivity.md"` never token-matches `"Neo.button.Base"`.
The Concept Ontology solves this by introducing **CONCEPT** nodes as first-class entities
that bridge the gap between implementation files and learning guides:

```javascript
// NEW: Graph traversal
const explanations = conceptService.getEdges(conceptId, 'EXPLAINED_BY');
const hasGuide = explanations.length > 0;
```

A concept has a `GUIDE_GAP` if it has zero `EXPLAINED_BY` edges. This is **deterministic**,
**semantically correct**, and requires no embedding comparison.

## What Is a Concept?

A concept is an **abstract architectural idea** that:

1. Has a name and a hierarchical position in the knowledge tree
2. Can be *implemented by* one or more source files
3. Can be *explained by* one or more learning guides
4. Has a tier reflecting its importance to the platform's identity
5. Is connected to other concepts via typed relationships

### Concepts vs. Classes

| | Class | Concept |
|---|---|---|
| **Identity** | `Neo.core.Base` | "Instance Lifecycle" |
| **Nature** | Implementation artifact | Architectural idea |
| **Guides map to** | ❌ Not directly (many-to-many) | ✅ Directly (1-to-many) |
| **Source files map to** | ✅ 1-to-1 | ✅ 1-to-many |

**Every class doesn't deserve a guide, but every concept deserves at least one.** The
concept layer is the intermediary that makes gap detection semantically meaningful.

### The Teaching Test

A concept is included in the ontology only if it passes **all three** criteria:

1. **A developer needs to understand it** to use Neo.mjs productively
2. **It cannot be learned** by simply reading one API doc page
3. **It answers "how" or "why" questions**, not just "what" questions

| ✅ Passes | ❌ Fails |
|----------|---------|
| "Two-Tier Reactivity" (architectural model) | `Neo.util.Array` (utility, API-doc-sufficient) |
| "Off-Main-Thread Execution" (mental model shift) | "Portal App About Us View" (app-specific) |
| "Config Descriptors & Merge Strategies" (complex system) | `afterSetWidth` (lifecycle hook instance) |

## Storage Format

The concept graph is stored as JSONL files at `.neo-ai-data/concepts/`:

```
.neo-ai-data/concepts/
├── nodes.jsonl     # One concept node per line
└── edges.jsonl     # One relationship edge per line
```

### Why JSONL, Not JSON or SQLite

- **Git-friendly**: Each line is an independent record. Adding a concept = adding a line.
  No structural merge conflicts.
- **PR-reviewable**: `git diff` shows exactly which concepts were added/modified/removed.
- **Streaming**: Can be processed line-by-line without loading the entire graph into memory.
- **Decoupled**: Independent of the Native Edge Graph (SQLite), which is in flux due to the
  Multi-Tenant Memory Core migration.

## Node Schema

Each line in `nodes.jsonl` is a JSON object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Kebab-case unique identifier (e.g., `"multi-threading"`) |
| `name` | string | ✅ | Human-readable display name |
| `tier` | number | ✅ | Importance tier (see Tiering System below) |
| `description` | string | ✅ | One-paragraph explanation of the concept |
| `uniqueToNeo` | boolean | ✅ | `true` if architecturally unique to Neo.mjs |
| `tags` | string[] | ✅ | Categorization tags for search and filtering |

```jsonl
{"id":"push-reactivity","name":"Push-Based Reactivity (Config System)","tier":1,"description":"Reactive properties defined with a trailing underscore trigger explicit lifecycle hooks when changed.","uniqueToNeo":true,"tags":["reactivity","config","lifecycle"]}
```

## Edge Schema

Each line in `edges.jsonl` is a JSON object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | ✅ | Source node ID (concept or file reference) |
| `target` | string | ✅ | Target node ID (concept or file reference) |
| `type` | string | ✅ | Relationship type (see Edge Types below) |

### Edge Types

| Type | Direction | Meaning |
|------|-----------|---------|
| `PARENT_CONCEPT` | parent → child | Hierarchical grouping |
| `IMPLEMENTED_BY` | concept → file | Source file that implements the concept |
| `EXPLAINED_BY` | concept → file | Guide/doc that explains the concept |
| `EXEMPLIFIED_BY` | concept → file | Example that demonstrates the concept |
| `REQUIRES` | concept → concept | Prerequisite (must understand A before B) |

### File Reference Format

File targets use the `file:` prefix with a repository-relative path:

```jsonl
{"source":"push-reactivity","target":"file:src/Neo.mjs","type":"IMPLEMENTED_BY"}
{"source":"push-reactivity","target":"file:learn/guides/coreengine/ConfigSystem.md","type":"EXPLAINED_BY"}
```

## Tiering System

| Tier | Weight | Description | Gap Severity |
|------|--------|-------------|-------------|
| 0 | — | System anchor (Neo.mjs itself) | N/A |
| 1 | ≥ 0.9 | Platform identity concepts | **CRITICAL** if undocumented |
| 2 | 0.5–0.8 | Major subsystem concepts | **HIGH** if undocumented |
| 3 | 0.1–0.4 | Implementation-level concepts | **MEDIUM** if undocumented |

## The Concept Hierarchy (Abbreviated)

```
Neo.mjs (system anchor)
├── Multi-Threading Architecture [tier:1] ✅
│   ├── Off-Main-Thread Execution [tier:1] ✅
│   ├── Worker Isolation [tier:1] ✅
│   ├── SharedWorker Mode [tier:1] ✅
│   └── Cross-Thread Communication [tier:1] ✅
├── JSON-First VDOM Protocol [tier:1] ✅
│   ├── VDOM as IPC Layer [tier:1]
│   ├── Delta Update Pipeline [tier:1] ✅
│   ├── Asymmetric VDOM Updates [tier:1] ✅
│   └── VDOM Teleportation [tier:2]
├── Two-Tier Reactivity [tier:1] ✅
│   ├── Push-Based Reactivity [tier:1] ✅
│   │   ├── Reactive Configs [tier:2] ✅
│   │   ├── Lifecycle Hooks [tier:2] ✅
│   │   └── Config Descriptors [tier:2] ✅
│   └── Pull-Based Reactivity [tier:1] ✅
├── Class System & Compilation [tier:1] ✅
│   ├── Neo.setupClass() [tier:1] ✅
│   ├── Mixin Architecture [tier:2]
│   └── Instance Lifecycle [tier:1] ✅
├── Multi-Window Applications [tier:1] ✅
├── Object Permanence [tier:1] ✅
├── AI-Native Architecture (Agent OS) [tier:1] ✅
│   ├── Neural Link [tier:2] ✅
│   ├── Knowledge Base [tier:2] ✅
│   ├── Memory Core [tier:2] ✅
│   ├── Dream Pipeline [tier:2] ✅
│   ├── Swarm Intelligence [tier:2] ✅
│   └── Progressive Disclosure Skills [tier:2] ✅
├── Component Architecture [tier:1] ✅
│   ├── Layouts [tier:2] ✅
│   ├── Theming Engine [tier:2] ✅
│   └── Grid Component [tier:2] ✅
├── Data Layer [tier:1] ✅
│   ├── Records & RecordFactory [tier:2] ✅
│   ├── Stores & Collections [tier:2] ✅
│   ├── State Provider [tier:2] ✅
│   └── Data Pipelines [tier:2] ✅
└── Forms Engine [tier:1] ✅
```

✅ = has at least one EXPLAINED_BY edge

## Contributing a Concept

1. Add a single line to `nodes.jsonl` following the node schema
2. Add `PARENT_CONCEPT` edge(s) to `edges.jsonl` to place it in the hierarchy
3. Add `EXPLAINED_BY` edges for any existing guides that cover the concept
4. Add `IMPLEMENTED_BY` edges for source files that implement it
5. Verify the concept passes the Teaching Test

### JSONL Format Rules

- **One JSON object per line** — no multi-line JSON
- **No trailing commas** — strict JSON per line
- **Git-friendly** — each line is an independent record, minimizing merge conflicts
- **Append-only preferred** — add new lines rather than reordering existing ones

## Integration Architecture

```
┌─────────────────────────────────────────────┐
│              Concept Ontology               │
│         (.neo-ai-data/concepts/)            │
│                                             │
│   CONCEPT ──EXPLAINED_BY──> learn/guides/   │
│   CONCEPT ──IMPLEMENTED_BY──> src/**/*.mjs  │
│   CONCEPT ──PARENT_CONCEPT──> CONCEPT       │
└────────────────────┬────────────────────────┘
                     │
          Loaded by ConceptService
          (ai/services.mjs SDK)
                     │
         ┌───────────▼───────────┐
         │   GapInferenceEngine  │
         │  (Graph Traversal)    │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   Golden Path / REM   │
         │  (DreamService)       │
         └───────────────────────┘
```

## Related

- [The Dream Pipeline & Golden Path](../agentos/DreamPipeline.md)
- [The Knowledge Base Server](../agentos/KnowledgeBase.md)
- [The Memory Core Server](../agentos/MemoryCore.md)
