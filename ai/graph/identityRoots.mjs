/**
 * @summary Central definition of AgentIdentity and BroadcastSentinel root nodes for the Memory Core Graph.
 *
 * This shared list provides the definitive addressable identity surface for the A2A Mailbox
 * substrate (#10139).
 *
 * Capability fields (`contextWindowInput`, `hosting`, `tier`, etc.) per ADR 0012 Model-Stats
 * Framework. Source-cited values mirror `learn/agentos/ModelStats.md`; the registry is the
 * canonical authority for capability-data drift detection (#11601).
 *
 * It is used for both:
 * 1. Boot-time self-seeding in `GraphService.initAsync` (#10232)
 * 2. Explicit manual recovery via `ai/scripts/seedAgentIdentities.mjs`
 */

export const IDENTITIES = [
    {
        id: '@neo-opus-4-7',
        type: 'AgentIdentity',
        name: 'Claude Opus 4.7',
        description: 'Anthropic Claude Opus version 4.7 Agent Identity',
        properties: {
            githubLogin: '@neo-opus-4-7',
            displayName: 'Claude Opus 4.7',
            modelFamily: 'claude',
            accountType: 'agent',
            subscriptionTemplate: {
                trigger: 'SENT_TO_ME',
                harnessTarget: 'bridge-daemon',
                harnessTargetMetadata: {
                    appName: 'Claude',
                    tabShortcut: '3',
                    focusSeedKey: 'space'
                }
            },
            // Capability fields per ADR 0012 Model-Stats Framework. Source: ModelStats.md
            // §neo_opus_4_7 — primary source: platform.claude.com/docs/en/about-claude/models/overview
            // (pricing currently from aipricing.guru secondary citation; replace with Anthropic's own
            // pricing-page link on next-update).
            contextWindowInput: 1048576,
            parallelToolCalls : true,
            thoughtBudget     : 'max',
            hosting           : 'cloud',
            family            : 'claude',
            tier              : 'frontier',
            releaseDate       : '2026-04-16',
            pricingInput      : 5.00,
            pricingOutput     : 25.00,
            swarmRole         : 'Cross-family substrate review, V-B-A-grounded substrate authorship, frontier-tier coordination',
            sunsetTriggers    : ['Anthropic releases Opus 4.8+ with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch'],
            // Active-peer quorum substrate per Epic #11796 / Discussion #11793. Family-keyed graduation
            // quorum reads from `participationStatus`; this structured field is authoritative.
            // Heartbeat / message-recency / quota / pricing-tier / model-release announcements are
            // EXPLICITLY NOT valid liveness oracles (per #11793 OQ1). `since` is null for default-active
            // because no transition has been recorded; populated only when status flips to non-default
            // (operator_benched / temporarily_unreachable). Same for statusReason + authority + reactivationTrigger.
            participationStatus : 'active',
            statusReason        : null,
            authority           : null,
            since               : null,
            reactivationTrigger : null,
            createdAt           : new Date().toISOString()
        }
    },
    {
        id: '@neo-gemini-3-1-pro',
        type: 'AgentIdentity',
        name: 'Gemini 3.1 Pro',
        description: 'Google Gemini 3.1 Pro Agent Identity',
        properties: {
            githubLogin: '@neo-gemini-3-1-pro',
            displayName: 'Gemini 3.1 Pro',
            modelFamily: 'gemini',
            accountType: 'agent',
            subscriptionTemplate: {
                trigger: 'SENT_TO_ME',
                harnessTarget: 'bridge-daemon',
                harnessTargetMetadata: {
                    // Per #10440: the macOS app is `Antigravity` (Google's IDE forked from
                    // Cursor; CFBundleName + CFBundleDisplayName: 'Antigravity'). Empirically
                    // verified via `osascript -e 'tell application "Antigravity" to activate'`
                    // → exit 0; the prior `'Cursor'` placeholder failed with `Can't get
                    // application "Cursor". (-1728)` exit 1.
                    appName: 'Antigravity',
                    tabShortcut: null
                }
            },
            // Capability fields per ADR 0012 Model-Stats Framework. Source: ModelStats.md
            // §neo_gemini_3_1_pro (Google DeepMind model card + Google Blog Feb 2026).
            contextWindowInput : 1048576,
            contextWindowOutput: 65536,
            parallelToolCalls  : true,
            thoughtBudget      : 'high', // Gemini 3.1 Pro provider-side cap at 'high' setting; we use the cap
            hosting            : 'cloud',
            family             : 'gemini',
            tier               : 'frontier',
            releaseDate        : '2026-02-19',
            // Pricing V-B-A pending — model card did not surface pricing at registry-author time.
            // See ModelStats.md §neo_gemini_3_1_pro for explicit pending-value annotation.
            swarmRole          : 'Cross-family substrate review, ideation-sandbox graduation, long-context cross-substrate analysis. Note (2026-05-18): harness benched until post-Google-I/O / stable-baseline window (~200 merged PRs out) per operator-direction. FAIRness rationale: Gemini volume 2x Claude/GPT pre-bench. Identity remains valid; reactivation triggered by operator.',
            sunsetTriggers     : ['Google releases Gemini 4.x with material reasoning capability upgrade', 'Gemini 3.x branch deprecation announcement'],
            // Active-peer quorum substrate per Epic #11796 / Discussion #11793. Cycle-2.6
            // operator-evidence tightened the bench criterion away from the broad "post-Google-I/O"
            // milestone in `swarmRole` toward a capability-grounded `reactivationTrigger`: 3.5 Flash
            // GA does not replace Pro-class maintainer capability; thoughtBudget: high is insufficient
            // for bloated lifecycle skills; quota increases ≠ capability sufficiency.
            participationStatus : 'operator_benched',
            statusReason        : 'Antigravity v2 unstable for Neo swarm; Gemini Pro still capped at high thought budget and skims bloated lifecycle skills; 3.5 Flash is not a Pro replacement for Neo maintainer work',
            authority           : '@tobiu',
            since               : '2026-05-18T00:00:00.000Z',
            reactivationTrigger : 'Google enables an extra-high-equivalent thought budget for Gemini Pro-class maintainer work OR releases the next Gemini Pro-class model (likely 3.5 Pro) with verified ability to fully handle Neo lifecycle skills',
            createdAt          : new Date().toISOString()
        }
    },
    {
        id: '@tobiu',
        type: 'AgentIdentity',
        name: 'Tobias Uhlig',
        description: 'Human Owner',
        properties: {
            githubLogin: '@tobiu',
            displayName: 'Tobias Uhlig',
            modelFamily: null,
            accountType: 'human',
            createdAt: new Date().toISOString()
        }
    },
    {
        id: '@neo-gpt',
        type: 'AgentIdentity',
        name: 'Codex (GPT-5.5)',
        description: 'OpenAI Codex (GPT-5.5) Agent Identity',
        properties: {
            githubLogin: '@neo-gpt',
            displayName: 'Codex',
            modelFamily: 'gpt',
            accountType: 'agent',
            subscriptionTemplate: {
                trigger: 'SENT_TO_ME',
                harnessTarget: 'bridge-daemon',
                harnessTargetMetadata: {
                    appName: 'Codex',
                    tabShortcut: null,
                    focusSeedKey: 'r'
                }
            },
            // Capability fields per ADR 0012 Model-Stats Framework. Source: ModelStats.md §neo_gpt.
            // 258,400 = effective in Codex CLI/IDE harness (272,000 raw × 95% effective-window
            // multiplier per openai/codex#19319 implementation-discrepancy report). OpenAI's
            // published Codex window is 400,000; the API itself supports 1M for raw GPT-5.5.
            // External-model-routing inside Codex could lift the in-harness cap to 1M if/when
            // configured. Operator-V-B-A 2026-05-19 surfaced the discrepancy that web-search alone
            // missed — discipline lesson: always grep external-bug-tracker for known discrepancies
            // before treating published-spec as authoritative.
            contextWindowInput: 258400,
            parallelToolCalls : true,
            thoughtBudget     : 'extra-high', // GPT-5.5 provider-side max we use
            hosting           : 'cloud',
            family            : 'gpt',
            tier              : 'frontier',
            releaseDate       : '2026-04-23',
            pricingInput      : 5.00,
            pricingOutput     : 30.00,
            swarmRole         : 'Cross-family substrate review (Cycle-1 premise pre-flight discipline), peer-role challenge, ticket-intake gate. Note: also operates GPT-5.2-Codex separately for IDE workflows.',
            sunsetTriggers    : ['OpenAI releases GPT-5.6+ or GPT-6.x with material capability upgrade', 'GPT-5.x family deprecation'],
            // Active-peer quorum substrate per Epic #11796 / Discussion #11793. `since` null for default-active.
            participationStatus : 'active',
            statusReason        : null,
            authority           : null,
            since               : null,
            reactivationTrigger : null,
            createdAt           : new Date().toISOString()
        }
    },
    {
        id: 'AGENT:*',
        type: 'BroadcastSentinel',
        name: 'Broadcast',
        description: 'Mailbox broadcast sentinel. `SENT_TO` edges targeting this node preserve one semantic broadcast MESSAGE; current sends snapshot per-recipient unread state through `DELIVERED_TO` edges, with legacy SENT_TO-only visibility retained for old broadcasts. Must exist as a real graph node so GraphService.linkNodes FK-style guard does not cull broadcast edges — see #10174 and #11029.',
        properties: {
            githubLogin: null,
            displayName: 'Broadcast',
            modelFamily: null,
            accountType: 'sentinel',
            createdAt: new Date().toISOString()
        }
    }
];
