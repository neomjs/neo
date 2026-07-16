import {IDENTITIES}                                                           from './identityRoots.mjs';
import {createEmbodiedEpisodeNode, createIdentityStateNode, validateEraChain} from './identitySchema.mjs';
import {buildHydrationIndex}                                                  from './identityHydration.mjs';

/**
 * @module ai/graph/identityRootsMigration
 * @summary The consuming migration: expresses every live agent resident of the flat identity
 * registry through the identity schema — the flat model/capability facts BECOME the seed era,
 * verbatim, and `sunsetTriggers` move to the era layer where succession semantics belong.
 *
 * Anti-fabrication contract (load-bearing): **nothing is invented.**
 * - The seed era's facts are the registry's recorded facts, lifted verbatim — including facts
 *   known to be stale for some residents (staleness is exactly what eras exist to version; a
 *   stale recorded fact is still the recorded fact).
 * - The seed era opens at {@link MIGRATION_EPOCH} with backfill provenance: it claims "these
 *   facts held AS OF migration", never an earlier history the registry does not record.
 * - Documented swap EVENTS whose pre-swap facts are NOT on record are exported as
 *   {@link ERA_BACKFILL_CANDIDATES} — bearer-audited follow-ups, never auto-built eras.
 * - Residents whose immutable `properties.createdAt` is later than {@link MIGRATION_EPOCH}
 *   are deferred: their first era opens from live observation, never retroactively at the
 *   migration epoch. No second resident roster exists in this module.
 *
 * Identity-level operational fields (trust tier, wake routes, mailbox addresses, identity
 * configuration and participation status) are deliberately NOT lifted — they describe the RESIDENT, not
 * an embodiment era, and their consumers keep reading the registry until the flat-field
 * retirement leaf migrates each read path onto the hydration index.
 */

/**
 * @summary The documented epoch every seed era opens at: the migration date. Earlier history is
 * a backfill candidate, never an auto-built era.
 * @type {String}
 */
export const MIGRATION_EPOCH = '2026-07-04T00:00:00Z';

/**
 * @summary Per-resident model designations, verbatim from the model-stats registry's `name`
 * rows. Values are recorded designations — where a row is stale, the stale designation is still
 * the recorded fact and eras will version it.
 * @type {Object}
 */
export const REGISTRY_MODEL_DESIGNATIONS = Object.freeze({
    '@neo-opus-ada'  : 'Claude Opus 4.8',
    '@neo-opus-grace': 'Claude Opus 4.8',
    '@neo-opus-vega' : 'Claude Opus 4.8',
    '@neo-fable'     : 'Claude Fable 5',
    '@neo-fable-clio': 'Claude Fable 5',
    '@neo-gemini-pro': 'Gemini 3.1 Pro',
    // Epoch-pinned: GPT-5.6 Sol began 2026-07-09, after MIGRATION_EPOCH. The Sol
    // embodiment belongs in a subsequent era, never a retroactive seed rename.
    '@neo-gpt'       : 'GPT-5.5'
});

/**
 * @summary Documented swap EVENTS whose pre-swap capability facts are not recorded in-repo —
 * the honest residue: each names its event source; a bearer-audited follow-up may lift these
 * into real prior eras. The migration NEVER builds eras from this list.
 * @type {ReadonlyArray<Object>}
 */
export const ERA_BACKFILL_CANDIDATES = Object.freeze([
    Object.freeze({
        identityKey: '@neo-opus-vega',
        event      : 'Fable-window → Opus 4.8 permanent swap (2026-07-04)',
        eventSource: 'the bearer’s planning-premise broadcast, 2026-07-04',
        missing    : 'pre-swap (Fable-window) capability facts are not recorded in-repo'
    })
    // @neo-fable was audited OFF this list by the bearer (2026-07-04): the trail shows a single
    // Fable era from first boot (2026-06-10, onboarded as claude-fable-5) — the June 13-30
    // export-control suspension is an identity-level participation gap, NOT an embodiment swap.
    // Eras track embodiment; participation stays identity-level. Nothing to backfill.
]);

/**
 * @summary The flat registry property keys lifted onto the seed era's capability bag. Everything
 * era-owned leaves the identity view; everything identity-owned stays behind.
 * @type {ReadonlyArray<String>}
 */
