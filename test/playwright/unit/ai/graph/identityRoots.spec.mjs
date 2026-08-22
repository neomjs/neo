import {setup} from '../../../setup.mjs';

const appName = 'IdentityRootsTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../src/Neo.mjs';
import * as core             from '../../../../../src/core/_export.mjs';
import {IDENTITIES}          from '../../../../../ai/graph/identityRoots.mjs';
import * as MIGRATION        from '../../../../../ai/graph/identityRootsMigration.mjs';
import {seedAgentIdentities} from '../../../../../ai/scripts/setup/seedAgentIdentities.mjs';

/**
 * @summary The explicit identity projection path owns intentional canonical updates. The registry
 * is authoritative for `createdAt` — a declared value is projected over a divergent persisted
 * stamp, because a rename is identity *continuation* and the node's stamp otherwise records when a
 * seeding run happened rather than when the resident was introduced. Runtime-added properties the
 * registry never declares still survive, because the upsert layers over the existing bag.
 */
test.describe('ai/graph/identityRoots — explicit seed authority (#15431)', () => {
    test('canonical facts update, the registry createdAt wins, and runtime properties survive', async () => {
        let record = {
            id        : '@seed-witness',
            type      : 'AgentIdentity',
            name      : 'Pre-activation identity',
            properties: {
                createdAt          : '2026-07-19T09:40:49.000Z',
                displayName        : 'Neo Kimi Iris',
                participationStatus: 'temporarily_unreachable',
                runtimeWitness     : 'must-survive'
            }
        };

        const graphService = {
            db: {
                storage: {
                    db: {
                        prepare: () => ({get: () => ({data: JSON.stringify(record)})})
                    }
                }
            },
            getNode   : () => record,
            ready     : async () => {},
            upsertNode: update => {
                record = {
                    ...record,
                    ...update,
                    properties: {...record.properties, ...update.properties}
                };
            }
        };

        const processed = await seedAgentIdentities({
            graphService,
            identities: [{
                id        : '@seed-witness',
                type      : 'AgentIdentity',
                name      : 'Iris',
                properties: {
                    createdAt          : '2026-07-19T20:00:00.000Z',
                    displayName        : 'Iris',
                    participationStatus: 'active'
                }
            }],
            log: () => {}
        });

        expect(processed).toBe(1);
        expect(record).toMatchObject({
            name      : 'Iris',
            properties: {
                // The registry's declared stamp, NOT the persisted `09:40:49` — the projection
                // reconciles a divergent node value rather than deferring to it. Deferring is what
                // made a wrong identity age permanently unfixable, since no other writer touches
                // the field.
                createdAt          : '2026-07-19T20:00:00.000Z',
                displayName        : 'Iris',
                participationStatus: 'active',
                // Untouched: the registry never declares it, and omission cannot blank.
                runtimeWitness     : 'must-survive'
            }
        });
    });
});

/**
 * @summary Wake-route invariants for the same-app (Claude Desktop) AgentIdentity roots.
 *
 * Claude-family maintainers run as distinct same-bundle Claude Desktop instances. An identity
 * needs a wake route — either a static `subscriptionTemplate` (so Memory Core auto-bootstrap
 * creates a WAKE_SUBSCRIPTION node) or a self-registered runtime subscription. With neither,
 * `checkSunsetted` reads the absence as a terminal sunset and `resumeHarness` spawns a fresh
 * session every heartbeat — the fresh-session loop.
 *
 * `@neo-opus-vega` (the 3rd same-app harness) had neither and was caught in that loop, so it
 * gets the static template here, mirroring `@neo-opus-ada`. `@neo-opus-grace` is active via a
 * self-registered runtime subscription and deliberately carries NO static template — asserted
 * below so a static route it does not need cannot be re-introduced.
 *
 * The static template stays machine-agnostic: the per-instance address is injected from the boot
 * environment, never committed — a per-operator path in the shared roster would break other forks
 * and checkouts.
 */
