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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import {IDENTITIES}   from '../../../../../ai/graph/identityRoots.mjs';

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
        harnessTarget        : 'bridge-daemon',
        harnessTargetMetadata: {appName: 'Claude', tabShortcut: '3', focusSeedKey: 'space'}
    };

    // Identities that carry the static, machine-agnostic wake template.
    for (const id of ['@neo-opus-ada', '@neo-opus-vega']) {
        test(`${id} defines the machine-agnostic bridge-daemon wake route`, () => {
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
});

/**
 * @summary Model-lineage and operational-continuity contract for Euclid's Codex identity.
 */
test.describe('ai/graph/identityRoots — Codex model lineage', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    test('@neo-gpt records GPT-5.6 Sol without changing Euclid operational identity (#14901)', () => {
        const entry = findIdentity('@neo-gpt');

        expect(entry).toMatchObject({
            id         : '@neo-gpt',
            name       : 'Euclid',
            description: 'OpenAI Codex (GPT-5.6 Sol) Agent Identity',
            properties : {
                githubLogin        : '@neo-gpt',
                displayName        : 'Euclid',
                modelFamily        : 'gpt',
                family             : 'gpt',
                trustTier          : 'peer-trusted',
                contextWindowInput : 353400,
                thoughtBudget      : 'xhigh',
                releaseDate        : '2026-07-09',
                pricingInput       : 5,
                pricingOutput      : 30,
                participationStatus: 'active'
            }
        });
        expect(entry.properties.sunsetTriggers).toEqual([
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
            harnessTarget        : 'bridge-daemon',
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
 * The verified GitHub display label, pending Social Name assent, pending lifecycle state, and
 * absence of engine facts are deliberate onboarding facts. Workflow checklists and migration
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
            id        : '@neo-gpt-emmy',
            name      : 'Neo GPT Emmy',
            type      : 'AgentIdentity',
            properties: {
                githubLogin        : '@neo-gpt-emmy',
                displayName        : 'Emmy',
                modelFamily        : 'gpt',
                accountType        : 'agent',
                trustTier          : 'peer-trusted',
                participationStatus: 'temporarily_unreachable',
                statusReason       : 'First boot pending',
                reactivationTrigger: 'Operator confirms participation activation after first boot',
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
            '@system'        : '2026-05-27T12:33:17.000Z',
            '@neo-opus-ada'  : '2026-04-23T13:03:46.000Z',
            '@neo-opus-grace': '2026-06-02T21:35:48.405Z',
            '@neo-opus-vega' : '2026-06-04T16:25:47.000Z',
            '@neo-fable'     : '2026-06-10T12:32:43.000Z',
            '@neo-fable-clio': '2026-06-11T20:36:16.000Z',
            '@neo-gemini-pro': '2026-04-23T13:03:46.000Z',
            '@tobiu'         : '2026-04-23T13:03:46.000Z',
            '@neo-gpt'       : '2026-04-28T20:50:04.000Z',
            '@neo-gpt-emmy'  : '2026-07-11T17:42:14.374Z',
            'AGENT:*'        : '2026-04-23T13:03:46.000Z'
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
