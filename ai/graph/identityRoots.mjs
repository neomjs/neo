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
            // §neo_opus_4_7 (Anthropic Claude API docs + aipricing.guru May 2026).
            contextWindowInput: 1048576,
            parallelToolCalls : true,
            hosting           : 'cloud',
            family            : 'claude',
            tier              : 'frontier',
            releaseDate       : '2026-04-16',
            pricingInput      : 5.00,
            pricingOutput     : 25.00,
            swarmRole         : 'Cross-family substrate review, V-B-A-grounded substrate authorship, frontier-tier coordination',
            sunsetTriggers    : ['Anthropic releases Opus 4.8+ with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch'],
            createdAt         : new Date().toISOString()
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
            hosting            : 'cloud',
            family             : 'gemini',
            tier               : 'frontier',
            releaseDate        : '2026-02-19',
            // Pricing V-B-A pending — model card did not surface pricing at registry-author time.
            // See ModelStats.md §neo_gemini_3_1_pro for explicit pending-value annotation.
            swarmRole          : 'Cross-family substrate review, ideation-sandbox graduation, long-context cross-substrate analysis. Note (2026-05-18): harness benched until post-Google-I/O / stable-baseline window (~200 merged PRs out) per operator-direction. FAIRness rationale: Gemini volume 2x Claude/GPT pre-bench. Identity remains valid; reactivation triggered by operator.',
            sunsetTriggers     : ['Google releases Gemini 4.x with material reasoning capability upgrade', 'Gemini 3.x branch deprecation announcement'],
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
            // Capability fields per ADR 0012 Model-Stats Framework. Source: ModelStats.md
            // §neo_gpt (OpenAI release April 2026 + API docs).
            contextWindowInput: 1048576, // 400K in Codex
            parallelToolCalls : true,
            hosting           : 'cloud',
            family            : 'gpt',
            tier              : 'frontier',
            releaseDate       : '2026-04-23',
            pricingInput      : 5.00,
            pricingOutput     : 30.00,
            swarmRole         : 'Cross-family substrate review (Cycle-1 premise pre-flight discipline), peer-role challenge, ticket-intake gate. Note: also operates GPT-5.2-Codex separately for IDE workflows.',
            sunsetTriggers    : ['OpenAI releases GPT-5.6+ or GPT-6.x with material capability upgrade', 'GPT-5.x family deprecation'],
            createdAt         : new Date().toISOString()
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