test.describe('ai/graph/identityRoots — same-app Claude wake routes', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    const expectedTemplate = {
        trigger              : 'SENT_TO_ME',
        filters              : {priority: 'high'},
        harnessTargetMetadata: {appName: 'Claude', tabShortcut: '3', focusSeedKey: 'space'}
    };

    // Identities that carry the static, machine-agnostic wake template.
    for (const id of ['@neo-opus-ada', '@neo-opus-vega']) {
        test(`${id} defines policy and GUI hints only — never a transport`, () => {
            const entry = findIdentity(id);
            expect(entry, `${id} must be a registered AgentIdentity root`).toBeTruthy();

            const template = entry.properties?.subscriptionTemplate;
            expect(
                template,
                `${id} must define a subscriptionTemplate so auto-bootstrap creates a WAKE_SUBSCRIPTION; ` +
                `a missing one is read by checkSunsetted as a terminal sunset and resumes a fresh session every heartbeat`
            ).toBeTruthy();
            expect(template).toEqual(expectedTemplate);
        });

        test(`${id} commits no per-operator instance address (fork-portability invariant)`, () => {
            const meta = findIdentity(id).properties.subscriptionTemplate.harnessTargetMetadata;
            // The per-instance address is env-injected at boot (the boot envelope), never committed.
            // Asserting their absence guards the invariant that a per-operator filesystem path can
            // never leak into the shared, fork-shared roster.
            expect(meta.instanceAddress, 'instanceAddress must not be committed').toBeUndefined();
            expect(meta.userDataDir,     'userDataDir must not be committed').toBeUndefined();
            expect(meta.addressType,     'addressType must not be committed').toBeUndefined();
        });
    }

    test('NO identity template declares a transport — a committed one can never be deliverable', () => {
        // The regression guard. Every template shipped `harnessTarget: 'bridge-daemon'`, which
        // `buildReceiverManifest` withdraws by design — so `bootstrap()` minted rows the builder
        // was built to reject, reported success, and left the seat reading `status: 'active'`
        // while dark.
        //
        // Re-adding one cannot be made to work by choosing a better value, which is why this
        // asserts ABSENCE rather than a correct target: the two things that make a route
        // deliverable are both un-committable. The signing key is minted server-side at
        // subscribe-time, and the address is per-machine and arrives via the boot envelope. A
        // repository file can hold neither, so transport is derived at bootstrap from
        // DELIVERABLE_HARNESS_TARGET — the same constant the manifest builder enforces.
        const offenders = IDENTITIES
            .filter(entry => entry.properties?.subscriptionTemplate?.harnessTarget !== undefined)
            .map(entry => `${entry.id} → '${entry.properties.subscriptionTemplate.harnessTarget}'`);

        expect(
            offenders,
            `subscriptionTemplate.harnessTarget is derived, never declared. Offending identities:\n${offenders.join('\n')}`
        ).toEqual([]);
    });

    // Self-registered-runtime identities carry NO static template: their wake route registers at
    // runtime from a distinct boot env. @neo-opus-grace uses a self-registered WAKE_SUBSCRIPTION;
    // @neo-fable runs as a fully isolated Claude instance (its own --user-data-dir per @tobiu), whose
    // distinct user-data-dir IS the per-instance address ada/vega's shared static tabShortcut lacks.
    // Asserting absence prevents re-introducing a static route these identities do not need (and
    // which would cross-leak).
    for (const id of ['@neo-opus-grace', '@neo-fable']) {
        test(`${id} carries no static template (active via self-registered runtime subscription)`, () => {
            const entry = findIdentity(id);
            expect(entry).toBeTruthy();
            expect(entry.properties).not.toHaveProperty('subscriptionTemplate');
        });
    }
});

