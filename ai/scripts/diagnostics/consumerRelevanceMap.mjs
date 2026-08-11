/**
 * @module ai/scripts/diagnostics/consumerRelevanceMap
 * @summary The editable classification map for the consumer-relevance census — subsystem → bucket.
 *
 * THIS FILE IS THE TAXONOMY, and it is meant to be contested by editing. A stakeholder who reads a
 * classification differently does not argue with the census output; they change a rule here and
 * re-run. Every rule is mechanical (longest path-prefix wins; per-subsystem bucket + temporal tag),
 * so a mapping change is auditable in both directions: the rule that produced a row is printed with it.
 *
 * Buckets (three-way + temporal tag, per the census ticket — classification by what a PR TOUCHES,
 * never by whether it was NEEDED; necessity is counterfactual judgment and permanently out of scope):
 *
 * - `consumer-direct`   — runtime surfaces a deployment consumes. Temporal tag `now` (consumed today)
 *   or `future-direct` (built for consumers whose adoption lies ahead — direct work, honestly tagged
 *   as not-yet-consumed).
 * - `consumer-enabling` — velocity multipliers whose payoff reaches consumers indirectly (CI, lints,
 *   agent substrate, skill machinery, team-facing servers a deployment does not run itself).
 * - `internal-only`     — no consumer path (docs, examples, culture artifacts).
 *
 * The six seed judgments recorded at ticket creation — the premise falsifier the spec reproduces:
 * fleet tooling = direct/future · agent-cloud + docking + MCP runtime + grid/store = direct/now ·
 * team-facing workflow server + dream/nightshift + skill machinery = enabling.
 * @plane in-plane
 */

export const SUBSYSTEMS = {
    'agent-cloud': {
        bucket  : 'consumer-direct',
        label   : 'Agent OS cloud (deployment, compose, transports, orchestrator)',
        temporal: 'now'
    },
    'app-engine': {
        bucket  : 'consumer-direct',
        label   : 'App engine (core, state, data, grid, store, docking, workers, vdom)',
        temporal: 'now'
    },
    'ci-test-infra': {
        bucket: 'consumer-enabling',
        label : 'CI, test harness, build scripts, lint gates'
    },
    'docs-internal': {
        bucket: 'internal-only',
        label : 'Docs, guides, examples, blog'
    },
    'dream-nightshift': {
        bucket: 'consumer-enabling',
        label : 'Dream pipeline, nightshift, RLAIF machinery'
    },
    'fleet-tooling': {
        bucket  : 'consumer-direct',
        label   : 'Fleet-management tooling (AgentOS app, fleet services, seat provisioning)',
        temporal: 'future-direct'
    },
    'mcp-runtime': {
        bucket  : 'consumer-direct',
        label   : 'MCP server runtime (memory-core, knowledge-base, neural-link, github-workflow)',
        temporal: 'now'
    },
    'portal-internal': {
        bucket: 'internal-only',
        label : 'Portal, apps, demos, examples apps'
    },
    'skill-machinery': {
        bucket: 'consumer-enabling',
        label : 'Agent skills, AGENTS substrate, MX-loop workflow machinery'
    },
    'team-servers': {
        bucket: 'consumer-enabling',
        label : 'Team-facing workflow servers a deployment does not run itself (gitlab-workflow, dev-index, code-review)'
    }
};

/**
 * Longest-prefix path rules. A file that matches NO rule lands in `unclassified` with the path
 * attached — an honest row, never a silent omission. `classifyPath` resolves by prefix-length sort,
 * so nesting needs NO ordering discipline: the longest matching prefix wins wherever it sits in
 * this array. Keep the array roughly grouped for the human editor; order carries no semantics.
 * @type {Array<{prefix: String, subsystem: String}>}
 */
