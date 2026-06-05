# Provision Your Own Agent Team

Neo's Agent OS can run as your own local maintainer team inside a fork or a generated
`npx neo-app` workspace. This guide describes the local provisioning shape: stable
agent identities, identity-bound MCP harnesses, seeded Memory Core graph nodes, and
data isolation that keeps your team separate from the upstream Neo swarm.

The examples use `@acme-claude`, `@acme-gpt`, and `@acme-gemini`. Replace them with
handles that belong to your deployment.

## Local Boundary

A local agent team is not the canonical Neo maintainer swarm. Treat it as a separate
deployment with its own:

- GitHub accounts or stable local handles for each agent.
- `AgentIdentity` graph nodes in your Memory Core database.
- Harness configuration that pins each process to exactly one identity.
- Knowledge Base and Memory Core data roots, unless you intentionally connect to a
  shared team service.

Do not reuse upstream Neo identities such as `@neo-opus-ada`, `@neo-gpt`, or
`@neo-gemini-pro` for your own agents. Those handles carry upstream provenance
and review semantics.

## Identity Layers

Keep four identity layers separate:

| Layer | Own-team question | Neo substrate |
|---|---|---|
| Operational identity | Which account or local handle is making this request? | `NEO_AGENT_IDENTITY`, OIDC subject, or proxy header |
| Graph identity | Which node receives provenance edges? | `AgentIdentity` node in `ai/graph/identityRoots.mjs` |
| Model lineage | Which model class, version, and capability profile is behind the handle? | `modelFamily`, capability fields, and ModelStats-style metadata |
| Social label | What should humans call this teammate? | `displayName`, docs, PR bodies, and A2A messages |

The handle should be stable. Put model-version churn in lineage metadata, not in the
handle, so historical memory remains queryable after provider upgrades.

## Choose Handles

Good handles are team-scoped and version-free:

```text
@acme-claude
@acme-gpt
@acme-gemini
```

Avoid handles like `@acme-claude-4-7` unless your deployment intentionally creates a
new identity every time the model version changes. That pattern fragments long-term
memory and makes review provenance harder to audit.

## Define Identity Roots

The identity root source of truth is `ai/graph/identityRoots.mjs`. Add one
`AgentIdentity` entry per teammate. Keep account-level fields stable and put model
details in metadata fields.

```js
{
    id: '@acme-claude',
    type: 'AgentIdentity',
    name: 'Acme Claude',
    description: 'Claude-family maintainer identity for the Acme local Agent OS.',
    properties: {
        githubLogin: '@acme-claude',
        displayName: 'Acme Claude',
        modelFamily: 'claude',
        accountType: 'agent',
        trustTier  : TRUST_TIERS.PEER_TRUSTED,
        hosting    : 'cloud',
        family     : 'claude',
        tier       : 'frontier',
        participationStatus: 'active',
        statusReason       : null,
        authority          : null,
        since              : null,
        reactivationTrigger: null,
        createdAt          : new Date().toISOString()
    }
}
```

Use the upstream entries as shape examples, not as identities to copy. Your `trustTier`
choice is a deployment policy: local teammates can be trusted inside your team without
becoming upstream Neo maintainers.

## Seed The Graph

After editing `ai/graph/identityRoots.mjs`, seed or refresh the Memory Core graph:

```bash
node ai/scripts/setup/seedAgentIdentities.mjs
```

The script is idempotent. Existing root nodes keep their creation provenance while new
nodes are inserted. A fresh Memory Core may also self-seed on boot, but running the
script is the explicit recovery and verification path.

## Bind Harnesses

Each harness process should pin its own identity with `NEO_AGENT_IDENTITY` in the MCP
server environment block. Use the bare login without `@`; Memory Core normalizes and
binds it to the `@`-prefixed graph node.

```json
{
    "mcpServers": {
        "neo.mjs-memory-core": {
            "command": "node",
            "args": ["ai/mcp/server/memory-core/mcp-server.mjs"],
            "env": {
                "NEO_AGENT_IDENTITY": "acme-claude"
            }
        }
    }
}
```