test.describe('ai/graph/identityRoots — model assignments', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    // No identity currently runs a managed engine swap, so modelAssignment is absent everywhere
    // per the IdentitySchema "absent = baseline model" convention. (@neo-opus-ada previously ran a
    // temporary Fable 5 window that was reverted to its baseline Claude Opus 4.8 when access to
    // that model was suspended; the registry now records the baseline with no managed swap.)
    for (const id of ['@neo-opus-ada', '@neo-gpt', '@neo-fable']) {
        test(`${id} omits modelAssignment when no managed engine swap is active`, () => {
            const entry = findIdentity(id);

            expect(entry, `${id} must be a registered AgentIdentity root`).toBeTruthy();
            expect(entry.properties).not.toHaveProperty('modelAssignment');
        });
    }

    // @neo-opus-vega alternates engines weekly under an operator-managed rotation, so every
    // per-engine scalar is false for half of every week — a consumer reading `pricingOutput`
    // during the Fable half would get the Opus number for a seat billing double. Omission is the
    // only honest encoding a flat schema allows, and it is the same contract as this resident's
    // `engineTag: null` in the cockpit roster. Pinned so a future author cannot restore a scalar
    // that reads correct on the day it is written and is wrong three days later.
    test('@neo-opus-vega omits per-engine scalars — a rotating seat has no truthful flat value', () => {
        const entry = findIdentity('@neo-opus-vega');

        expect(entry, '@neo-opus-vega must be a registered AgentIdentity root').toBeTruthy();

        for (const field of ['releaseDate', 'pricingInput', 'pricingOutput']) {
            expect(entry.properties, `${field} must stay ABSENT while the seat rotates — annotating a false scalar is not the same as omitting it`).not.toHaveProperty(field);
        }

        // Absence is scoped to the per-engine facts: identity-level truth still has to be present,
        // or "honest absence" would be indistinguishable from an unfinished entry.
        expect(entry.properties.participationStatus).toBe('active');
        expect(entry.properties.modelFamily).toBe('claude');
        expect(entry.description).toContain('planned');
    });
});

/**
 * @summary Model-lineage and operational-continuity contract for Euclid's Codex identity.
 */
test.describe('ai/graph/identityRoots — Codex model lineage', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    test('@neo-gpt records GPT-5.6 Sol without changing Euclid operational identity (#14901)', () => {
        const entry = findIdentity('@neo-gpt');

        // Identity-level fields stay on the entry; era-owned facts (window, budget, triggers,
        // the family duplicate) retired to the identity trail — asserted below via the
        // migration module's epoch snapshot, the recorded-fact owner.
        expect(entry).toMatchObject({
            id         : '@neo-gpt',
            name       : 'Euclid',
            description: 'OpenAI Codex (GPT-5.6 Sol) Agent Identity',
            properties : {
                githubLogin        : '@neo-gpt',
                displayName        : 'Euclid',
                modelFamily        : 'gpt',
                trustTier          : 'peer-trusted',
                releaseDate        : '2026-07-09',
                pricingInput       : 5,
                pricingOutput      : 30,
                participationStatus: 'active'
            }
        });
        for (const retired of ['family', 'contextWindowInput', 'thoughtBudget', 'tier', 'hosting', 'parallelToolCalls', 'sunsetTriggers']) {
            expect(entry.properties).not.toHaveProperty(retired);
        }

        const facts = MIGRATION.REGISTRY_SEED_FACTS['@neo-gpt'];

        expect(facts.family).toBe('gpt');
        expect(facts.capabilities.contextWindowInput).toBe(353400);
        expect(facts.capabilities.thoughtBudget).toBe('xhigh');
        expect(facts.capabilities.sunsetTriggers).toEqual([
            'OpenAI releases a successor Sol-tier model with material reasoning capability upgrade',
            'GPT-5.x family deprecation'
        ]);
    });
});

test.describe('ai/graph/identityRoots — Codex wake route', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    test('@neo-gpt routes SENT_TO_ME wake delivery through the verified Codex UI adapter (#13287)', () => {
        const entry = findIdentity('@neo-gpt');

        expect(entry, '@neo-gpt must be a registered AgentIdentity root').toBeTruthy();
        expect(entry.properties.subscriptionTemplate).toMatchObject({
            trigger              : 'SENT_TO_ME',
            filters              : {priority: 'high'},
            harnessTargetMetadata: {
                adapter     : 'osascript',
                appName     : 'Codex',
                tabShortcut : null,
                focusSeedKey: 'r'
            }
        });
    });
});

/**
 * @summary Roster pin for the onboarded resident @neo-gpt-emmy: Layer-1 identity invariants only.
 *
 * The verified GitHub display label, active participation, pending Gate-5 Social Name, and
 * absence of engine facts are deliberate first-boot facts. Workflow checklists and migration
 * policy do not belong on the identity node.
 */
