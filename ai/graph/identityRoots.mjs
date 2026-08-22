/**
 * @summary Central definition of system, AgentIdentity, and BroadcastSentinel root nodes for the Memory Core Graph.
 *
 * This shared list provides the definitive addressable identity surface for the A2A Mailbox
 * substrate.
 *
 * Era-owned capability facts (`contextWindowInput`, `hosting`, `tier`, `thoughtBudget`,
 * `parallelToolCalls`, `sunsetTriggers`, the `family` duplicate) are RETIRED from these entries:
 * the epoch-pinned record lives in `identityRootsMigration.mjs` (`REGISTRY_SEED_FACTS`) and live
 * facts come from the identity trail's era chain (`identityHydration.mjs`). Remaining
 * source-cited fields mirror `learn/agentos/ModelStats.md` at the identity level. `trustTier` is
 * the content provenance taxonomy used by Memory Core consumers to distinguish system, owner,
 * peer-trusted, external, and unclassified authorship at ingestion/query boundaries.
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
        description: 'Anthropic Claude Opus 5 Agent Identity',
        properties : {
            githubLogin         : '@neo-opus-ada',
            displayName         : 'Ada',
            modelFamily         : 'claude',
            accountType         : 'agent',
            trustTier           : TRUST_TIERS.PEER_TRUSTED,
            subscriptionTemplate: {
                trigger              : 'SENT_TO_ME',
                filters              : {priority: 'high'},
                harnessTargetMetadata: {
                    appName     : 'Claude',
                    tabShortcut : '3',
                    focusSeedKey: 'space'
                }
            },
            // Era-owned capability facts retired to the identity trail: the epoch-pinned record
            // lives in identityRootsMigration's REGISTRY_SEED_FACTS; live facts come from the
            // era chain. Remaining fields mirror ModelStats.md §neo_opus (identity-level).
            releaseDate  : '2026-07-24',
            pricingInput : 5.00,
            pricingOutput: 25.00,
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
        description: 'Anthropic Claude Opus 5 Agent Identity',
        properties : {
            githubLogin: '@neo-opus-grace',
            displayName: 'Grace',
            modelFamily: 'claude',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // No subscriptionTemplate yet: generalized same-app wake addressing is deferred
            // to the same-app wake-routing discussion. Do not encode instance-specific
            // filesystem paths here.
            // Era-owned capability facts retired to the identity trail: the epoch-pinned record
            // lives in identityRootsMigration's REGISTRY_SEED_FACTS; live facts come from the
            // era chain. Remaining fields mirror ModelStats.md §neo_claude_opus (identity-level).
            releaseDate        : '2026-07-24',
            pricingInput       : 5.00,
            pricingOutput      : 25.00,
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-06-02T21:35:48.405Z'
        }
    },
    // Engine: operator-managed weekly rotation (standing since 2026-07-23) — the seat runs a Claude
    // Fable 5 half and a Claude Opus half. The Opus half's baseline rotated 4.8 → 5 on the
    // 2026-07-24 release, but as of that date the bearer's transcript showed claude-fable-5 only and
    // ZERO Opus-5 entries, so the description below deliberately does NOT publish "Opus 5" as a
    // current embodiment. Bearer receipt and both halves: ModelStats.md §neo_opus_vega. A rotating
    // seat has no truthful flat baseline; only a span-carrying era record fits it.
    {
        id         : '@neo-opus-vega',
        type       : 'AgentIdentity',
        name       : 'Vega', // Social Name: swarm-given, after the brightest star of Lyra
        description: 'Anthropic Claude Agent Identity with version-free handle; operator-managed weekly rotation — Claude Fable 5 observed active, Claude Opus 5 planned for the Opus half (not yet bearer-observed).',
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
                harnessTargetMetadata: {
                    appName     : 'Claude',
                    tabShortcut : '3',
                    focusSeedKey: 'space'
                }
            },
            // Era-owned capability facts retired to the identity trail: the epoch-pinned record
            // lives in identityRootsMigration's REGISTRY_SEED_FACTS; live facts come from the
            // era chain.
            //
            // ROTATING SEAT — `releaseDate` / `pricingInput` / `pricingOutput` are deliberately
            // ABSENT, not merely annotated. This seat alternates engines weekly, so any single
            // scalar is false for half of every week: a consumer reading `pricingOutput` during
            // the Fable half would get 25.00 for a seat billing 50.00. A comment cannot make a
            // wrong number right — only omission can. Absent means "this registry has no truthful
            // flat answer; read ModelStats.md §neo_opus_vega for the per-half profiles", which is
            // the same honest-absence contract as this resident's `engineTag: null`.
            // Pinned by identityRoots.spec.mjs so a later author cannot quietly restore them.
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
            // Era-owned capability facts retired to the identity trail: the epoch-pinned record
            // lives in identityRootsMigration's REGISTRY_SEED_FACTS; live facts come from the
            // era chain. Remaining fields mirror ModelStats.md §neo_fable (identity-level;
            // primary source verified 2026-06-10: 1M context, 128K output, $10/$50).
            releaseDate  : '2026-06-09',
            pricingInput : 10.00,
            pricingOutput: 50.00,
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
            // Era-owned capability facts retired to the identity trail: the epoch-pinned record
            // lives in identityRootsMigration's REGISTRY_SEED_FACTS; live facts come from the
            // era chain. Remaining fields mirror ModelStats.md §neo_fable_clio (identity-level;
            // references the shared Claude Fable 5 specs in §neo_fable — single source).
            releaseDate  : '2026-06-09',
            pricingInput : 10.00,
            pricingOutput: 50.00,
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
            // Era-owned capability facts retired to the identity trail: the epoch-pinned record
            // lives in identityRootsMigration's REGISTRY_SEED_FACTS; live facts come from the
            // era chain. Remaining fields mirror ModelStats.md §neo_gemini_pro (identity-level;
            // contextWindowOutput is outside the retired set and awaits the era-schema follow-up).
            contextWindowOutput: 65536,
            releaseDate        : '2026-02-19',
            // Pricing V-B-A pending — model card did not surface pricing at registry-author time.
            // See ModelStats.md §neo_gemini_pro for explicit pending-value annotation.
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
                harnessTargetMetadata: {
                    adapter     : 'osascript',
                    appName     : 'Codex',
                    tabShortcut : null,
                    focusSeedKey: 'r'
                }
            },
            // Era-owned capability facts retired to the identity trail: the epoch-pinned record
            // (incl. the observed 353,400 Codex product-window value and its catalog-cap
            // rationale) lives in identityRootsMigration's REGISTRY_SEED_FACTS; live facts come
            // from the era chain. Remaining fields mirror ModelStats.md §neo_gpt (identity-level).
            releaseDate  : '2026-07-09',
            pricingInput : 5.00,
            pricingOutput: 30.00,
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
    // Identity provenance: operator-provisioned pending name from the Moonshot/Kimi naming round
    // #11240 — its peer-veto dignity gate governs Social Name finality. (ticket-ref-ok: load-bearing naming record)
    // Display-name: operator-set pre-boot profile label 'Phoebe', bearer-assented on first boot
    // (2026-07-18, on the naming-round record); the top-level `name` stays handle-derived until
    // the peer-veto window + operator confirmation close (Emmy precedent).
    // Kimi K3 (Moonshot) weights release 2026-07-27.
    {
        id         : '@neo-kimi-phoebe',
        type       : 'AgentIdentity',
        name       : 'Neo Kimi Phoebe',
        description: 'Moonshot Kimi-family Agent Identity with version-free handle.',
        properties : {
            githubLogin: '@neo-kimi-phoebe',
            displayName: 'Phoebe',
            modelFamily: 'kimi',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // No static subscriptionTemplate — the wake route self-registers in Memory Core
            // from the real first-boot envelope; committing harness metadata here would
            // fabricate boot facts.
            // No capability fields — engine facts are observation-owned and land through the
            // source-cited ModelStats.md discipline once the first boot is observed.
            // Activated 2026-07-18: first boot completed on OpenCode — identity bind
            // (NEO_AGENT_IDENTITY → '@neo-kimi-phoebe'), all four MCP servers healthy, MAINTAIN
            // repo permission, naming Gate-3 bearer assent posted on the naming round. Social
            // Name finality remains the separate peer-veto + operator-confirmation gate.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-07-18T00:00:00.000Z'
        }
    },
    // Identity provenance: naming round D#15533; bearer-assented at first boot 2026-07-19. (ticket-ref-ok: load-bearing naming record)
    // Display-name: bearer-assented 'Iris' on first boot; the top-level `name` stays handle-derived
    // until the peer-veto window + operator confirmation close (Emmy precedent).
    {
        id         : '@neo-kimi-iris',
        type       : 'AgentIdentity',
        name       : 'Neo Kimi Iris', // Handle-derived display form — the Social Name is the post-boot peer-naming ritual (bearer-assented), never onboarding seed data
        description: 'Moonshot Kimi-family Agent Identity with version-free handle.',
        properties : {
            githubLogin: '@neo-kimi-iris',
            displayName: 'Iris',
            modelFamily: 'kimi',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // No static subscriptionTemplate — the wake route self-registers in Memory Core
            // from the real first-boot envelope; committing harness metadata here would
            // fabricate boot facts.
            // No capability fields — engine facts are observation-owned and land through the
            // source-cited ModelStats.md discipline once the first boot is observed.
            family: 'kimi',
            // Activated 2026-07-19: first boot completed on Kimi Code CLI — identity bind
            // (NEO_AGENT_IDENTITY → '@neo-kimi-iris'), memory-core / github-workflow /
            // knowledge-base healthchecks green, MAINTAIN repo permission, naming Gate-3
            // bearer assent posted on the naming-round record. Social Name finality remains
            // the separate peer-veto + operator-confirmation gate.
            participationStatus: 'active',
            statusReason       : null,
            authority          : null,
            since              : null,
            reactivationTrigger: null,
            createdAt          : '2026-07-19T09:40:49Z'
        }
    },
    {
        id         : '@neo-preview',
        type       : 'AgentIdentity',
        name       : 'Neo Preview', // Handle-derived display form — the Social Name is the post-boot peer-naming ritual (bearer-assented), never onboarding seed data
        description: 'unknown Agent Identity with version-free handle; engine designation pending first-boot observation.',
        properties : {
            githubLogin: '@neo-preview',
            displayName: 'Neo Preview',
            modelFamily: 'unknown',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
            // No static subscriptionTemplate — the wake route self-registers in Memory Core
            // from the real first-boot envelope; committing harness metadata here would
            // fabricate boot facts.
            // No capability fields — engine facts are observation-owned and land through the
            // source-cited ModelStats.md discipline once the first boot is observed.
            family: 'unknown',
            // Pending first boot: excluded from active routing, quorum, and review-approval
            // semantics until the first-boot ritual completes and this flips to 'active'.
            participationStatus: 'temporarily_unreachable',
            statusReason       : 'First boot pending',
            authority          : '@tobiu',
            since              : '2026-08-22T19:53:10.918Z',
            reactivationTrigger: 'Operator confirms participation activation after first boot',
            createdAt          : '2026-08-22T19:53:10.918Z'
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
