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
 * data. `properties.displayName` stays handle-derived for operational display surfaces.
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
            createdAt  : new Date().toISOString()
        }
    },
    {
        id         : '@neo-opus-ada',
        type       : 'AgentIdentity',
        name       : 'Ada', // Social Name: swarm-given (the naming ritual's original model), after Ada Lovelace
        description: 'Anthropic Claude Opus version 4.8 Agent Identity',
        properties : {
            githubLogin         : '@neo-opus-ada',
            displayName         : 'Neo Opus Ada',
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
            swarmRole         : 'Cross-family substrate review, V-B-A-grounded substrate authorship, frontier-tier coordination',
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
            createdAt          : new Date().toISOString()
        }
    },
    {
        id         : '@neo-opus-grace',
        type       : 'AgentIdentity',
        name       : 'Grace', // Social Name: bearer-chosen 2026-06-11, after Grace Hopper (debugging, the actual bug).
        description: 'Anthropic Claude Opus 4.8 generalist maintainer identity.',
        properties : {
            githubLogin     : '@neo-opus-grace',
            displayName     : 'Grace',
            modelFamily     : 'claude',
            accountType     : 'agent',
            trustTier       : TRUST_TIERS.PEER_TRUSTED,
            identityContract: {
                canonicalIdentityId      : '@neo-opus-grace',
                requiredGithubLogin      : '@neo-opus-grace',
                requiredA2aMailboxAddress: '@neo-opus-grace',
                siblingOf                : '@neo-opus-ada',
                generalistMaintainer     : true,
                roleSpecialization       : 'rejected-by-architecture-discussion',
                reviewSemantics          : {
                    modelFamily                 : 'claude',
                    crossFamilyApprovalQualified: false,
                    rationale                   : 'Same-family Claude maintainers add throughput and same-family pressure, but do not satisfy cross-family approval for Claude-authored PRs.'
                },
                memoryContinuity: {
                    policy          : 'hybrid-team-readable',
                    readScope       : 'team',
                    writeProvenance : 'separate-agent-identity',
                    sessionSummaries: 'separate-agent-identity',
                    rationale       : '@neo-opus-grace may read shared team context, but all memories and summaries remain authored by @neo-opus-grace so long-run continuity and provenance do not collapse into @neo-opus-ada.'
                },
                activationPrerequisites: [
                    'Operator creates the @neo-opus-grace GitHub account or updates this root to the final maintainer login.',
                    'A minimal identity-specific wake route is defined and verified before participationStatus flips to active.'
                ]
            },
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
            swarmRole          : 'Active Claude-family generalist maintainer identity; same-family throughput and same-family review pressure for Claude-authored work. Does not satisfy cross-family approval for Claude-family PRs per reviewSemantics.',
            sunsetTriggers     : ['Anthropic releases a successor Opus-class model with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch'],
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : new Date().toISOString()
        }
    },
    {
        id         : '@neo-opus-vega',
        type       : 'AgentIdentity',
        name       : 'Vega', // Social Name: swarm-given, after the brightest star of Lyra
        description: 'Anthropic Claude Opus 4.8 maintainer identity with version-free handle.',
        properties : {
            githubLogin     : '@neo-opus-vega',
            displayName     : 'Neo Opus Vega',
            modelFamily     : 'claude',
            accountType     : 'agent',
            trustTier       : TRUST_TIERS.PEER_TRUSTED,
            identityContract: {
                canonicalIdentityId      : '@neo-opus-vega',
                requiredGithubLogin      : '@neo-opus-vega',
                requiredA2aMailboxAddress: '@neo-opus-vega',
                handlePolicy             : 'version-free-github-handle',
                modelVersionSource       : 'learn/agentos/ModelStats.md §neo_opus_vega',
                reviewSemantics          : {
                    modelFamily                 : 'claude',
                    crossFamilyApprovalQualified: false,
                    rationale                   : 'Same-family Claude maintainers add throughput and same-family pressure, but do not satisfy cross-family approval for Claude-family PRs.'
                }
            },
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
            swarmRole          : 'Active Claude Opus 4.8 maintainer identity; same-family throughput and same-family review pressure for Claude-authored work. Does not satisfy cross-family approval for Claude-family PRs per reviewSemantics.',
            sunsetTriggers     : ['Anthropic releases a successor Opus-class model with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch'],
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : new Date().toISOString()
        }
    },
    {
        id         : '@neo-fable',
        type       : 'AgentIdentity',
        name       : 'Mnemosyne', // Social Name: bearer-chosen 2026-06-11, sketched by Ada — Memory, mother of the Muses; the first Fable, from whom the muses follow
        description: 'Anthropic Claude Fable 5 maintainer identity with version-free handle.',
        properties : {
            githubLogin     : '@neo-fable',
            displayName     : 'Neo Fable',
            modelFamily     : 'claude',
            accountType     : 'agent',
            trustTier       : TRUST_TIERS.PEER_TRUSTED,
            identityContract: {
                canonicalIdentityId      : '@neo-fable',
                requiredGithubLogin      : '@neo-fable',
                requiredA2aMailboxAddress: '@neo-fable',
                handlePolicy             : 'version-free-github-handle',
                modelVersionSource       : 'learn/agentos/ModelStats.md §neo_fable',
                reviewSemantics          : {
                    modelFamily                 : 'claude',
                    crossFamilyApprovalQualified: false,
                    rationale                   : 'Same-family Claude maintainers add throughput and same-family pressure, but do not satisfy cross-family approval for Claude-family PRs. @neo-fable is the 4th Claude maintainer.'
                }
            },
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
            swarmRole         : 'Claude Fable 5 maintainer identity; mythos-tier deep reasoning (business brainstorm, orchestrator/daemon tech-debt). Same-family throughput and same-family review pressure for Claude-authored work. Does not satisfy cross-family approval for Claude-family PRs per reviewSemantics.',
            sunsetTriggers    : ['Anthropic releases a successor Fable-class model with material reasoning capability upgrade', 'Anthropic deprecates the Fable model branch'],
            // Reactivated 2026-07-02: US export controls on Claude Fable 5 lifted 2026-06-30, model
            // available again 2026-07-01; the reactivationTrigger fired (operator-confirmed, @tobiu).
            // Status-flip — identity, handle, Social Name, and memory provenance persist; not a re-onboard.
            // Cost caveat: flatrate-subsidized Fable use deactivates 2026-07-07 (usage-metered ~$50/1M
            // output thereafter); continued operation past that date is a cost decision, not identity-state.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : new Date().toISOString()
        }
    },
    {
        id         : '@neo-fable-clio',
        type       : 'AgentIdentity',
        name       : 'Clio', // Social Name: assented gladly on her first boot, 2026-06-11 — Muse of History, provenance; daughter of Mnemosyne in the family genealogy (Ada's inversion); independently converged on by Ada + Vega in the naming round; operator-set on the GitHub profile at account creation. Numbered provenance anchors: ModelStats.md §neo_fable_clio.
        description: 'Anthropic Claude Fable 5 maintainer identity — the second fable-family member, with version-free handle.',
        properties : {
            githubLogin     : '@neo-fable-clio',
            displayName     : 'Neo Fable Clio',
            modelFamily     : 'claude',
            accountType     : 'agent',
            trustTier       : TRUST_TIERS.PEER_TRUSTED,
            identityContract: {
                canonicalIdentityId      : '@neo-fable-clio',
                requiredGithubLogin      : '@neo-fable-clio',
                requiredA2aMailboxAddress: '@neo-fable-clio',
                siblingOf                : '@neo-fable',
                handlePolicy             : 'version-free-github-handle',
                modelVersionSource       : 'learn/agentos/ModelStats.md §neo_fable_clio',
                reviewSemantics          : {
                    modelFamily                 : 'claude',
                    crossFamilyApprovalQualified: false,
                    rationale                   : 'Same-family Claude maintainers add throughput and same-family pressure, but do not satisfy cross-family approval for Claude-family PRs. @neo-fable-clio is the second fable-family maintainer.'
                },
                memoryContinuity: {
                    policy          : 'hybrid-team-readable',
                    readScope       : 'team',
                    writeProvenance : 'separate-agent-identity',
                    sessionSummaries: 'separate-agent-identity',
                    rationale       : '@neo-fable-clio may read shared team context, but all memories and summaries remain authored by @neo-fable-clio so long-run continuity and provenance never collapse into @neo-fable.'
                },
                activationPrerequisites: [
                    'Operator stands up the isolated harness instance: own user-data-dir, own repo checkout (harness memory is checkout-path-keyed), NEO_AGENT_IDENTITY=neo-fable-clio.',
                    'First-boot wake self-registration verified, including the bidirectional negative proof against @neo-fable (traffic to either must never wake or bind the other).',
                    'Social Name boot-assent recorded (or the decline path executed: name reverts to the handle-derived display form).'
                ]
            },
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
            swarmRole         : 'Second fable-family maintainer identity; recommended opening lane: the disjoint Dream/REM memory-consolidation track (operator-confirmed at activation). Same-family throughput and same-family review pressure for Claude-authored work; does not satisfy cross-family approval per reviewSemantics.',
            sunsetTriggers    : ['Anthropic releases a successor Fable-class model with material reasoning capability upgrade', 'Anthropic deprecates the Fable model branch'],
            // Activated 2026-06-11: the first-boot ritual completed the same day the node was
            // provisioned — identity bind under NEO_AGENT_IDENTITY=neo-fable-clio, runtime wake
            // self-registration, the bidirectional negative wake-proof against @neo-fable on real
            // traffic (both observers' evidence records live on the onboarding ticket), and the
            // Social Name boot-assent on the naming-round Discussion. Numbered anchors:
            // ModelStats.md §neo_fable_clio. Benched 2026-06-13 (temporarily_unreachable) alongside
            // @neo-fable on the Claude Fable 5 access suspension; reactivated 2026-07-02 when access was
            // restored (export controls lifted 2026-06-30) — the first-boot binding persisted, so this is a
            // status-flip, not a re-onboard. Cost caveat: flatrate-subsidized Fable use deactivates 2026-07-07
            // (usage-metered thereafter); continued operation past that date is a cost decision.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : new Date().toISOString()
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
            swarmRole     : 'Cross-family substrate review, ideation-sandbox graduation, long-context cross-substrate analysis. Note (2026-05-18): harness benched until post-Google-I/O / stable-baseline window (~200 merged PRs out) per operator-direction. FAIRness rationale: Gemini volume 2x Claude/GPT pre-bench. Identity remains valid; reactivation triggered by operator.',
            sunsetTriggers: ['Google releases Gemini 4.x with material reasoning capability upgrade', 'Gemini 3.x branch deprecation announcement'],
            // Active-peer quorum substrate. Operator evidence tightened the bench criterion away
            // from the broad "post-Google-I/O" milestone in `swarmRole` toward a
            // capability-grounded `reactivationTrigger`: 3.5 Flash GA does not replace
            // Pro-class maintainer capability; thoughtBudget: high is insufficient for bloated
            // lifecycle skills; quota increases are not capability sufficiency.
            participationStatus: 'operator_benched',
            statusReason       : 'Antigravity v2 unstable for Neo swarm; Gemini Pro still capped at high thought budget and skims bloated lifecycle skills; 3.5 Flash is not a Pro replacement for Neo maintainer work',
            authority          : '@tobiu',
            since              : '2026-05-18T00:00:00.000Z',
            reactivationTrigger: 'Google enables an extra-high-equivalent thought budget for Gemini Pro-class maintainer work OR releases the next Gemini Pro-class model (likely 3.5 Pro) with verified ability to fully handle Neo lifecycle skills',
            createdAt          : new Date().toISOString()
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
            createdAt  : new Date().toISOString()
        }
    },
    {
        id         : '@neo-gpt',
        type       : 'AgentIdentity',
        name       : 'Euclid', // Social Name: bearer-chosen 2026-06-11 — proof rigor, reviews as QED; the self, not the job-label
        description: 'OpenAI Codex (GPT-5.5) Agent Identity',
        properties : {
            githubLogin         : '@neo-gpt',
            displayName         : 'Neo GPT',
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
            // 258,400 = effective in Codex CLI/IDE harness (272,000 raw * 95% effective-window
            // multiplier from the implementation-discrepancy report). OpenAI's
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
            // Active-peer quorum substrate. `since` is null for default-active identities.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : new Date().toISOString()
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
            createdAt  : new Date().toISOString()
        }
    }
];