For stdio clients, `NEO_AGENT_IDENTITY` is the authoritative local identity pin. The
GitHub CLI fallback is useful for humans, but a team agent should not depend on an
ambient shell login.

## Provision Git Commit Identity

`NEO_AGENT_IDENTITY` binds a harness to its Memory Core node, and a per-clone `GH_TOKEN`
routes GitHub API/CLI calls to the right account — but **neither sets git's commit
author**. That is a separate surface. If a clone has no commit identity, `git commit`
falls through to the global `~/.gitconfig`, so commits land authored as the human
operator instead of the agent.

This is easy to miss because **squash-merge can mask it**: when the repo's *squash merge
commit author* setting rewrites the squashed commit's author to the PR account, merged
history looks correct while local history, `Co-Authored-By` trailers, and any
rebase/merge-commit stay mis-attributed. Treat commit identity as load-bearing, not
cosmetic.

Derive the identity from the same source of truth as the rest of the setup — the
`AgentIdentity` `displayName` (social label) and the team email convention (here
`<handle>@acme.example`). **Do not hardcode handles that may change**; resolve them so a
later rename does not strand stale attribution.

### Primary: inject commit identity in the harness env

`GIT_AUTHOR_*` and `GIT_COMMITTER_*` environment variables override **both** repo-local
and global config — but author and committer are **separate surfaces**, each with its own
precedence:

- **Author:** `--author` > `GIT_AUTHOR_*` env > `git config --local` > global.
- **Committer:** `GIT_COMMITTER_*` env > `git config --local` > global. `--author` and
  `GIT_AUTHOR_*` do *not* affect the committer.

Set **all four** (`GIT_AUTHOR_NAME`/`EMAIL` + `GIT_COMMITTER_NAME`/`EMAIL`) once per agent,
beside `NEO_AGENT_IDENTITY`, and every repo the process touches is attributed correctly on
both surfaces from a single shared clone:

```bash
export GIT_AUTHOR_NAME="Acme Claude"
export GIT_AUTHOR_EMAIL="acme-claude@acme.example"
export GIT_COMMITTER_NAME="Acme Claude"
export GIT_COMMITTER_EMAIL="acme-claude@acme.example"
```

Env injection is the robust shape because it cannot be forgotten per-clone — the
originating failure was an unconfigured clone falling through to the operator's global
identity. Use the agent's verified team email so commits link to its account (the push
token needs only write access; attribution follows the author, not the pusher, so one
shared write token can push every agent's commits each correctly credited). Never use a
`<noreply@*>` author/committer email.

### Fallback: per-clone repo-local config

For contexts without harness env injection — a manual shell, a one-off side-repo — set
repo-local identity per clone:

```bash
git config user.name  "Acme Claude"          # AgentIdentity displayName
git config user.email "acme-claude@acme.example"
```

Repo-local config is the fallback, not the primary, precisely because it must be repeated
for every clone and is the step that gets skipped.

### Verify (fail loud)

Before the first commit from a new clone or harness, confirm the effective author and
committer:

```bash
git var GIT_AUTHOR_IDENT
git var GIT_COMMITTER_IDENT
# → Acme Claude <acme-claude@acme.example> 1700000000 +0000
```

If this resolves to the operator's global identity (a personal name/email), **stop and
fix it before committing** — otherwise the agent silently commits as the operator.

## Isolate Memory Correctly

Local provisioning has three memory surfaces:

| Surface | Isolation lever | Shared by default? |
|---|---|---|
| Claude Code file-memory | Distinct repo clone or worktree cwd per teammate | No, if each teammate has a distinct cwd |
| Claude app sessions and transcripts | Distinct `--user-data-dir` when launching separate app instances | No, if each instance has its own user-data-dir |
| Memory Core MCP | Deployment-selected Memory Core graph and Chroma data | Yes, if teammates point at the same Memory Core |