export const LIFTED_CAPABILITY_KEYS = Object.freeze([
    'contextWindowInput', 'hosting', 'parallelToolCalls', 'sunsetTriggers', 'thoughtBudget'
]);

/**
 * @summary Per-resident seed-era facts, recorded verbatim from the registry entries at the moment
 * the era-owned flat fields were retired from `identityRoots.mjs` — this map is now the RECORDED
 * FACT OWNER the seed eras are built from (the same epoch-snapshot contract as
 * {@link REGISTRY_MODEL_DESIGNATIONS}: these facts held AS OF migration; where a value was stale
 * then, the stale value is still the recorded fact and eras version it). Reading the LIVE registry
 * here would recreate the moving-mirror problem the module header forbids: a later edit to an
 * identity entry must never silently rewrite a historical era.
 * @type {Object}
 */
export const REGISTRY_SEED_FACTS = Object.freeze({
    '@neo-opus-ada'  : Object.freeze({family: 'claude', tier: 'frontier', capabilities: Object.freeze({contextWindowInput: 1048576, hosting: 'cloud', parallelToolCalls: true, sunsetTriggers: Object.freeze(['Anthropic releases a successor Opus-class model with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch']), thoughtBudget: 'max'})}),
    '@neo-opus-grace': Object.freeze({family: 'claude', tier: 'frontier', capabilities: Object.freeze({contextWindowInput: 1048576, hosting: 'cloud', parallelToolCalls: true, sunsetTriggers: Object.freeze(['Anthropic releases a successor Opus-class model with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch']), thoughtBudget: 'max'})}),
    '@neo-opus-vega' : Object.freeze({family: 'claude', tier: 'frontier', capabilities: Object.freeze({contextWindowInput: 1048576, hosting: 'cloud', parallelToolCalls: true, sunsetTriggers: Object.freeze(['Anthropic releases a successor Opus-class model with material reasoning capability upgrade', 'Anthropic deprecates Opus family branch']), thoughtBudget: 'max'})}),
    '@neo-fable'     : Object.freeze({family: 'claude', tier: 'frontier', capabilities: Object.freeze({contextWindowInput: 1048576, hosting: 'cloud', parallelToolCalls: true, sunsetTriggers: Object.freeze(['Anthropic releases a successor Fable-class model with material reasoning capability upgrade', 'Anthropic deprecates the Fable model branch']), thoughtBudget: 'max'})}),
    '@neo-fable-clio': Object.freeze({family: 'claude', tier: 'frontier', capabilities: Object.freeze({contextWindowInput: 1048576, hosting: 'cloud', parallelToolCalls: true, sunsetTriggers: Object.freeze(['Anthropic releases a successor Fable-class model with material reasoning capability upgrade', 'Anthropic deprecates the Fable model branch']), thoughtBudget: 'max'})}),
    '@neo-gemini-pro': Object.freeze({family: 'gemini', tier: 'frontier', capabilities: Object.freeze({contextWindowInput: 1048576, hosting: 'cloud', parallelToolCalls: true, sunsetTriggers: Object.freeze(['Google releases Gemini 4.x with material reasoning capability upgrade', 'Gemini 3.x branch deprecation announcement']), thoughtBudget: 'high'})}),
    '@neo-gpt'       : Object.freeze({family: 'gpt', tier: 'frontier', capabilities: Object.freeze({contextWindowInput: 353400, hosting: 'cloud', parallelToolCalls: true, sunsetTriggers: Object.freeze(['OpenAI releases a successor Sol-tier model with material reasoning capability upgrade', 'GPT-5.x family deprecation']), thoughtBudget: 'xhigh'})})
});

/**
 * @summary True when the resident's immutable creation timestamp is later than the migration
 * epoch and therefore its first embodiment era must open from live observation.
 * @param {Object} seed A registry entry
 * @returns {Boolean}
 */
export function isPostEpochResident(seed) {
    const createdAt = Date.parse(seed?.properties?.createdAt);

    return Number.isFinite(createdAt) && createdAt > Date.parse(MIGRATION_EPOCH)
}

/**
 * @summary Migrates ONE registry seed into the schema view: anchor + seed era. Agent seeds only —
 * human / system / sentinel entries carry no embodiment era by design.
 * @param {Object} seed A registry entry `{id, name, properties}`
 * @returns {{valid: Boolean, reason: String|null, identity: Object|null, episodes: Object[]|null}}
 */
