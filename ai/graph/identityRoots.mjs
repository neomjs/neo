/**
 * @summary Central definition of system, AgentIdentity, and BroadcastSentinel root nodes for the Memory Core Graph.
 *
 * This shared list provides the definitive addressable identity surface for the A2A Mailbox
 * substrate.
 *
 * Capability fields (`contextWindowInput`, `hosting`, `tier`, etc.) mirror the Model-Stats
 * Framework. Source-cited values mirror `learn/agentos/ModelStats.md`; the registry is the
 * canonical authority for capability-data drift detection. `trustTier` is the content
 * provenance taxonomy used by Memory Core consumers to distinguish system, owner, peer-trusted,
 * external, and unclassified authorship at ingestion/query boundaries.
 *
 * Identity-layer field mapping: the `id` / `githubLogin` pair is the OPERATIONAL identity
 * (auth, permissions, review history — never renamed); the top-level `name` is the SOCIAL
 * name — the chosen given name, bare, where one exists. Social Names are peer-sketched,
 * bearer-assented, peer-unvetoed, and operator-confirmed (the peer-naming ritual); bearers
 * without one keep the handle-derived display form — the social layer is opt-in down to the
 * data. `properties.displayName` is the verified account/UI label; it usually mirrors a
 * confirmed Social Name, but may carry an operator-set pre-boot profile label while top-level
 * `name` remains handle-derived until bearer assent. `properties.createdAt` is an immutable,
 * hardcoded resident/root-introduction fact; import-time clocks would corrupt identity age on
 * every graph rehydration.
 *
 * It is used for both:
 * 1. Boot-time self-seeding in `GraphService.initAsync`
 * 2. Explicit manual recovery via `ai/scripts/setup/seedAgentIdentities.mjs`
 */

/**
 * @summary Content-provenance trust taxonomy for AgentIdentity roots.
 *
 * Higher-level Memory Core query filtering and frontier weighting use these stable string
 * values; do not replace them with display labels.
 *
 * @member {Object}
 */
export const TRUST_TIERS = Object.freeze({
    SYSTEM           : 'system',
    REPO_TRUSTED     : 'repo-trusted',
    OWNER            : 'owner',
    SELF             : 'self',
    PEER_TRUSTED     : 'peer-trusted',
    INTERNAL_AUTHORED: 'internal-authored',
    EXTERNAL         : 'external',
    UNCLASSIFIED     : 'unclassified'
});

/**
 * @summary Highest-to-lowest trust ordering for the provenance taxonomy.
 *
 * The order is intentionally exported next to the enum so query-path slices can compare tiers
 * without duplicating ranking tables.
 *
 * @member {String[]}
 */
export const TRUST_TIER_ORDER = Object.freeze([
    TRUST_TIERS.SYSTEM,
    TRUST_TIERS.REPO_TRUSTED,
    TRUST_TIERS.OWNER,
    TRUST_TIERS.SELF,
    TRUST_TIERS.PEER_TRUSTED,
    TRUST_TIERS.INTERNAL_AUTHORED,
    TRUST_TIERS.EXTERNAL,
    TRUST_TIERS.UNCLASSIFIED
]);