export const PATH_RULES = [
    {prefix: '.agent/',                         subsystem: 'skill-machinery'},
    {prefix: '.agents/',                        subsystem: 'skill-machinery'},
    {prefix: '.gemini/',                        subsystem: 'skill-machinery'},
    {prefix: '.gitignore',                      subsystem: 'ci-test-infra'},
    {prefix: '.neo-ai-data/concepts/',          subsystem: 'dream-nightshift'},
    {prefix: 'AGENTS.md',                       subsystem: 'skill-machinery'},
    {prefix: 'AGENTS_STARTUP.md',               subsystem: 'skill-machinery'},
    {prefix: 'README.md',                       subsystem: 'docs-internal'},
    {prefix: 'ROADMAP.md',                      subsystem: 'docs-internal'},
    {prefix: 'package.json',                    subsystem: 'ci-test-infra'},
    {prefix: 'package-lock.json',               subsystem: 'ci-test-infra'},
    {prefix: 'ai/mcp/server/gitlab-workflow/',  subsystem: 'team-servers'},
    {prefix: 'ai/mcp/server/dev-index/',        subsystem: 'team-servers'},
    {prefix: 'ai/mcp/server/code-review/',      subsystem: 'team-servers'},
    {prefix: 'ai/mcp/server/',                  subsystem: 'mcp-runtime'},
    {prefix: 'ai/services/fleet/',              subsystem: 'fleet-tooling'},
    {prefix: 'ai/daemons/services/',            subsystem: 'dream-nightshift'},
    {prefix: 'ai/daemons/',                     subsystem: 'agent-cloud'},
    {prefix: 'ai/deploy/',                      subsystem: 'agent-cloud'},
    {prefix: 'ai/agent/',                       subsystem: 'fleet-tooling'},
    {prefix: 'ai/scripts/',                     subsystem: 'ci-test-infra'},
    {prefix: 'ai/',                             subsystem: 'skill-machinery'},
    {prefix: '.github/',                        subsystem: 'ci-test-infra'},
    {prefix: '.claude/',                        subsystem: 'skill-machinery'},
    {prefix: '.codex/',                         subsystem: 'skill-machinery'},
    {prefix: '.kimi-code/',                     subsystem: 'skill-machinery'},
    {prefix: 'apps/agentos/',                   subsystem: 'fleet-tooling'},
    {prefix: 'apps/',                           subsystem: 'portal-internal'},
    {prefix: 'buildScripts/',                   subsystem: 'ci-test-infra'},
    {prefix: 'docs/',                           subsystem: 'docs-internal'},
    {prefix: 'examples/',                       subsystem: 'docs-internal'},
    {prefix: 'harness/',                        subsystem: 'fleet-tooling'},
    {prefix: 'learn/',                          subsystem: 'docs-internal'},
    {prefix: 'resources/content/',              subsystem: 'docs-internal'},
    {prefix: 'resources/images/',               subsystem: 'docs-internal'},
    {prefix: 'resources/scss/src/apps/agentos/', subsystem: 'fleet-tooling'},
    {prefix: 'resources/scss/',                 subsystem: 'app-engine'},
    {prefix: 'resources/',                      subsystem: 'docs-internal'},
    {prefix: 'src/',                            subsystem: 'app-engine'},
    {prefix: 'test/',                           subsystem: 'ci-test-infra'}
];

/**
 * The six seed judgments from the ticket — the premise falsifier. The spec asserts each of these
 * against SUBSYSTEMS, so a mapping edit that breaks fluent human classification fails loudly.
 * @type {Object<String,{bucket: String, temporal: String}>}
 */
export const SEED_JUDGMENTS = {
    'agent-cloud'     : {bucket: 'consumer-direct',   temporal: 'now'},
    'app-engine'      : {bucket: 'consumer-direct',   temporal: 'now'},
    'dream-nightshift': {bucket: 'consumer-enabling', temporal: null},
    'fleet-tooling'   : {bucket: 'consumer-direct',   temporal: 'future-direct'},
    'mcp-runtime'     : {bucket: 'consumer-direct',   temporal: 'now'},
    'skill-machinery' : {bucket: 'consumer-enabling', temporal: null},
    'team-servers'    : {bucket: 'consumer-enabling', temporal: null}
};

/**
 * Bucket precedence for mixed-file PRs: the more consumer-visible bucket wins a tie, because the
 * visible surface is what the stakeholder is reading for. `internal-only` never outranks.
 * @type {String[]}
 */
export const BUCKET_PRECEDENCE = ['consumer-direct', 'consumer-enabling', 'internal-only'];