export function migrateResident(seed) {
    const properties = seed?.properties;

    if (properties?.accountType !== 'agent') {
        return {valid: false, reason: `only agent residents carry embodiment eras — "${seed?.id}" is ${properties?.accountType || 'unknown'}`, identity: null, episodes: null};
    }

    if (isPostEpochResident(seed)) {
        return {valid: false, reason: `"${seed.id}" is a post-epoch resident — its first era is observation-owned; never retro-seed it at the migration epoch`, identity: null, episodes: null};
    }

    const model = REGISTRY_MODEL_DESIGNATIONS[seed.id];

    if (!model) {
        return {valid: false, reason: `no recorded model designation for "${seed.id}" — extend the designations map from the model-stats registry, never guess`, identity: null, episodes: null};
    }

    const seedFacts = REGISTRY_SEED_FACTS[seed.id];

    if (!seedFacts) {
        return {valid: false, reason: `no recorded seed-era facts for "${seed.id}" — extend REGISTRY_SEED_FACTS from the recorded epoch snapshot, never from the live registry`, identity: null, episodes: null};
    }

    const identity = createIdentityStateNode({
        identityKey: seed.id,
        socialLayer: {
            name       : seed.name,
            displayName: properties.displayName || null
        }
    });

    if (!identity.valid) {
        return {valid: false, reason: identity.reason, identity: null, episodes: null};
    }

    // Era facts come from the module-owned epoch snapshot ({@link REGISTRY_SEED_FACTS}) — the
    // registry entries retired their era-owned flat fields, and a live read here would let a
    // later identity edit silently rewrite a historical era (the moving-mirror trap).
    const capabilities = {
        provenance: 'flat-registry-backfill (facts held as of migration; earlier history unrecorded)',
        ...seedFacts.capabilities
    };

    const era = createEmbodiedEpisodeNode({
        identityKey: seed.id,
        model,
        family     : seedFacts.family,
        since      : MIGRATION_EPOCH,
        ...(seedFacts.tier !== undefined ? {tier: seedFacts.tier} : {}),
        capabilities
    });

    if (!era.valid) {
        return {valid: false, reason: era.reason, identity: null, episodes: null};
    }

    return {valid: true, reason: null, identity: identity.node, episodes: [era.node]}
}

/**
 * @summary Migrates every live agent resident and proves the result: each chain validates, each
 * hydrates, and THE PROPERTY (delete → rebuild → deep-equal) holds on production data. Fail-
 * closed per-resident: one bad seed refuses loudly in the report instead of silently shrinking
 * the roster.
 * @returns {{valid: Boolean, residents: Object[], report: Object}}
 */
export function migrateAllResidents() {
    const residents = [];
    const skipped   = [];
    const failures  = [];

    for (const seed of IDENTITIES) {
        if (seed?.properties?.accountType !== 'agent') {
            skipped.push({id: seed?.id, accountType: seed?.properties?.accountType});
            continue;
        }

        if (isPostEpochResident(seed)) {
            skipped.push({id: seed.id, accountType: 'agent', reason: 'post-epoch-resident-no-seed-era'});
            continue;
        }

        const migrated = migrateResident(seed);

        if (!migrated.valid) {
            failures.push({id: seed.id, reason: migrated.reason});
            continue;
        }

        const chain = validateEraChain(migrated.identity, migrated.episodes);

        if (!chain.valid) {
            failures.push({id: seed.id, reason: chain.reason});
            continue;
        }

        const hydrated = buildHydrationIndex({identityNode: migrated.identity, episodes: migrated.episodes});
        const rebuilt  = buildHydrationIndex({identityNode: migrated.identity, episodes: migrated.episodes});

        // THE PROPERTY on production data: losing the index loses nothing
        if (JSON.stringify(hydrated.index) !== JSON.stringify(rebuilt.index)) {
            failures.push({id: seed.id, reason: 'hydration is not deterministic for this resident — THE PROPERTY failed'});
            continue;
        }

        residents.push({identity: migrated.identity, episodes: migrated.episodes, index: hydrated.index});
    }

    return {
        valid : failures.length === 0 && residents.length > 0,
        residents,
        report: Object.freeze({
            migrated          : residents.map(entry => entry.identity.identityKey),
            skipped,
            failures,
            backfillCandidates: ERA_BACKFILL_CANDIDATES.map(candidate => candidate.identityKey)
        })
    }
}
