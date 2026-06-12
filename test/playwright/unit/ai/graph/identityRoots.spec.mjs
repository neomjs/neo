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
 * gets the static template here, mirroring `@neo-opus-ada`. `@neo-claude-opus` is active via a
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
    // runtime from a distinct boot env. @neo-claude-opus uses a self-registered WAKE_SUBSCRIPTION;
    // @neo-fable runs as a fully isolated Claude instance (its own --user-data-dir per @tobiu), whose
    // distinct user-data-dir IS the per-instance address ada/vega's shared static tabShortcut lacks.
    // Asserting absence prevents re-introducing a static route these identities do not need (and
    // which would cross-leak).
    for (const id of ['@neo-claude-opus', '@neo-fable']) {
        test(`${id} carries no static template (active via self-registered runtime subscription)`, () => {
            const entry = findIdentity(id);
            expect(entry).toBeTruthy();
            expect(entry.properties).not.toHaveProperty('subscriptionTemplate');
        });
    }
});