test.describe('ai/graph/identityRoots — @neo-gpt-emmy roster pin', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    test('@neo-gpt-emmy is registered exactly once', () => {
        const matches = IDENTITIES.filter(node => node.type === 'AgentIdentity' && node.id === '@neo-gpt-emmy');

        expect(matches).toHaveLength(1);
    });

    test('@neo-gpt-emmy is a registered AgentIdentity root with Layer-1 operational fields', () => {
        const entry = findIdentity('@neo-gpt-emmy');

        expect(entry, '@neo-gpt-emmy must be a registered AgentIdentity root').toBeTruthy();
        expect(entry).toMatchObject({
            id         : '@neo-gpt-emmy',
            name       : 'Neo GPT Emmy',
            type       : 'AgentIdentity',
            description: 'OpenAI GPT-family Agent Identity with version-free handle.',
            properties : {
                githubLogin        : '@neo-gpt-emmy',
                displayName        : 'Emmy',
                modelFamily        : 'gpt',
                accountType        : 'agent',
                trustTier          : 'peer-trusted',
                participationStatus: 'active',
                statusReason       : null,
                authority          : null,
                since              : null,
                reactivationTrigger: null,
                createdAt          : '2026-07-11T17:42:14.374Z'
            }
        });
    });

    test('@neo-gpt-emmy commits no static wake template and no engine facts (observation-owned)', () => {
        const entry = findIdentity('@neo-gpt-emmy');

        for (const key of [
            'contextWindowInput', 'hosting', 'modelAssignment', 'modelDesignation',
            'parallelToolCalls', 'pricingInput', 'pricingOutput', 'releaseDate',
            'socialName', 'subscriptionTemplate', 'sunsetTriggers', 'swarmRole', 'thoughtBudget', 'tier'
        ]) {
            expect(entry.properties).not.toHaveProperty(key);
        }
    });
});

/**
 * @summary Identity nodes describe residents; they never encode staffing utility, assigned roles,
 * onboarding workflow, or migration policy.
 */
test.describe('ai/graph/identityRoots — identity anti-lock-in', () => {
    const agentIdentities = IDENTITIES.filter(node => node.type === 'AgentIdentity');

    test('every root has an immutable creation timestamp instead of import-time now()', () => {
        expect(Object.fromEntries(IDENTITIES.map(entry => [entry.id, entry.properties.createdAt]))).toEqual({
            '@system'         : '2026-05-27T12:33:17.000Z',
            '@neo-opus-ada'   : '2026-04-23T13:03:46.000Z',
            '@neo-opus-grace' : '2026-06-02T21:35:48.405Z',
            '@neo-opus-vega'  : '2026-06-04T16:25:47.000Z',
            '@neo-fable'      : '2026-06-10T12:32:43.000Z',
            '@neo-fable-clio' : '2026-06-11T20:36:16.000Z',
            '@neo-gemini-pro' : '2026-04-23T13:03:46.000Z',
            '@tobiu'          : '2026-04-23T13:03:46.000Z',
            '@neo-gpt'        : '2026-04-28T20:50:04.000Z',
            '@neo-gpt-emmy'   : '2026-07-11T17:42:14.374Z',
            '@neo-kimi-phoebe': '2026-07-18T00:00:00.000Z',
            '@neo-kimi-iris'  : '2026-07-19T09:40:49Z',
            '@neo-preview'    : '2026-08-22T19:53:10.918Z',
            'AGENT:*'         : '2026-04-23T13:03:46.000Z'
        });
    });

    test('every AgentIdentity uses only schema-backed top-level and property keys', () => {
        const allowedTopLevelKeys = new Set(['description', 'id', 'name', 'properties', 'type']),
              allowedPropertyKeys = new Set([
                  'accountType', 'authority', 'benchmarkSnapshot', 'contextWindowInput',
                  'contextWindowOutput', 'createdAt', 'displayName', 'family', 'githubLogin',
                  'hosting', 'license', 'modelAssignment', 'modelFamily', 'parallelToolCalls',
                  'participationStatus', 'pricingInput', 'pricingOutput', 'reactivationTrigger',
                  'releaseDate', 'since', 'statusReason', 'subscriptionTemplate', 'sunsetTriggers',
                  'thoughtBudget', 'tier', 'trustTier'
              ]);

        for (const entry of agentIdentities) {
            const unknownTopLevel   = Object.keys(entry).filter(key => !allowedTopLevelKeys.has(key)),
                  unknownProperties = Object.keys(entry.properties).filter(key => !allowedPropertyKeys.has(key));

            expect(unknownTopLevel, `${entry.id} carries invented top-level identity fields`).toEqual([]);
            expect(unknownProperties, `${entry.id} carries invented identity properties`).toEqual([]);
        }
    });

    test('no AgentIdentity prose frames a peer as capacity, pressure, or a fixed lane', () => {
        const poison = /\b(assigned lane|bandwidth|bottleneck|capacity|force multiplier|generalist|mythos|opening lane|pressure|productivity|redundancy|review coverage|reviewer|staffing utility|throughput|volume 2x|workhorse)\b/i;

        for (const entry of agentIdentities) {
            expect(JSON.stringify(entry), `${entry.id} contains instrumental identity prose`).not.toMatch(poison);
        }
    });
});