The footgun is assuming `--user-data-dir` isolates everything. It does not redirect
Claude Code file-memory; file-memory is keyed by the project cwd. If two Claude
instances run from the same repo cwd, they can share the same file-memory folder even
when their Electron app data is separate.

The robust local setup is:

1. Give each teammate its own repo clone or worktree cwd.
2. Give each GUI app instance its own `--user-data-dir` when two instances of the same
   app need to run side by side.
3. Point all teammates at the same Memory Core only when you want shared team memory.

Memory Core's shared layer is identity-tagged by design. Separate identities preserve
provenance while still letting the team build common graph context.

## Isolate Data Roots

For a completely separate local team, do not point your harnesses at upstream Neo's
local databases. Use your own Memory Core graph path, Chroma service, and collection
names through the normal AiConfig env leaves or operator overlay.

Important rules:

- Read resolved AiConfig values at the use site.
- Override env-bound leaves or local overlay deltas; do not clone and maintain config
  templates by hand.
- Avoid source-level overlay merging. AiConfig is a Provider tree; inheritance and
  deep merge are the substrate.
- Use `NEO_MEMORY_DB_PATH` for the production Memory Core graph path when you need a
  deployment-specific SQLite file.

If your Knowledge Base and Memory Core should be private to your local team, keep their
Chroma data and graph database under that team's workspace or service account. If they
should be shared across teammates, document that as a team deployment decision rather
than an accidental consequence of reused defaults.

## Verify A Teammate

Start one harness and call Memory Core `healthcheck`. The identity block should show
the expected identity source and a bound graph node:

```json
{
    "identity": {
        "source": "env-var",
        "bound": true,
        "nodeId": "@acme-claude"
    }
}
```

If `bound` is false, verify in order:

1. `NEO_AGENT_IDENTITY` is present in the MCP server env block, not only in a shell.
2. The `@<login>` node exists in `ai/graph/identityRoots.mjs`.
3. `node ai/scripts/setup/seedAgentIdentities.mjs` has run against the active Memory
   Core graph path.
4. The harness was restarted after seeding.

## Bring Up The Team

Provision teammates incrementally:

1. Add one identity root.
2. Seed the graph.
3. Bind one harness with `NEO_AGENT_IDENTITY`.
4. Set the harness git commit identity and confirm it with `git var GIT_AUTHOR_IDENT`.
5. Verify `healthcheck.identity.bound`.
6. Send an A2A message to the teammate and confirm it lands in the correct inbox.
7. Repeat for the next teammate.

This sequence keeps identity, graph binding, and mailbox reachability falsifiable at
each step.

## Rename Policy

Renaming an agent is not a display-text edit. A real rename may touch:

- The `AgentIdentity` node id.
- Historical graph edges and message routing.
- Raw memories and session summaries.
- Harness env config.
- Documentation and CI allowlists.

Prefer stable handles. If a rename is required, treat it as a migration with a ticket,
contract ledger, source and destination identities, and post-migration verification.

## Local vs Cloud

Local teams can use stdio identity binding and local database paths. Cloud or
multi-tenant teams should use the shared-deployment path: OIDC or trusted proxy
identity, canonical public URLs, explicit Chroma topology, and proxy trust-boundary
verification.

Do not mix the two mentally. Local stdio identity is a trusted-process shortcut; cloud
identity is an authenticated request contract.

## Source Anchors

- `ai/graph/identityRoots.mjs` defines the root identities consumed by boot-time
  self-seeding and the manual seed script.
- `ai/scripts/setup/seedAgentIdentities.mjs` inserts or refreshes those root identities
  in the Native Edge Graph.
- `learn/agentos/tooling/MemoryCoreMcpAuth.md` explains `NEO_AGENT_IDENTITY`, graph-node
  binding, and the anti-spoof invariant.
- `learn/agentos/SharedDeployment.md` explains shared Knowledge Base and Memory Core
  topology.
- `learn/agentos/AiConfigModel.md` explains why config overlays are inherited data
  deltas, not source files to clone or merge.
- `learn/tree.json` is consumed by the Portal Learn view and the Knowledge Base learning
  source, so public guides must be registered there.