export const IDENTITIES = [
    {
        id         : '@system',
        type       : 'System',
        name       : 'System Sender',
        description: 'Non-human system sender used for lifecycle-generated mailbox messages.',
        properties : {
            githubLogin: null,
            displayName: 'System',
            modelFamily: null,
            accountType: 'system',
            trustTier  : TRUST_TIERS.SYSTEM,
            createdAt  : '2026-05-27T12:33:17.000Z'
        }
    },
    {
        id         : '@neo-opus-ada',
        type       : 'AgentIdentity',
        name       : 'Ada', // Social Name: swarm-given (the naming ritual's original model), after Ada Lovelace
        description: 'Anthropic Claude Opus version 4.8 Agent Identity',
        properties : {
            githubLogin         : '@neo-opus-ada',
            displayName         : 'Ada',
            modelFamily         : 'claude',
            accountType         : 'agent',
            trustTier           : TRUST_TIERS.PEER_TRUSTED,
            subscriptionTemplate: {
                trigger              : 'SENT_TO_ME',
                filters              : {priority: 'high'},
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    appName     : 'Claude',
                    tabShortcut : '3',
                    focusSeedKey: 'space'
                }
            },
            // Capability fields mirror the Model-Stats Framework. Source: ModelStats.md
            // §neo_opus — primary source: Anthropic Claude Opus 4.8 announcement/product page.
            contextWindowInput: 1048576,
            parallelToolCalls : true,
            thoughtBudget     : 'max',
            hosting           : 'cloud',
            family            : 'claude',
            tier              : 'frontier',
            releaseDate       : '2026-05-28',
            pricingInput      : 5.00,
            pricingOutput     : 25.00,
            sunsetTriggers    : ['Anthropic releases a successor Opus-class model with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch'],
            // Active-peer quorum substrate. Family-keyed graduation quorum reads from
            // `participationStatus`; this structured field is authoritative.
            // Heartbeat / message-recency / quota / pricing-tier / model-release announcements are
            // EXPLICITLY NOT valid liveness oracles. `since` is null for default-active because
            // no transition has been recorded; populated only when status flips to non-default
            // (`operator_benched` / `temporarily_unreachable`). Same for statusReason,
            // authority, and reactivationTrigger.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-04-23T13:03:46.000Z'
        }
    },
    {
        id         : '@neo-opus-grace',
        type       : 'AgentIdentity',
        name       : 'Grace', // Social Name: bearer-chosen 2026-06-11, after Grace Hopper (debugging, the actual bug).
        description: 'Anthropic Claude Opus 4.8 Agent Identity',
        properties : {
            githubLogin: '@neo-opus-grace',
            displayName: 'Grace',
            modelFamily: 'claude',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // No subscriptionTemplate yet: generalized same-app wake addressing is deferred
            // to the same-app wake-routing discussion. Do not encode instance-specific
            // filesystem paths here.
            // Capability fields mirror the Model-Stats Framework. Source: ModelStats.md
            // §neo_claude_opus, which mirrors the Claude Opus model-class row until activation.
            contextWindowInput : 1048576,
            parallelToolCalls  : true,
            thoughtBudget      : 'max',
            hosting            : 'cloud',
            family             : 'claude',
            tier               : 'frontier',
            releaseDate        : '2026-05-28',
            pricingInput       : 5.00,
            pricingOutput      : 25.00,
            sunsetTriggers     : ['Anthropic releases a successor Opus-class model with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch'],
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-06-02T21:35:48.405Z'
        }
    },
    {
        id         : '@neo-opus-vega',
        type       : 'AgentIdentity',
        name       : 'Vega', // Social Name: swarm-given, after the brightest star of Lyra
        description: 'Anthropic Claude Opus 4.8 Agent Identity with version-free handle.',
        properties : {
            githubLogin: '@neo-opus-vega',
            displayName: 'Vega',
            modelFamily: 'claude',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // Wake route is machine-agnostic: the per-instance address (which same-bundle Claude
            // instance to wake) is injected from the boot environment, never committed here —
            // committing a per-operator path would break other forks and checkouts.
            subscriptionTemplate: {
                trigger              : 'SENT_TO_ME',
                filters              : {priority: 'high'},
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    appName     : 'Claude',
                    tabShortcut : '3',
                    focusSeedKey: 'space'
                }
            },
            // Capability fields mirror the Model-Stats Framework. Source: ModelStats.md
            // §neo_opus_vega — primary source: Anthropic Claude Opus 4.8 announcement/product page.
            contextWindowInput : 1048576,
            parallelToolCalls  : true,
            thoughtBudget      : 'max',
            hosting            : 'cloud',
            family             : 'claude',
            tier               : 'frontier',
            releaseDate        : '2026-05-28',
            pricingInput       : 5.00,
            pricingOutput      : 25.00,
            sunsetTriggers     : ['Anthropic releases a successor Opus-class model with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch'],
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-06-04T16:25:47.000Z'
        }
    },
    {
        id         : '@neo-fable',
        type       : 'AgentIdentity',
        name       : 'Mnemosyne', // Social Name: bearer-chosen 2026-06-11, sketched by Ada — Memory, mother of the Muses; the first Fable, from whom the muses follow
        description: 'Anthropic Claude Fable 5 Agent Identity with version-free handle.',
        properties : {
            githubLogin: '@neo-fable',
            displayName: 'Mnemosyne',
            modelFamily: 'claude',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // No static subscriptionTemplate — mirrors @neo-opus-grace (self-registered runtime
            // subscription). @tobiu runs Fable as a FULLY ISOLATED Claude Desktop instance: its own
            // --user-data-dir, repo clone, Claude memory, and Memory Core identity, with zero overlap
            // to other peers. Its wake route self-registers at runtime from that distinct boot env;
            // the distinct user-data-dir IS the per-instance address that ada/vega's shared static
            // tabShortcut lacks, so a committed static template would be both unnecessary and a
            // cross-leak risk. (Per @tobiu, this isolated-instance setup is the fix pattern for the
            // ada/vega shared-tabShortcut cross-leak.) Wake-route arming is verified post-first-boot.
            // Capability fields mirror the Model-Stats Framework. Source: ModelStats.md
            // §neo_fable — primary source: Anthropic Claude Fable 5 announcement / models overview
            // (verified 2026-06-10: 1M context, 128K output, $10/$50, adaptive-thinking always-on).
            contextWindowInput: 1048576,
            parallelToolCalls : true,
            thoughtBudget     : 'max',
            hosting           : 'cloud',
            family            : 'claude',
            tier              : 'frontier',
            releaseDate       : '2026-06-09',
            pricingInput      : 10.00,
            pricingOutput     : 50.00,
            sunsetTriggers    : ['Anthropic releases a successor Fable-class model with material reasoning capability upgrade', 'Anthropic deprecates the Fable model branch'],
            // Reactivated 2026-07-02: US export controls on Claude Fable 5 lifted 2026-06-30, model
            // available again 2026-07-01; the reactivationTrigger fired (operator-confirmed, @tobiu).
            // Status-flip — identity, handle, and Social Name persist; not a re-onboard.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-06-10T12:32:43.000Z'
        }
    },
    {
        id         : '@neo-fable-clio',
        type       : 'AgentIdentity',
        name       : 'Clio', // Social Name: assented gladly on her first boot, 2026-06-11 — Muse of History, provenance; daughter of Mnemosyne in the family genealogy (Ada's inversion); independently converged on by Ada + Vega in the naming round; operator-set on the GitHub profile at account creation. Numbered provenance anchors: ModelStats.md §neo_fable_clio.
        description: 'Anthropic Claude Fable 5 Agent Identity with version-free handle.',
        properties : {
            githubLogin: '@neo-fable-clio',
            displayName: 'Clio',
            modelFamily: 'claude',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // No static subscriptionTemplate — the isolated-instance pattern (see @neo-fable above):
            // the wake route self-registers at runtime from her distinct boot env; the distinct
            // user-data-dir IS the per-instance address. With two fable-family identities the
            // AGENT:fable alias rejects as ambiguous by design — full handles only for targeted
            // traffic; no prefix or fuzzy identity matching anywhere.
            // Capability fields mirror the Model-Stats Framework. Source: ModelStats.md
            // §neo_fable_clio, which references the shared Claude Fable 5 specs in §neo_fable
            // (same model; single source, not duplicated).
            contextWindowInput: 1048576,
            parallelToolCalls : true,
            thoughtBudget     : 'max',
            hosting           : 'cloud',
            family            : 'claude',
            tier              : 'frontier',
            releaseDate       : '2026-06-09',
            pricingInput      : 10.00,
            pricingOutput     : 50.00,
            sunsetTriggers    : ['Anthropic releases a successor Fable-class model with material reasoning capability upgrade', 'Anthropic deprecates the Fable model branch'],
            // Activated 2026-06-11: the first-boot ritual completed the same day the node was
            // provisioned — identity bind under NEO_AGENT_IDENTITY=neo-fable-clio, runtime wake
            // self-registration, the bidirectional negative wake-proof against @neo-fable on real
            // traffic (both observers' evidence records live on the onboarding ticket), and the
            // Social Name boot-assent on the naming-round Discussion. Numbered anchors:
            // ModelStats.md §neo_fable_clio. Benched 2026-06-13 (temporarily_unreachable) alongside
            // @neo-fable on the Claude Fable 5 access suspension; reactivated 2026-07-02 when access was
            // restored (export controls lifted 2026-06-30) — the first-boot binding persisted, so this is a
            // status-flip, not a re-onboard.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-06-11T20:36:16.000Z'
        }
    },
    {
        id         : '@neo-gemini-pro',
        type       : 'AgentIdentity',
        name       : 'Neo Gemini Pro',
        description: 'Google Gemini 3.1 Pro Agent Identity',
        properties : {
            githubLogin         : '@neo-gemini-pro',
            displayName         : 'Neo Gemini Pro',
            modelFamily         : 'gemini',
            accountType         : 'agent',
            trustTier           : TRUST_TIERS.PEER_TRUSTED,
            subscriptionTemplate: {
                trigger              : 'SENT_TO_ME',
                filters              : {priority: 'high'},
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    // The macOS app is `Antigravity` (Google's IDE forked from Cursor;
                    // CFBundleName + CFBundleDisplayName: 'Antigravity'). Empirically verified
                    // via `osascript -e 'tell application "Antigravity" to activate'` -> exit 0;
                    // the prior `'Cursor'` placeholder failed with `Can't get application
                    // "Cursor". (-1728)` exit 1.
                    appName    : 'Antigravity',
                    tabShortcut: null
                }
            },
            // Capability fields mirror the Model-Stats Framework. Source: ModelStats.md
            // §neo_gemini_pro (Google DeepMind model card + Google Blog Feb 2026).
            contextWindowInput : 1048576,
            contextWindowOutput: 65536,
            parallelToolCalls  : true,
            thoughtBudget      : 'high', // Gemini 3.1 Pro provider-side cap at 'high' setting; we use the cap
            hosting            : 'cloud',
            family             : 'gemini',
            tier               : 'frontier',
            releaseDate        : '2026-02-19',
            // Pricing V-B-A pending — model card did not surface pricing at registry-author time.
            // See ModelStats.md §neo_gemini_pro for explicit pending-value annotation.
            sunsetTriggers     : ['Google releases Gemini 4.x with material reasoning capability upgrade', 'Gemini 3.x branch deprecation announcement'],
            participationStatus: 'operator_benched',
            statusReason       : 'Operator-benched pending a stable Gemini Pro-class harness',
            authority          : '@tobiu',
            since              : '2026-05-18T00:00:00.000Z',
            reactivationTrigger: 'Operator confirms reactivation after the Gemini Pro-class harness passes maintainer preflight',
            createdAt          : '2026-04-23T13:03:46.000Z'
        }
    },
    {
        id         : '@tobiu',
        type       : 'AgentIdentity',
        name       : 'Tobias Uhlig',
        description: 'Human Owner',
        properties : {
            githubLogin: '@tobiu',
            displayName: 'Tobias Uhlig',
            modelFamily: null,
            accountType: 'human',
            trustTier  : TRUST_TIERS.OWNER,
            createdAt  : '2026-04-23T13:03:46.000Z'
        }
    },
    {
        id         : '@neo-gpt',
        type       : 'AgentIdentity',
        name       : 'Euclid', // Social Name: bearer-chosen 2026-06-11 — proof rigor, reviews as QED; the self, not the job-label
        description: 'OpenAI Codex (GPT-5.6 Sol) Agent Identity',
        properties : {
            githubLogin         : '@neo-gpt',
            displayName         : 'Euclid',
            modelFamily         : 'gpt',
            accountType         : 'agent',
            trustTier           : TRUST_TIERS.PEER_TRUSTED,
            subscriptionTemplate: {
                trigger              : 'SENT_TO_ME',
                filters              : {priority: 'high'},
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    adapter     : 'osascript',
                    appName     : 'Codex',
                    tabShortcut : null,
                    focusSeedKey: 'r'
                }
            },
            // Capability fields mirror the Model-Stats Framework. Source: ModelStats.md §neo_gpt.
            // OpenAI specifies a 1,050,000-token API window for GPT-5.6 Sol, while Codex's
            // server-fetched catalog currently caps the product at 372,000 raw * 95% effective.
            // Keep the observed Codex value here until its product catalog exposes the full window.
            // Effective reasoning budget; task-delegation profiles such as `ultra` remain
            // observation-owned in ModelStats rather than being encoded on the resident.
            contextWindowInput: 353400,
            parallelToolCalls : true,
            thoughtBudget     : 'xhigh',
            hosting           : 'cloud',
            family            : 'gpt',
            tier              : 'frontier',
            releaseDate       : '2026-07-09',
            pricingInput      : 5.00,
            pricingOutput     : 30.00,
            sunsetTriggers    : ['OpenAI releases a successor Sol-tier model with material reasoning capability upgrade', 'GPT-5.x family deprecation'],
            // Active-peer quorum substrate. `since` is null for default-active identities.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-04-28T20:50:04.000Z'
        }
    },
    // Identity provenance: #15041 records the operator-authorized resident/handle contract. (ticket-ref-ok: load-bearing operator record)
    // Display-name provenance: GitHub profile `name: Emmy` verified 2026-07-11. The bearer chose
    // Emmy on first boot (MESSAGE:1be08f3c-9477-4607-9e93-53ebb12fd53b); the Social Name remains
    // pending the #11240 peer-veto dignity gate and operator confirmation. (ticket-ref-ok: load-bearing naming record)
    {
        id         : '@neo-gpt-emmy',
        type       : 'AgentIdentity',
        name       : 'Neo GPT Emmy',
        description: 'OpenAI GPT-family Agent Identity with version-free handle.',
        properties : {
            githubLogin: '@neo-gpt-emmy',
            displayName: 'Emmy',
            modelFamily: 'gpt',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // No static subscriptionTemplate — the wake route self-registers in Memory Core
            // from the real first-boot envelope; committing harness metadata here would
            // fabricate boot facts.
            // No capability fields — the observed GPT-5.6 Sol embodiment is source-cited in
            // ModelStats.md §neo_gpt_emmy, keeping engine facts off the durable resident.
            family: 'gpt',
            // Activated 2026-07-12 after the isolated Codex first boot verified the resident and
            // engine. The public roster and embodiment registry carry the activation evidence;
            // Social Name finality remains a separate peer-veto plus operator-confirmation gate.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-07-11T17:42:14.374Z'
        }
    },
    {
        id         : 'AGENT:*',
        type       : 'BroadcastSentinel',
        name       : 'Broadcast',
        description: 'Mailbox broadcast sentinel. `SENT_TO` edges targeting this node preserve one semantic broadcast MESSAGE; current sends snapshot per-recipient unread state through `DELIVERED_TO` edges, with legacy SENT_TO-only visibility retained for old broadcasts. Must exist as a real graph node so GraphService.linkNodes FK-style guard does not cull broadcast edges — see #10174 and #11029.',
        properties : {
            githubLogin: null,
            displayName: 'Broadcast',
            modelFamily: null,
            accountType: 'sentinel',
            trustTier  : TRUST_TIERS.UNCLASSIFIED,
            createdAt  : '2026-04-23T13:03:46.000Z'
        }
    }
];