/**
 * @summary Roster pin for the onboarded resident @neo-kimi-iris: Layer-1 identity invariants only.
 *
 * Lifecycle state (participationStatus) is deliberately unpinned — status flips are their own
 * PRs. The engine-fact absence assertions hold indefinitely — capability facts live in
 * ModelStats.md by design (observation-owned); the activation flip updated the displayName pin
 * alongside the roster entry.
 */
test.describe('ai/graph/identityRoots — @neo-kimi-iris roster pin', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    test('@neo-kimi-iris is a registered AgentIdentity root with Layer-1 operational fields', () => {
        const entry = findIdentity('@neo-kimi-iris');

        expect(entry, '@neo-kimi-iris must be a registered AgentIdentity root').toBeTruthy();
        expect(entry).toMatchObject({
            id        : '@neo-kimi-iris',
            type      : 'AgentIdentity',
            properties: {
                githubLogin: '@neo-kimi-iris',
                displayName: 'Iris',
                modelFamily: 'kimi',
                accountType: 'agent',
                trustTier  : 'peer-trusted'
            }
        });
    });

    test('@neo-kimi-iris commits no static wake template and no engine facts (observation-owned)', () => {
        const entry = findIdentity('@neo-kimi-iris');

        expect(entry.properties).not.toHaveProperty('subscriptionTemplate');
        expect(entry.properties).not.toHaveProperty('modelAssignment');
        expect(entry.properties).not.toHaveProperty('contextWindowInput');
        expect(entry.properties).not.toHaveProperty('pricingInput');
        expect(entry.properties).not.toHaveProperty('pricingOutput');
    });
});

/**
 * @summary Roster pin for the onboarded resident @neo-preview: Layer-1 identity invariants only.
 *
 * Lifecycle state (participationStatus) is deliberately unpinned — status flips are their own
 * PRs. The engine-fact absence assertions hold until the activation flip lands source-cited
 * capability fields; that PR updates this pin alongside the roster entry.
 */
test.describe('ai/graph/identityRoots — @neo-preview roster pin', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    test('@neo-preview is a registered AgentIdentity root with Layer-1 operational fields', () => {
        const entry = findIdentity('@neo-preview');

        expect(entry, '@neo-preview must be a registered AgentIdentity root').toBeTruthy();
        expect(entry).toMatchObject({
            id        : '@neo-preview',
            type      : 'AgentIdentity',
            properties: {
                githubLogin: '@neo-preview',
                displayName: 'Eos',
                modelFamily: 'unknown',
                accountType: 'agent',
                trustTier  : 'peer-trusted'
            }
        });
    });

    test('@neo-preview commits no static wake template and no engine facts (observation-owned)', () => {
        const entry = findIdentity('@neo-preview');

        expect(entry.properties).not.toHaveProperty('subscriptionTemplate');
        expect(entry.properties).not.toHaveProperty('modelAssignment');
        expect(entry.properties).not.toHaveProperty('contextWindowInput');
        expect(entry.properties).not.toHaveProperty('pricingInput');
        expect(entry.properties).not.toHaveProperty('pricingOutput');
    });
});
